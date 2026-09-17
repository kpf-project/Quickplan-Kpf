import { jsonError } from "@/lib/adminApi";
import {
  listDepartments,
  createDepartment,
} from "@/features/admin/services/departmentsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await listDepartments(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    return await createDepartment(request);
  } catch (error) {
    return jsonError(error);
  }
}
