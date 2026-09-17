import { jsonError, readJson } from "@/lib/adminApi";
import {
  issueWipCans,
  listAvailableWipCans,
} from "@/features/production-line/services/fgWipService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await listAvailableWipCans(request));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    return Response.json(await issueWipCans(request, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
