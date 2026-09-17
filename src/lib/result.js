export function ok(data, meta = {}) {
  return { ok: true, data, ...meta };
}

export function fail(error, meta = {}) {
  return { ok: false, error, ...meta };
}

export function createAppError(code, message, details) {
  return { code, message, details };
}

export function toJsonResponse(result) {
  if (result?.ok) {
    return Response.json(result.data, { status: result.status ?? 200 });
  }
  const status = result?.status ?? 500;
  const message = result?.error?.message ?? "Unexpected error";
  const payload = { error: message };
  if (result?.error?.details) {
    payload.details = result.error.details;
  }
  return Response.json(payload, { status });
}
