import { handleLogout } from "@/features/auth/services/logoutService";

export async function POST(request) {
  return handleLogout(request);
}
