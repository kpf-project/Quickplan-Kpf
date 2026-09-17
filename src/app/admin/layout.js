import Sidebar from "@/components/Sidebar";
import ProtectedAppLayout from "@/components/ProtectedAppLayout";
import AppTabsShell from "@/components/AppTabsShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }) {
    return (
        <ProtectedAppLayout>
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 min-w-0 bg-[#f8f9fa] pb-24 md:pb-0">
                    <AppTabsShell>{children}</AppTabsShell>
                </main>
            </div>
        </ProtectedAppLayout>
    );
}
