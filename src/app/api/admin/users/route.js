import { jsonError } from "@/lib/adminApi";
import {
  listUsers,
  createUser,
  updateUser,
} from "@/features/admin/services/usersService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await listUsers(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    return await createUser(request);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    return await updateUser(request);
  } catch (error) {
    return jsonError(error);
  }
}
