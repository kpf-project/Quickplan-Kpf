"use client";

import dynamic from "next/dynamic";

const BomEditorPageClient = dynamic(() => import("@/features/production-line/components/BomEditorPageClient"), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  ),
  ssr: false,
});

export default BomEditorPageClient;
