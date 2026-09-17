import ProtectedRouteClientGuard from "@/components/ProtectedRouteClientGuard";
import { requireProtectedSession } from "@/lib/auth/requireProtectedSession";

export default async function ProtectedAppLayout({ children }) {
  await requireProtectedSession();

  return (
    <>
      <ProtectedRouteClientGuard />
      {children}
    </>
  );
}
