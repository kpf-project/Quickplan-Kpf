import {
  buildScaleConfigFromEnv,
  buildStableReadConfigFromEnv,
  normalizeScaleConfig,
  normalizeStableReadConfig,
  validateScaleConfig,
} from "@/lib/scale/config";
import {
  buildScaleDiagnosticContext,
  logScaleDiagnostic,
  toErrorMetadata,
} from "@/lib/scale/diagnostics";
import { readStableScaleWeight } from "@/lib/scale/modbusTcpClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readRequestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request) {
  const body = await readRequestBody(request);
  const config = normalizeScaleConfig(body?.config || {}, buildScaleConfigFromEnv());
  const stableConfig = normalizeStableReadConfig(
    body?.stableConfig || {},
    buildStableReadConfigFromEnv()
  );
  const diagnosticContext = buildScaleDiagnosticContext({
    source: "scale.stable",
    request,
    config,
    stableConfig,
  });
  const validationErrors = validateScaleConfig(config);

  logScaleDiagnostic("log", "scale.stable.request", diagnosticContext);

  if (validationErrors.length > 0) {
    logScaleDiagnostic("warn", "scale.stable.validation_failed", {
      ...diagnosticContext,
      validationErrors,
    });
    return Response.json(
      { ok: false, error: "Invalid scale configuration.", details: validationErrors },
      { status: 400 }
    );
  }

  try {
    const reading = await readStableScaleWeight(config, stableConfig, diagnosticContext);
    logScaleDiagnostic("log", "scale.stable.success", {
      ...diagnosticContext,
      stableWeightKg: reading.stableWeightKg,
      sampleCount: reading.sampleCount,
    });
    return Response.json({ ok: true, data: reading });
  } catch (error) {
    logScaleDiagnostic("error", "scale.stable.failed", {
      ...diagnosticContext,
      ...toErrorMetadata(error),
    });
    return Response.json(
      { ok: false, error: error?.message || "Failed to capture a stable weight." },
      { status: 500 }
    );
  }
}
