import { jsonError } from "@/lib/adminApi";
import { handleProfile } from "@/features/auth/services/profileService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await handleProfile(request);
  } catch (error) {
    return jsonError(error);
  }
}
