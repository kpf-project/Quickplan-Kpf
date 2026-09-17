import { jsonError, readJson } from "@/lib/adminApi";
import {
  cancelFgWipWasteLog,
  createFgWipWasteLog,
  listFgWipWasteLogs,
} from "@/features/production-line/services/fgWipService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await listFgWipWasteLogs(request));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    return Response.json(await createFgWipWasteLog(request, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await readJson(request);
    return Response.json(await cancelFgWipWasteLog(request, body));
  } catch (error) {
    return jsonError(error);
  }
}
