import { jsonError } from "@/lib/adminApi";
import { handleLogin } from "@/features/auth/services/loginService";

export async function POST(request) {
  try {
    return await handleLogin(request);
  } catch (error) {
    return jsonError(error);
  }
}
