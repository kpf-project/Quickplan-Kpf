import { jsonError } from "@/lib/adminApi";
import { listFgPackingReport } from "@/features/production-line/services/fgWipService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await listFgPackingReport(request));
  } catch (error) {
    return jsonError(error);
  }
}
