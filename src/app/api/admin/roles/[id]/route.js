import { jsonError } from "@/lib/adminApi";
import { updateRole, deleteRole } from "@/features/admin/services/rolesService";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const resolvedParams = await params;
    return await updateRole(request, { id: resolvedParams?.id });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const resolvedParams = await params;
    return await deleteRole(request, { id: resolvedParams?.id });
  } catch (error) {
    return jsonError(error);
  }
}
