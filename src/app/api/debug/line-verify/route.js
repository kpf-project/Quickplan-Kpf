import { ApiError, jsonError } from "@/lib/adminApi";

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function getLineLoginClientId() {
  const clientId =
    normalizeString(process.env.LINE_LOGIN_CHANNEL_ID) ??
    normalizeString(process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID);
  if (!clientId) {
    throw new ApiError(500, "LINE_LOGIN_CHANNEL_ID is missing");
  }
  return clientId;
}

async function verifyIdToken(idToken, clientId) {
  const params = new URLSearchParams({
    id_token: idToken,
    client_id: clientId,
  });

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({
    error_description: "LINE response could not be parsed",
  }));

  return { response, payload };
}

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const idToken = normalizeString(body?.id_token);
    if (!idToken) {
      throw new ApiError(400, "id_token is required");
    }

    const clientId = normalizeString(body?.client_id) || getLineLoginClientId();

    const { response, payload } = await verifyIdToken(idToken, clientId);

    if (!response.ok) {
      throw new ApiError(
        response.status,
        "LINE verify error",
        payload?.error_description ?? payload?.error ?? "unknown"
      );
    }

    return Response.json(
      {
        ok: true,
        payload,
      },
      { status: response.status }
    );
  } catch (error) {
    return jsonError(error);
  }
}
