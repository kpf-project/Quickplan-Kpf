import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listAttendance } from "@/features/attendance/services/attendanceService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listAttendance(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
