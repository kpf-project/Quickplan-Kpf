import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-product-subcategories-view");
    const departmentId = normalizeParam(new URL(request.url).searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "departmentId is required" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("production_department_product_subcategories")
      .select("id,department_id,name,created_at")
      .eq("department_id", departmentId)
      .order("name", { ascending: true });
    if (error) {
      return Response.json({ error: "Failed to load product subcategories" }, { status: 500 });
    }
    return Response.json({ data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-department-product-subcategories-create");
    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const name = String(body.name || "").trim();
    if (!departmentId || !name || name.length > 80) {
      return Response.json(
        { error: "departmentId and a name up to 80 characters are required" },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("production_department_product_subcategories")
      .insert({ department_id: departmentId, name, created_by: userId })
      .select("id,department_id,name,created_at")
      .single();
    if (error) {
      const duplicate = String(error.code || "") === "23505";
      return Response.json(
        { error: duplicate ? "มีหมวดหมู่ย่อยชื่อนี้ในแผนกแล้ว" : "Failed to create product subcategory" },
        { status: duplicate ? 409 : 500 }
      );
    }
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-product-subcategories-edit");
    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const subcategoryId = normalizeParam(body.subcategoryId);
    const name = String(body.name || "").trim();
    if (!departmentId || !subcategoryId || !name || name.length > 80) {
      return Response.json(
        { error: "departmentId, subcategoryId and a name up to 80 characters are required" },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("production_department_product_subcategories")
      .update({ name })
      .eq("id", subcategoryId)
      .eq("department_id", departmentId)
      .select("id,department_id,name,created_at")
      .maybeSingle();
    if (error) {
      const duplicate = String(error.code || "") === "23505";
      return Response.json(
        { error: duplicate ? "มีหมวดหมู่ย่อยชื่อนี้ในแผนกแล้ว" : "Failed to update product subcategory" },
        { status: duplicate ? 409 : 500 }
      );
    }
    if (!data) {
      return Response.json({ error: "ไม่พบหมวดหมู่ย่อยในแผนกนี้" }, { status: 404 });
    }
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-product-subcategories-delete");
    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const subcategoryId = normalizeParam(body.subcategoryId);
    if (!departmentId || !subcategoryId) {
      return Response.json(
        { error: "departmentId and subcategoryId are required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin
      .from("production_department_products")
      .select("sku_code", { count: "exact", head: true })
      .eq("department_id", departmentId)
      .eq("subcategory_id", subcategoryId);
    if (countError) {
      return Response.json({ error: "Failed to inspect product subcategory" }, { status: 500 });
    }

    let linkCount = 0;
    try {
      const linkCountResult = await admin
        .from("production_department_product_subcategory_links")
        .select("sku_code", { count: "exact", head: true })
        .eq("department_id", departmentId)
        .eq("subcategory_id", subcategoryId);
      if (!linkCountResult.error) {
        linkCount = Number(linkCountResult.count || 0);
      }
    } catch {}

    const effectiveCount = Math.max(Number(count || 0), linkCount);
    if (effectiveCount > 0) {
      return Response.json(
        { error: `ลบไม่ได้ เนื่องจากยังมีสินค้าอยู่ในหมวดนี้ ${effectiveCount} รายการ`, assignedCount: effectiveCount },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from("production_department_product_subcategories")
      .delete()
      .eq("id", subcategoryId)
      .eq("department_id", departmentId)
      .select("id")
      .maybeSingle();
    if (error) {
      const inUse = String(error.code || "") === "23503";
      return Response.json(
        { error: inUse ? "ลบไม่ได้ เนื่องจากยังมีสินค้าอยู่ในหมวดนี้" : "Failed to delete product subcategory" },
        { status: inUse ? 409 : 500 }
      );
    }
    if (!data) {
      return Response.json({ error: "ไม่พบหมวดหมู่ย่อยในแผนกนี้" }, { status: 404 });
    }
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
