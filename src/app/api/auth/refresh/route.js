import { jsonError } from "@/lib/adminApi";
import { handleRefresh } from "@/features/auth/services/refreshService";

export async function POST(request) {
  try {
    return await handleRefresh(request);
  } catch (error) {
    return jsonError(error);
  }
}
