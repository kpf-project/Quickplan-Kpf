import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

const WIP_QTY_INPUT_MODES = {
  UNIT: "unit",
  BATCH: "batch",
};

function normalizeWipQtyInputMode(value, fallback = WIP_QTY_INPUT_MODES.BATCH) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WIP_QTY_INPUT_MODES.UNIT || normalized === WIP_QTY_INPUT_MODES.BATCH) {
    return normalized;
  }
  return fallback;
}

function isMissingWipQtyModeColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("wip_qty_input_mode");
}

function formatValue(item) {
  const qty = item.qty ?? 0;
  const uom = item.uom_name || "-";
  const goodsCode = item.material_goods_code ? ` · trade ${item.material_goods_code}` : "";
  const notes = item.notes ? ` · ${item.notes}` : "";
  return `${qty} ${uom}${goodsCode}${notes}`;
}

function buildLabel(code, nameMap) {
  const name = nameMap.get(code);
  return name ? `${code} - ${name}` : code;
}

function buildDiff(previousItems, nextItems, nameMap) {
  const added = [];
  const updated = [];
  const removed = [];
  const changes = [];

  const prevMap = new Map(previousItems.map((item) => [item.material_sku_code, item]));
  const nextMap = new Map(nextItems.map((item) => [item.material_sku_code, item]));

  nextMap.forEach((item, code) => {
    const prev = prevMap.get(code);
    if (!prev) {
      const label = buildLabel(code, nameMap);
      const after = formatValue(item);
      added.push({ label, before: "-", after });
      changes.push(`เพิ่ม ${label}`);
      return;
    }
    const changed =
      Number(prev.qty) !== Number(item.qty) ||
      (prev.material_goods_code || "") !== (item.material_goods_code || "") ||
      (prev.uom_name || "") !== (item.uom_name || "") ||
      (prev.notes || "") !== (item.notes || "");
    if (changed) {
      const label = buildLabel(code, nameMap);
      const before = formatValue(prev);
      const after = formatValue(item);
      updated.push({ label, before, after });
      changes.push(`ปรับ ${label}`);
    }
  });

  prevMap.forEach((item, code) => {
    if (nextMap.has(code)) return;
    const label = buildLabel(code, nameMap);
    const before = formatValue(item);
    removed.push({ label, before, after: "-" });
    changes.push(`ลบ ${label}`);
  });

  return {
    diff: {
      added,
      updated,
      removed,
    },
    changes,
  };
}

