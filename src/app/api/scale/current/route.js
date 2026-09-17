import { buildScaleConfigFromEnv, normalizeScaleConfig, validateScaleConfig } from "@/lib/scale/config";
import {
  buildScaleDiagnosticContext,
  getActiveScaleAttempts,
  logScaleDiagnostic,
  toErrorMetadata,
} from "@/lib/scale/diagnostics";
import { readScaleWeightOnce } from "@/lib/scale/modbusTcpClient";
import { probeScaleTcpConnection } from "@/lib/scale/tcpProbe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getScaleConfigFromRequest(request) {
  const { searchParams } = new URL(request.url);
  return normalizeScaleConfig(
    Object.fromEntries(searchParams.entries()),
    buildScaleConfigFromEnv()
  );
}

export async function GET(request) {
  const config = getScaleConfigFromRequest(request);
  const diagnosticContext = buildScaleDiagnosticContext({
    source: "scale.current",
    request,
    config,
  });
  const validationErrors = validateScaleConfig(config);

  logScaleDiagnostic("log", "scale.current.request", diagnosticContext);

  if (validationErrors.length > 0) {
    logScaleDiagnostic("warn", "scale.current.validation_failed", {
      ...diagnosticContext,
      validationErrors,
    });
    return Response.json(
      { ok: false, error: "Invalid scale configuration.", details: validationErrors },
      { status: 400 }
    );
  }

  const activeAttempts = getActiveScaleAttempts(config.host, config.port);
  if (activeAttempts.length > 0) {
    logScaleDiagnostic("warn", "scale.current.busy", {
      ...diagnosticContext,
      activeAttempts,
    });
    return Response.json(
      {
        ok: false,
        error: "เครื่องชั่งกำลังถูกใช้งานอยู่ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
      },
      { status: 409 }
    );
  }

  try {
    const reading = await readScaleWeightOnce(config, null, {
      ...diagnosticContext,
      logSuccessfulReads: true,
    });
    logScaleDiagnostic("log", "scale.current.success", {
      ...diagnosticContext,
      weightKg: reading.weightKg,
      rawValue: reading.rawValue,
    });
    return Response.json({ ok: true, data: reading });
  } catch (error) {
    const tcpProbe = await probeScaleTcpConnection(config, {
      timeoutMs: Math.min(config.timeoutMs, 3000),
    });
    logScaleDiagnostic("error", "scale.current.failed", {
      ...diagnosticContext,
      tcpProbe,
      ...toErrorMetadata(error),
    });

    const errorMessage = tcpProbe.ok
      ? error?.message || "Failed to read the scale."
      : `TCP ไปยัง ${config.host}:${config.port} ไม่สำเร็จ (${tcpProbe.errorCode || tcpProbe.errorMessage})`;

    return Response.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
