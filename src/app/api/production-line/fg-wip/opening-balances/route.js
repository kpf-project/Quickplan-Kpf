import { jsonError, readJson } from "@/lib/adminApi";
import { createWipOpeningBalanceBatch } from "@/features/production-line/services/fgWipService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    return Response.json(await createWipOpeningBalanceBatch(request, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
