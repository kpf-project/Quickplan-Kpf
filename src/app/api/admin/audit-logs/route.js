import { jsonError } from "@/lib/adminApi";
import { listAuditLogs } from "@/features/admin/services/auditLogsService";

export async function GET(request) {
  try {
    return await listAuditLogs(request);
  } catch (error) {
    return jsonError(error);
  }
}
