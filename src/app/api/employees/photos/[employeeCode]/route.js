import { ApiError, getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";

export const dynamic = "force-dynamic";

const MAX_IMAGE_DATA_LENGTH = 750_000;
const IMAGE_DATA_PATTERN = /^data:image\/(webp|jpeg|png);base64,/i;

function normalizeEmployeeCode(value) {
  return String(value || "").trim().toUpperCase();
}

export async function GET(request, { params }) {
  try {
    await requireTaskPermission(request, "hr-employee-photos-view");
    const { employeeCode: rawEmployeeCode } = await params;
    const employeeCode = normalizeEmployeeCode(rawEmployeeCode);
    const { data, error } = await getSupabaseAdmin()
      .from("employee_photos")
      .select("image_data, updated_at")
      .eq("employee_code", employeeCode)
      .maybeSingle();
    if (error) throw new ApiError(500, "โหลดรูปพนักงานไม่สำเร็จ", error.message);
    if (!data?.image_data) throw new ApiError(404, "ไม่พบรูปพนักงาน");

    const [metadata, base64Data] = data.image_data.split(",", 2);
    const contentType = metadata.match(/^data:([^;]+)/i)?.[1] || "image/webp";
    return new Response(Buffer.from(base64Data, "base64"), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        ETag: `\"${data.updated_at}\"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const permission = await requireTaskPermission(request, "hr-employee-photos-upload");
    const { employeeCode: rawEmployeeCode } = await params;
    const employeeCode = normalizeEmployeeCode(rawEmployeeCode);
    const body = await request.json();
    const imageData = String(body?.imageData || "");
    if (!employeeCode) throw new ApiError(400, "กรุณาระบุรหัสพนักงาน");
    if (!IMAGE_DATA_PATTERN.test(imageData)) throw new ApiError(400, "รองรับเฉพาะรูป WebP, JPEG หรือ PNG");
    if (imageData.length > MAX_IMAGE_DATA_LENGTH) throw new ApiError(413, "รูปมีขนาดใหญ่เกินไป");

    const { error } = await getSupabaseAdmin().from("employee_photos").upsert({
      employee_code: employeeCode,
      image_data: imageData,
      updated_by: permission.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "employee_code" });
    if (error) throw new ApiError(500, "บันทึกรูปพนักงานไม่สำเร็จ", error.message);
    return Response.json({ ok: true, imageUrl: `/api/employees/photos/${encodeURIComponent(employeeCode)}` });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireTaskPermission(request, "hr-employee-photos-delete");
    const { employeeCode: rawEmployeeCode } = await params;
    const employeeCode = normalizeEmployeeCode(rawEmployeeCode);
    const { error } = await getSupabaseAdmin().from("employee_photos").delete().eq("employee_code", employeeCode);
    if (error) throw new ApiError(500, "ลบรูปพนักงานไม่สำเร็จ", error.message);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
