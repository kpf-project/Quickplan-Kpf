import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadTemplate } from "@/lib/scheduleConfig";
import { loadScheduleSkuCatalog } from "@/lib/scheduleSkuCatalog";
import { buildImportSignature, matchesImportProduct, normalizeImportText } from "@/lib/scheduleVisionImport";
import { loadScheduleImportScopes, isProductInImportScope } from "@/lib/scheduleImportScope";
import { importAliasConfirmationKey } from "@/lib/scheduleImportAliasConfirmation";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);
    const body = await readJson(request);
    const deptId = String(body?.deptId || "").trim();
    const templateId = String(body?.templateId || "").trim();
    const requestedAliases = Array.isArray(body?.aliases) ? body.aliases : [];
    if (!deptId || !templateId || !requestedAliases.length) {
      return NextResponse.json({ error: "deptId, templateId และ aliases จำเป็นต้องมี" }, { status: 400 });
    }

    const template = await loadTemplate(templateId);
    if (!template || String(template.dept_id || "") !== deptId) {
      return NextResponse.json({ error: "เทมเพลตไม่ตรงกับแผนก" }, { status: 400 });
    }

    const productColumns = new Map();
    (template.sections ?? []).forEach((section) => {
      (section.production_schedule_column_defs ?? [])
        .filter((column) => column.col_type === "sku_picker")
        .forEach((column) => productColumns.set(`${section.id}::${column.key}`, true));
    });

    const db = getSupabaseAdmin();
    const catalog = await loadScheduleSkuCatalog(db, undefined, deptId);
    const scopes = await loadScheduleImportScopes(db, template.sections.map(section => section.id));
    const productMap = new Map(catalog.map((product) => [product.skuCode, product]));

    const aliasMap = new Map();
    for (const alias of requestedAliases) {
      if (alias?.userConfirmed !== true) throw new Error("ต้องเลือกยืนยันสินค้าด้วยตนเองก่อนจำคู่สินค้า");
      const sectionDefId = String(alias?.sectionDefId || "").trim();
      const productColumnKey = String(alias?.productColumnKey || "").trim();
      const skuCode = String(alias?.skuCode || "").trim();
      const formulaCode = String(alias?.formulaCode || "").trim().toUpperCase();
      const product = productMap.get(skuCode);
      if (!isProductInImportScope(product, scopes.get(sectionDefId))) throw new Error("สินค้านอกหมวดที่ Section อนุญาตสำหรับ Import");
      const section = template.sections.find(section => section.id === sectionDefId);
      if (!matchesImportProduct(alias, product, section)) throw new Error("สินค้าไม่ตรงชนิด รส แบรนด์ หรือขนาดจากเอกสาร");
      const formula = product?.formulaOptions?.find((item) => item.formula_code === formulaCode);
      if (alias.sourceFormula && !normalizeImportText(`${formula?.formula_code || ""} ${formula?.formula_name || ""}`).includes(normalizeImportText(alias.sourceFormula))) throw new Error("สูตรไม่ตรงกับสูตรที่ระบุในเอกสาร");
      if (!productColumns.has(`${sectionDefId}::${productColumnKey}`) || !product || !formula) {
        throw new Error("Alias มี section, SKU หรือสูตรที่ไม่ถูกต้อง");
      }
      const signature = buildImportSignature({
        brand: alias?.sourceBrand,
        product: alias?.sourceProduct,
        size: alias?.sourceSize,
      });
      if (!signature) continue;

      const dedupeKey = `${deptId}::${sectionDefId}::${productColumnKey}::${signature}`;
      aliasMap.set(dedupeKey, {
        dept_id: deptId,
        section_def_id: sectionDefId,
        product_column_key: productColumnKey,
        source_signature: signature,
        source_brand: String(alias?.sourceBrand || "").trim() || null,
        source_product: String(alias?.sourceProduct || "").trim() || null,
        source_size: String(alias?.sourceSize || "").trim() || null,
        sku_code: skuCode,
        formula_code: formulaCode,
        created_by: permission.userId,
        updated_by: permission.userId,
      });
    }

    const uniqueAliases = Array.from(aliasMap.values());
    if (!uniqueAliases.length) {
      return NextResponse.json({ ok: true, data: { count: 0 } });
    }

    const { error } = await db
      .from("production_schedule_import_aliases")
      .upsert(uniqueAliases, { onConflict: "dept_id,section_def_id,product_column_key,source_signature" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: confirmationError } = await db.from("system_settings").upsert(uniqueAliases.map(alias => ({
      setting_key: importAliasConfirmationKey(deptId, alias),
      setting_value: { userConfirmed: true }, updated_by: permission.userId, updated_at: new Date().toISOString(),
    })), { onConflict: "setting_key" });
    if (confirmationError) throw confirmationError;
    return NextResponse.json({ ok: true, data: { count: uniqueAliases.length } });
  } catch (error) {
    return jsonError(error);
  }
}
