import ProtectedRouteClientGuard from "@/components/ProtectedRouteClientGuard";
import GlobalNavigationGuard from "@/components/GlobalNavigationGuard";
import { requireProtectedSession } from "@/lib/auth/requireProtectedSession";
import AiAssistantDrawer from "@/components/chat/AiAssistantDrawer";
import SWRProvider from "@/lib/swrProvider";

export default async function ProtectedAppLayout({ children }) {
  await requireProtectedSession();

  return (
    <SWRProvider>
      <ProtectedRouteClientGuard />
      <GlobalNavigationGuard />
      {children}
      <AiAssistantDrawer />
    </SWRProvider>
  );
}