async function fetchNamesMap(supabaseAdmin, codes) {
  if (!codes.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name")
    .in("sku_code", codes);
  if (error) {
    throw new Error("Failed to load product names");
  }
  const map = new Map();
  (data ?? []).forEach((row) => {
    map.set(row.sku_code, row.sku_name || "");
  });
  return map;
}

export async function POST(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const { id } = await params;
    const normalizedId = normalizeParam(id);
    if (!normalizedId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const body = await readJson(request);
    const noteOverride = normalizeParam(body?.note);

    const supabaseAdmin = getSupabaseAdmin();
    let { data: sourceVersion, error: sourceError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,status,base_batch,base_output_boxes,wip_qty_input_mode")
      .eq("id", normalizedId)
      .is("deleted_at", null)
      .maybeSingle();
    if (sourceError && isMissingWipQtyModeColumn(sourceError)) {
      const fallback = await supabaseAdmin
        .from("production_bom_versions")
        .select("id,bom_id,version_no,status,base_batch,base_output_boxes")
        .eq("id", normalizedId)
        .is("deleted_at", null)
        .maybeSingle();
      sourceVersion = fallback.data;
      sourceError = fallback.error;
    }
    if (sourceError) {
      return Response.json({ error: "Failed to load version" }, { status: 500 });
    }
    if (!sourceVersion) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    const [sourceItemsResult, lastVersionResult] = await Promise.all([
      supabaseAdmin
        .from("production_bom_items")
        .select("material_sku_code,material_goods_code,substitute_material_sku_codes,qty,uom_name,notes")
        .eq("version_id", sourceVersion.id),
      supabaseAdmin
        .from("production_bom_versions")
        .select("id,version_no")
        .eq("bom_id", sourceVersion.bom_id)
        .is("deleted_at", null)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (sourceItemsResult.error) {
      return Response.json({ error: "Failed to load version items" }, { status: 500 });
    }
    if (lastVersionResult.error) {
      return Response.json({ error: "Failed to load latest version" }, { status: 500 });
    }
    const sourceItems = sourceItemsResult.data;
    const lastVersion = lastVersionResult.data;

    let previousItems = [];
    if (lastVersion?.id) {
      const { data: prevItems, error: prevError } = await supabaseAdmin
        .from("production_bom_items")
        .select("material_sku_code,material_goods_code,substitute_material_sku_codes,qty,uom_name,notes")
        .eq("version_id", lastVersion.id);
      if (prevError) {
        return Response.json({ error: "Failed to load previous items" }, { status: 500 });
      }
      previousItems = prevItems ?? [];
    }

    const nextItems = (sourceItems ?? []).map((item) => ({
      material_sku_code: item.material_sku_code,
      material_goods_code: item.material_goods_code ?? null,
      substitute_material_sku_codes: item.substitute_material_sku_codes ?? [],
      qty: item.qty,
      uom_name: item.uom_name ?? "",
      notes: item.notes ?? "",
    }));

    const nameMap = await fetchNamesMap(
      supabaseAdmin,
      Array.from(
        new Set(
          [...previousItems, ...nextItems].map((item) => item.material_sku_code)
        )
      )
    );
    const { diff, changes } = buildDiff(previousItems, nextItems, nameMap);

    const nextVersionNo = (lastVersion?.version_no ?? 0) + 1;
    const status = "pending_review";
    const note =
      noteOverride || `ย้อนกลับไปใช้ v${sourceVersion.version_no}`;
    const resolvedWipQtyInputMode = normalizeWipQtyInputMode(
      sourceVersion.wip_qty_input_mode,
      WIP_QTY_INPUT_MODES.BATCH
    );

    const { error: updateBomError } = await supabaseAdmin
      .from("production_boms")
      .update({ status, updated_by: userId })
      .eq("id", sourceVersion.bom_id);
    if (updateBomError) {
      return Response.json({ error: "Failed to update bom" }, { status: 500 });
    }

    const versionInsert = {
      bom_id: sourceVersion.bom_id,
      version_no: nextVersionNo,
      status,
      base_batch: Number(sourceVersion.base_batch ?? 1) || 1,
      base_output_boxes: Number(sourceVersion.base_output_boxes ?? 1) || 1,
      wip_qty_input_mode: resolvedWipQtyInputMode,
      note,
      diff,
      changes,
      created_by: userId,
    };
    let { data: newVersion, error: versionError } = await supabaseAdmin
      .from("production_bom_versions")
      .insert(versionInsert)
      .select("id,version_no,status,base_batch,base_output_boxes,wip_qty_input_mode,note,diff,changes,created_by,created_at")
      .maybeSingle();
    if (versionError && isMissingWipQtyModeColumn(versionError)) {
      const fallback = await supabaseAdmin
        .from("production_bom_versions")
        .insert({
          bom_id: sourceVersion.bom_id,
          version_no: nextVersionNo,
          status,
          base_batch: Number(sourceVersion.base_batch ?? 1) || 1,
          base_output_boxes: Number(sourceVersion.base_output_boxes ?? 1) || 1,
          note,
          diff,
          changes,
          created_by: userId,
        })
        .select("id,version_no,status,base_batch,base_output_boxes,note,diff,changes,created_by,created_at")
        .maybeSingle();
      newVersion = fallback.data;
      versionError = fallback.error;
    }
    if (versionError) {
      return Response.json({ error: "Failed to create version" }, { status: 500 });
    }

    if (nextItems.length) {
      const rows = nextItems.map((item) => ({
        version_id: newVersion.id,
        material_sku_code: item.material_sku_code,
        material_goods_code: item.material_goods_code,
        substitute_material_sku_codes: item.substitute_material_sku_codes,
        qty: item.qty,
        uom_name: item.uom_name,
        notes: item.notes,
      }));
      const { error: itemsError } = await supabaseAdmin
        .from("production_bom_items")
        .insert(rows);
      if (itemsError) {
        return Response.json({ error: "Failed to create bom items" }, { status: 500 });
      }
    }

    return Response.json({ version: newVersion });
  } catch (error) {
    return jsonError(error);
  }
}
