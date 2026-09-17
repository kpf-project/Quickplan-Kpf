import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { loadBomImportCatalog } from "@/lib/bomImportCatalogServer";
import {
  normalizeMode,
  normalizeStrategy,
} from "@/lib/bomImportHelpers";
import { prepareBomImportProducts } from "@/lib/bomImportServer";
import { requirePermissionKeys } from "@/lib/permissionGuard";

async function writePreparedProduct({ supabaseAdmin, userId, product }) {
  const { data: existingBom, error: bomError } = await supabaseAdmin
    .from("production_boms")
    .select("id")
    .eq("sku_code", product.sku)
    .maybeSingle();
  if (bomError) throw new Error(`โหลด BOM ของ ${product.sku} ไม่สำเร็จ`);

  let bomId = existingBom?.id || null;
  let createdBom = false;
  if (!bomId) {
    const { data, error } = await supabaseAdmin
      .from("production_boms")
      .insert({
        sku_code: product.sku,
        status: product.status,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      throw new Error(`สร้าง BOM ของ ${product.sku} ไม่สำเร็จ`);
    }
    bomId = data.id;
    createdBom = true;
  }

  const { error: formulaError } = await supabaseAdmin
    .from("production_bom_formulas")
    .upsert({
      bom_id: bomId,
      formula_code: "DEFAULT",
      formula_name: "สูตรหลัก",
      is_active: true,
      is_default: true,
      created_by: userId,
      updated_by: userId,
    }, {
      onConflict: "bom_id,formula_code",
    });
  if (formulaError) {
    if (createdBom) {
      await supabaseAdmin.from("production_boms").delete().eq("id", bomId);
    }
    throw new Error(`เตรียมสูตรหลักของ ${product.sku} ไม่สำเร็จ`);
  }

  const { data: latestVersion, error: latestError } = await supabaseAdmin
    .from("production_bom_versions")
    .select("version_no")
    .eq("bom_id", bomId)
    .is("deleted_at", null)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    if (createdBom) {
      await supabaseAdmin.from("production_boms").delete().eq("id", bomId);
    }
    throw new Error(`โหลดเลขเวอร์ชันของ ${product.sku} ไม่สำเร็จ`);
  }

  const { data: version, error: versionError } = await supabaseAdmin
    .from("production_bom_versions")
    .insert({
      bom_id: bomId,
      version_no: Number(latestVersion?.version_no || 0) + 1,
      status: product.status,
      base_batch: product.baseBatch,
      base_output_boxes: product.baseOutputBoxes,
      wip_qty_input_mode: product.wipQtyInputMode,
      formula_code: "DEFAULT",
      formula_name: "สูตรหลัก",
      note: null,
      diff: product.diff,
      changes: product.changes,
      created_by: userId,
    })
    .select("id,version_no,status")
    .single();
  if (versionError || !version?.id) {
    if (createdBom) {
      await supabaseAdmin.from("production_boms").delete().eq("id", bomId);
    }
    throw new Error(`สร้างเวอร์ชัน BOM ของ ${product.sku} ไม่สำเร็จ`);
  }

  const rows = product.items.map((item) => ({
    version_id: version.id,
    material_sku_code: item.material_sku_code,
    material_goods_code: item.material_goods_code,
    qty: item.qty,
    uom_name: item.uom_name,
    notes: item.notes,
    planning_offset_days: item.planning_offset_days,
    calculation_basis: item.calculation_basis,
    headcount_base: item.headcount_base,
    headcount_round_mode: item.headcount_round_mode,
    machine_base: item.machine_base,
    machine_round_mode: item.machine_round_mode,
    dough_set_base: item.dough_set_base,
    dough_set_round_mode: item.dough_set_round_mode,
  }));
  const { error: itemsError } = await supabaseAdmin
    .from("production_bom_items")
    .insert(rows);
  if (itemsError) {
    await supabaseAdmin
      .from("production_bom_versions")
      .delete()
      .eq("id", version.id);
    if (createdBom) {
      await supabaseAdmin.from("production_boms").delete().eq("id", bomId);
    }
    throw new Error(`บันทึกรายการ BOM ของ ${product.sku} ไม่สำเร็จ`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("production_boms")
    .update({
      status: product.status,
      updated_by: userId,
    })
    .eq("id", bomId);
  if (updateError) {
    await supabaseAdmin
      .from("production_bom_versions")
      .delete()
      .eq("id", version.id);
    if (createdBom) {
      await supabaseAdmin.from("production_boms").delete().eq("id", bomId);
    }
    throw new Error(`อัปเดตสถานะ BOM ของ ${product.sku} ไม่สำเร็จ`);
  }

  return {
    sku: product.sku,
    status: "ok",
    version_no: version.version_no,
    bom_status: version.status,
    item_count: rows.length,
    changes: product.changes,
  };
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const body = await readJson(request);
    const products = Array.isArray(body.products) ? body.products : [];
    if (!products.length) {
      return Response.json(
        { error: "ต้องมีข้อมูลสินค้าอย่างน้อย 1 รายการ" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const catalog = await loadBomImportCatalog({ supabaseAdmin, products });
    const prepared = await prepareBomImportProducts({
      products,
      catalog,
      mode: normalizeMode(body.mode),
      strategy: normalizeStrategy(body.strategy),
    });
    if (prepared.hasErrors) {
      return Response.json(prepared, { status: 400 });
    }

    const results = [];
    for (const product of prepared.products) {
      results.push(await writePreparedProduct({
        supabaseAdmin,
        userId,
        product,
      }));
    }

    return Response.json({
      results,
      mode: prepared.mode,
      strategy: prepared.strategy,
    });
  } catch (error) {
    return jsonError(error);
  }
}
