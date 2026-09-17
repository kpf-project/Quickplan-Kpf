import { buildScaleConfigFromEnv, normalizeScaleConfig, validateScaleConfig } from "@/lib/scale/config";
import {
  buildScaleDiagnosticContext,
  getActiveScaleAttempts,
  logScaleDiagnostic,
  toErrorMetadata,
} from "@/lib/scale/diagnostics";
import {
  createScaleClient,
  disconnectScaleClient,
  readScaleWeightOnce,
} from "@/lib/scale/modbusTcpClient";
import { probeScaleTcpConnection } from "@/lib/scale/tcpProbe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeSseEvent(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const config = normalizeScaleConfig(
    Object.fromEntries(searchParams.entries()),
    buildScaleConfigFromEnv()
  );
  const diagnosticContext = buildScaleDiagnosticContext({
    source: "scale.stream",
    request,
    config,
  });
  const validationErrors = validateScaleConfig(config);

  logScaleDiagnostic("log", "scale.stream.request", diagnosticContext);

  if (validationErrors.length > 0) {
    logScaleDiagnostic("warn", "scale.stream.validation_failed", {
      ...diagnosticContext,
      validationErrors,
    });
    return Response.json(
      { ok: false, error: "Invalid scale configuration.", details: validationErrors },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  let client = null;
  let closed = false;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    closed = true;
    await disconnectScaleClient(client, diagnosticContext);
    client = null;
    logScaleDiagnostic("log", "scale.stream.cleanup", diagnosticContext);
  };

  const abortListener = () => {
    void cleanup();
  };

  request.signal.addEventListener("abort", abortListener);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName, payload) => {
        controller.enqueue(encoder.encode(encodeSseEvent(eventName, payload)));
      };

      try {
        const activeAttempts = getActiveScaleAttempts(config.host, config.port);
        if (activeAttempts.length > 0) {
          logScaleDiagnostic("warn", "scale.stream.busy", {
            ...diagnosticContext,
            activeAttempts,
          });
          send("device-error", {
            connected: false,
            state: "error",
            message: "เครื่องชั่งกำลังถูกใช้งานอยู่ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
            readAt: new Date().toISOString(),
          });
          return;
        }

        logScaleDiagnostic("log", "scale.stream.connecting", diagnosticContext);
        send("status", {
          connected: false,
          state: "connecting",
          message: `Connecting to ${config.host}:${config.port}`,
          readAt: new Date().toISOString(),
        });

        client = await createScaleClient(config, diagnosticContext, {
          onRetryScheduled: ({
            retryDelayMs,
            attemptNumber,
            maxAttempts,
          }) => {
            send("status", {
              connected: false,
              state: "connecting",
              message: `กำลังลองเชื่อมต่อใหม่ (${attemptNumber + 1}/${maxAttempts})`,
              retryDelayMs,
              readAt: new Date().toISOString(),
            });
          },
        });

        if (closed) {
          await disconnectScaleClient(client, diagnosticContext);
          return;
        }

        logScaleDiagnostic("log", "scale.stream.connected", diagnosticContext);
        send("status", {
          connected: true,
          state: "connected",
          message: "Scale connection established.",
          readAt: new Date().toISOString(),
        });

        while (!closed) {
          const reading = await readScaleWeightOnce(config, client, {
            ...diagnosticContext,
            stage: "stream-read",
          });
          send("weight", reading);
          await sleep(config.pollIntervalMs);
        }
      } catch (error) {
        if (!closed) {
          const tcpProbe = await probeScaleTcpConnection(config, {
            timeoutMs: Math.min(config.timeoutMs, 3000),
          });
          logScaleDiagnostic("error", "scale.stream.failed", {
            ...diagnosticContext,
            tcpProbe,
            ...toErrorMetadata(error),
          });
          const errorMessage = tcpProbe.ok
            ? error?.message || "Realtime scale preview failed."
            : `TCP ไปยัง ${config.host}:${config.port} ไม่สำเร็จ (${tcpProbe.errorCode || tcpProbe.errorMessage})`;
          send("device-error", {
            connected: false,
            state: "error",
            message: errorMessage,
            readAt: new Date().toISOString(),
          });
        }
      } finally {
        await cleanup();
        request.signal.removeEventListener("abort", abortListener);
        try {
          controller.close();
        } catch {
          // The stream may already be closed by the browser.
        }
      }
    },
    async cancel() {
      await cleanup();
      request.signal.removeEventListener("abort", abortListener);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
