import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { isPlanningDateEditable, resolveScheduleWorkDate } from "@/lib/planningAdjustment";
import { loadTemplate } from "@/lib/scheduleConfig";
import { loadScheduleSkuCatalog } from "@/lib/scheduleSkuCatalog";
import { loadScheduleImportScopes, isProductInImportScope } from "@/lib/scheduleImportScope";
import { matchesImportProduct, normalizeImportText } from "@/lib/scheduleVisionImport";

export const dynamic = "force-dynamic";

const VISION_METADATA_KEYS = new Set([
  "shiftId", "shiftCode", "shiftName", "workStartTime", "workEndTime",
  "formulaCode", "formulaName", "bomVersionId",
  "formula_code", "formula_name", "bom_version_id",
  "visionProductSources",
]);

async function validateVisionRows(db, planId, rows) {
  const { data: plan, error: planError } = await db
    .from("production_schedule_plans")
    .select("dept_id,template_id,week_start_date,period_end")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan?.template_id || !plan?.dept_id) throw new Error("แผนไม่มีเทมเพลตหรือแผนกสำหรับตรวจ Vision import");

  const template = await loadTemplate(plan.template_id);
  if (!template || String(template.dept_id || "") !== String(plan.dept_id || "")) {
    throw new Error("เทมเพลตของแผนไม่ตรงกับแผนก");
  }
  const sectionMap = new Map((template.sections ?? []).map((section) => [section.id, section]));
  const catalog = await loadScheduleSkuCatalog(db, undefined, plan.dept_id);
  const productByName = new Map(catalog.map((product) => [product.name, product]));
  const sectionIds = [...new Set(rows.map((row) => row.sectionDefId))];
  const scopes = await loadScheduleImportScopes(db, sectionIds);
  const { data: assignedShifts, error: shiftError } = await db
    .from("production_section_shifts")
    .select("section_def_id,shift_id")
    .in("section_def_id", sectionIds)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (shiftError) throw shiftError;
  const shiftKeys = new Set((assignedShifts ?? []).map((row) => `${row.section_def_id}::${row.shift_id}`));

  rows.forEach((row) => {
    const section = sectionMap.get(row.sectionDefId);
    if (!section) throw new Error("Vision import อ้างถึง section ที่ไม่อยู่ในเทมเพลต");
    const dayKey = String(row.dayKey || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || dayKey < plan.week_start_date || dayKey > plan.period_end) {
      throw new Error(`Vision import มีวันที่อยู่นอกช่วงแผน: ${dayKey || "ไม่ทราบ"}`);
    }

    const columns = section.production_schedule_column_defs ?? [];
    const allowedKeys = new Set([...columns.map((column) => column.key), ...VISION_METADATA_KEYS]);
    const rowData = row.rowData && typeof row.rowData === "object" ? row.rowData : {};
    const unknownKey = Object.keys(rowData).find((key) => !allowedKeys.has(key));
    if (unknownKey) throw new Error(`Vision import มีช่องที่ไม่อยู่ในเทมเพลต: ${unknownKey}`);

    const shiftColumn = columns.find((column) => column.col_type === "shift");
    if (shiftColumn && !shiftKeys.has(`${section.id}::${rowData.shiftId}`)) {
      throw new Error(`Vision import มีกะที่ไม่ได้กำหนดให้ section ${section.name}`);
    }

    columns.filter((column) => column.col_type === "sku_picker").forEach((column) => {
      const productName = String(rowData[column.key] || "").trim();
      if (!productName) return;
      const product = productByName.get(productName);
      if (!product) throw new Error(`สินค้า ${productName} ไม่ได้ผูกกับแผนกของแผนนี้`);
      if (!isProductInImportScope(product, scopes.get(section.id))) throw new Error(`สินค้า ${productName} อยู่นอกหมวด Import ของ ${section.name}`);
      const source = rowData.visionProductSources?.find?.(source => source.columnKey === column.key);
      // Explicit review may correct OCR attributes, never department/category/BOM boundaries.
      if (!source || (source.userConfirmed !== true && !matchesImportProduct(source, product, section))) throw new Error(`สินค้า ${productName} ไม่ผ่านเงื่อนไขจากเอกสาร กรุณานำเข้าและตรวจเลือกใหม่`);
      if (!product?.hasBom) throw new Error(`สินค้า ${productName} ไม่มี BOM ที่อนุมัติ`);
      const formulaCode = String(rowData.formulaCode || rowData.formula_code || "").trim().toUpperCase();
      const bomVersionId = rowData.bomVersionId || rowData.bom_version_id;
      const formula = product.formulaOptions.find((item) =>
        item.formula_code === formulaCode && item.bom_version_id === bomVersionId
      );
      if (!formula) throw new Error(`สูตรของสินค้า ${productName} ไม่ตรงกับ BOM ที่อนุมัติ`);
      if (source.userConfirmed !== true && source.sourceFormula && !normalizeImportText(`${formula.formula_code} ${formula.formula_name}`).includes(normalizeImportText(source.sourceFormula))) throw new Error(`สูตรของ ${productName} ไม่ตรงกับเอกสาร`);
      if (column.auto_fill_field && rowData[column.auto_fill_field] !== product.brand) {
        throw new Error(`แบรนด์ของสินค้า ${productName} ไม่ตรงกับ master data`);
      }
    });
  });
}

