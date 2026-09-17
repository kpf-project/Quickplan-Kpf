export const CLIENT_DIAGNOSTICS_QUEUE_KEY = "kpf-client-diagnostics-queue-v1";
const MAX_QUEUE_SIZE = 50;

export function readClientDiagnosticQueue(storage) {
  if (!storage?.getItem) return [];
  try {
    const parsed = JSON.parse(storage.getItem(CLIENT_DIAGNOSTICS_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUE_SIZE) : [];
  } catch {
    return [];
  }
}

function writeClientDiagnosticQueue(storage, queue) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(CLIENT_DIAGNOSTICS_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // Diagnostics must never interrupt the application.
  }
}

export function enqueueClientDiagnostic(storage, diagnostic) {
  const queue = readClientDiagnosticQueue(storage);
  queue.push(diagnostic);
  writeClientDiagnosticQueue(storage, queue);
  return diagnostic?.incidentId || "";
}

function markFirstDeliveryFailure(item, failure) {
  if (item?.metadata?.firstDeliveryFailure) return item;
  return {
    ...item,
    metadata: {
      ...(item?.metadata || {}),
      firstDeliveryFailure: failure,
    },
  };
}

export async function flushClientDiagnosticQueue(storage, transport, {
  now = () => new Date().toISOString(),
} = {}) {
  const queue = readClientDiagnosticQueue(storage);

  while (queue.length > 0) {
    const current = queue[0];
    try {
      const response = await transport(current);
      if (response?.ok) {
        queue.shift();
        writeClientDiagnosticQueue(storage, queue);
        continue;
      }

      const status = Number(response?.status || 0);
      if (status >= 400 && status < 500) {
        queue.shift();
        writeClientDiagnosticQueue(storage, queue);
        continue;
      }

      queue[0] = markFirstDeliveryFailure(current, {
        at: now(),
        reason: "server-error",
        status,
      });
      writeClientDiagnosticQueue(storage, queue);
      break;
    } catch {
      queue[0] = markFirstDeliveryFailure(current, {
        at: now(),
        reason: "network-error",
      });
      writeClientDiagnosticQueue(storage, queue);
      break;
    }
  }

  return queue.length;
}

