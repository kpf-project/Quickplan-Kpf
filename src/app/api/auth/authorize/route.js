import { jsonError } from "@/lib/adminApi";
import {
  handleAuthorize,
  handleAuthorizeError,
} from "@/features/auth/services/authorizeService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return await handleAuthorize(request);
  } catch (error) {
    handleAuthorizeError(error, request);
    return jsonError(error);
  }
}
