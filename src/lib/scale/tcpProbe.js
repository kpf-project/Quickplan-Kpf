import "server-only";

import net from "node:net";

export async function probeScaleTcpConnection(
  config,
  { timeoutMs = 3000 } = {}
) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startedAt = Date.now();
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        ...result,
        durationMs: Date.now() - startedAt,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      finish({
        ok: true,
        host: config.host,
        port: config.port,
      });
    });

    socket.once("timeout", () => {
      finish({
        ok: false,
        host: config.host,
        port: config.port,
        errorName: "Error",
        errorMessage: "TCP probe timed out",
        errorCode: "ETIMEDOUT",
        errorErrno: null,
      });
    });

    socket.once("error", (error) => {
      finish({
        ok: false,
        host: config.host,
        port: config.port,
        errorName: error?.name || "Error",
        errorMessage: error?.message || "TCP probe failed",
        errorCode: error?.code || null,
        errorErrno: error?.errno || null,
      });
    });

    try {
      socket.connect(config.port, config.host);
    } catch (error) {
      finish({
        ok: false,
        host: config.host,
        port: config.port,
        errorName: error?.name || "Error",
        errorMessage: error?.message || "TCP probe failed",
        errorCode: error?.code || null,
        errorErrno: error?.errno || null,
      });
    }
  });
}
