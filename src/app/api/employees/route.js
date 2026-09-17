import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listEmployees } from "@/features/employees/services/employeesService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listEmployees(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
