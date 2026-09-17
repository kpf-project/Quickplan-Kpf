import { jsonError, readJson } from "@/lib/adminApi";
import { createAttendanceScanEvent } from "@/features/attendance/services/attendanceScanService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await createAttendanceScanEvent(request, body);
    return Response.json(result, { status: result.duplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