// GET  /api/production-planning/schedule/plans/[id]/rows?sectionDefId=...&dayKey=...
export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const { id } = await params;
    const sp           = new URL(request.url).searchParams;
    const sectionDefId = sp.get("sectionDefId");
    const dayKey       = sp.get("dayKey");

    const db = getSupabaseAdmin();
    let q = db
      .from("production_schedule_rows")
      .select("id,section_def_id,day_key,display_order,row_data,sub_plan_id,created_at")
      .eq("plan_id", id)
      .order("section_def_id")
      .order("day_key")
      .order("display_order");

    if (sectionDefId) q = q.eq("section_def_id", sectionDefId);
    if (dayKey)       q = q.eq("day_key", dayKey);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/production-planning/schedule/plans/[id]/rows
// Supports single row ({ sectionDefId, dayKey, rowData }) or
// bulk insert ({ rows: [...] })
export async function POST(request, { params }) {
  try {
    const permission = await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const body = await readJson(request);

    const toInsert = Array.isArray(body?.rows) ? body.rows : [body];
    if (!toInsert.length) return NextResponse.json({ ok: true, data: [] });

    const db = getSupabaseAdmin();
    const visionRows = toInsert.filter((row) => row?.visionImport === true);
    if (visionRows.length) await validateVisionRows(db, id, visionRows);
    const editableFromDate = String(body?.editableFromDate || "").slice(0, 10) || null;
    if (editableFromDate) {
      const planResult = await db
        .from("production_schedule_plans")
        .select("week_start_date")
        .eq("id", id)
        .maybeSingle();
      if (planResult.error) return NextResponse.json({ error: planResult.error.message }, { status: 500 });
      const hasPastDate = toInsert.some((row) => !isPlanningDateEditable(
        resolveScheduleWorkDate(planResult.data?.week_start_date, row?.dayKey),
        editableFromDate
      ));
      if (hasPastDate) {
        return NextResponse.json({ error: "ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว" }, { status: 400 });
      }
    }

    // Get current max orders per section+day to place new rows at end
    const keys = [...new Set(toInsert.map((r) => `${r.sectionDefId}::${r.dayKey}`))];
    const orderMap = new Map();
    await Promise.all(
      keys.map(async (k) => {
        const [sid, dk] = k.split("::");
        const { data } = await db
          .from("production_schedule_rows")
          .select("display_order")
          .eq("plan_id", id)
          .eq("section_def_id", sid)
          .eq("day_key", dk)
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        orderMap.set(k, (data?.display_order ?? 0) + 1);
      })
    );

    const rows = toInsert.map((r) => {
      const k = `${r.sectionDefId}::${r.dayKey}`;
      const order = orderMap.get(k) ?? 1;
      orderMap.set(k, order + 1);
      return {
        plan_id:        id,
        section_def_id: r.sectionDefId,
        day_key:        r.dayKey,
        display_order:  r.displayOrder ?? order,
        row_data:       r.rowData ?? {},
        sub_plan_id:    r.subPlanId ?? null,
        created_by:     permission.userId,
      };
    });

    const { data, error } = await db
      .from("production_schedule_rows")
      .insert(rows)
      .select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/production-planning/schedule/plans/[id]/rows
// Body: { rowIds: [...] }  — bulk delete
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const body = await readJson(request);
    const ids = Array.isArray(body?.rowIds) ? body.rowIds : [];
    if (!ids.length) return NextResponse.json({ ok: true });

    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_rows")
      .delete()
      .eq("plan_id", id)
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
