import Sidebar from "@/components/Sidebar";
import ProtectedAppLayout from "@/components/ProtectedAppLayout";
import SWRProvider from "@/lib/swrProvider";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }) {
    return (
        <ProtectedAppLayout>
            <SWRProvider>
                <div className="flex min-h-screen">
                    <Sidebar />
                    <main className="flex-1 min-w-0 bg-[#f1f5f9] pb-24 md:pb-0">
                        {children}
                    </main>
                </div>
            </SWRProvider>
        </ProtectedAppLayout>
    );
}
