import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadScheduleSkuCatalog } from "@/lib/scheduleSkuCatalog";
import { loadScheduleImportScopes, scheduleScopeKey } from "@/lib/scheduleImportScope";

export const dynamic = "force-dynamic";

async function context(db, id) {
  const { data: section, error } = await db.from("production_schedule_section_defs")
    .select("id,template_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!section) throw Object.assign(new Error("ไม่พบ Section"), { status: 404 });
  const { data: template, error: templateError } = await db.from("production_schedule_templates")
    .select("dept_id").eq("id", section.template_id).maybeSingle();
  if (templateError) throw templateError;
  if (!template?.dept_id) throw new Error("กรุณาผูกเทมเพลตกับแผนกก่อนตั้งขอบเขตสินค้า");
  const { data: categories, error: categoryError } = await db.from("production_department_product_subcategories")
    .select("id,name").eq("department_id", template.dept_id).order("name");
  if (categoryError) throw categoryError;
  return { deptId: template.dept_id, categories: categories ?? [] };
}

export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { deptId, categories } = await context(db, id);
    const [scopes, products] = await Promise.all([
      loadScheduleImportScopes(db, [id]), loadScheduleSkuCatalog(db, undefined, deptId),
    ]);
    return Response.json({ ok: true, data: { categories, subcategoryIds: scopes.get(id), products } });
  } catch (error) { return jsonError(error); }
}

export async function PUT(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    if (!Array.isArray(body?.subcategoryIds) || !body.subcategoryIds.every(value => typeof value === "string")) {
      return Response.json({ error: "subcategoryIds ต้องเป็นรายการหมวดหมู่" }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { categories } = await context(db, id);
    const subcategoryIds = [...new Set(body.subcategoryIds)];
    if (subcategoryIds.some(id => !categories.some(category => category.id === id))) {
      return Response.json({ error: "หมวดหมู่ไม่ได้อยู่ในแผนกของ Section นี้" }, { status: 400 });
    }
    const { error } = await db.from("system_settings").upsert({
      setting_key: scheduleScopeKey(id), setting_value: { subcategoryIds },
      updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });
    if (error) throw error;
    return Response.json({ ok: true, data: { subcategoryIds } });
  } catch (error) { return jsonError(error); }
}
