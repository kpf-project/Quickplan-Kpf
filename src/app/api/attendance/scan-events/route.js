import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listAttendanceScanEvents } from "@/features/attendance/services/attendanceScanEventsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listAttendanceScanEvents(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
