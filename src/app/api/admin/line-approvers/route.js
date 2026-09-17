import { jsonError } from "@/lib/adminApi";
import {
  listLineApprovers,
  updateLineApprover,
} from "@/features/admin/services/lineApproversService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await listLineApprovers(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    return await updateLineApprover(request);
  } catch (error) {
    return jsonError(error);
  }
}
