import { jsonError, readJson } from "@/lib/adminApi";
import { createFgWipDocument, listFgWipDocuments } from "@/features/production-line/services/fgWipService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await listFgWipDocuments(request));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    return Response.json(await createFgWipDocument(request, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
