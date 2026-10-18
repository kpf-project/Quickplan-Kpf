import { ApiError, jsonError, readJson } from "@/lib/adminApi";
import { openingContext, openingProductPage, recordOpening } from "@/lib/wip-opening-service";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("view") || "context";
    const departmentId = params.get("departmentId");
    if (!["context", "products", "history"].includes(view)) throw new ApiError(400, "มุมมองไม่ถูกต้อง");
    if (view !== "context" && !departmentId) throw new ApiError(400, "กรุณาเลือกแผนก");
    const { db, departments, canManage, permission } = await openingContext(request, false, departmentId);
    let result;
    if (view === "context") result = { departments, canManage, userId: permission.userId };
    else if (view === "products") result = await openingProductPage(db, departmentId, { page: params.get("page") || "1", search: params.get("search") || "" });
    else {
      const page = params.get("page") || "1";
      if (!/^[1-9]\d{0,3}$/.test(page)) throw new ApiError(400, "หน้าไม่ถูกต้อง");
      const { data, error, count } = await db.from("production_wip_opening_documents")
        .select("id,request_id,opening_date,actor_id,created_at,production_wip_opening_entries(product_code,product_name,lot_no,unit,quantity,notes)", { count: "exact" })
        .eq("department_id", departmentId).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range((Number(page) - 1) * 25, Number(page) * 25 - 1);
      if (error) throw new ApiError(503, "โหลดประวัติยอดตั้งต้นกลางไม่ได้ กรุณาตรวจการติดตั้ง SQL");
      const scope = await db.from("production_wip_opening_scopes").select("opening_date").eq("department_id", departmentId).maybeSingle();
      if (scope.error) throw new ApiError(503, "ตรวจสอบวันที่ตั้งต้นไม่ได้");
      result = { data, totalCount: count, openingDate: scope.data?.opening_date || null };
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error?.status === 403) return jsonError(new ApiError(403, "ไม่มีสิทธิ์เข้าถึงยอดตั้งต้นกลางของแผนกนี้ กรุณาติดต่อผู้ดูแลระบบ"));
    return jsonError(error?.status ? error : new ApiError(503, "โหลดข้อมูลยอดตั้งต้นกลางไม่ได้"));
  }
}

export async function POST(request) {
  try { return Response.json(await recordOpening(request, await readJson(request)), { status: 201 }); }
  catch (error) { return jsonError(error?.status ? error : new ApiError(503, "ยังยืนยันผลบันทึกไม่ได้ กรุณาลองคำขอเดิม")); }
}
