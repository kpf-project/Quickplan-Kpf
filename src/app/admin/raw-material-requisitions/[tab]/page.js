import { redirect } from "next/navigation";

export default function RawMaterialRequisitionsTabRedirect({ params }) {
  const tab = params?.tab || "requisition";
  redirect(`/raw-material-requisitions/${tab}`);
}
