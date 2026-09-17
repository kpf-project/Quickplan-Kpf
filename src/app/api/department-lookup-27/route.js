import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listDepartmentLookup27 } from "@/features/department-lookup-27/services/departmentLookup27Service";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listDepartmentLookup27(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
