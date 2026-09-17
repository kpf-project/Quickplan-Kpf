export function createBarcodeScanQueue({ cooldownMs = 0 } = {}) {
  const pendingBarcodes = new Set();
  const completedAtByBarcode = new Map();
  let tail = Promise.resolve();

  const normalizeBarcode = (value) => String(value || "").trim().toUpperCase();

  return {
    enqueue(barcode, operation) {
      const normalizedBarcode = normalizeBarcode(barcode);
      const lastCompletedAt = completedAtByBarcode.get(normalizedBarcode) || 0;
      const isCoolingDown = cooldownMs > 0 && Date.now() - lastCompletedAt < cooldownMs;
      if (!normalizedBarcode || pendingBarcodes.has(normalizedBarcode) || isCoolingDown) {
        return {
          accepted: false,
          completion: Promise.resolve(null),
        };
      }

      pendingBarcodes.add(normalizedBarcode);
      const completion = tail
        .then(() => operation(normalizedBarcode))
        .then((result) => {
          completedAtByBarcode.set(normalizedBarcode, Date.now());
          return result;
        })
        .finally(() => {
          pendingBarcodes.delete(normalizedBarcode);
        });

      tail = completion.catch(() => null);

      return {
        accepted: true,
        completion,
      };
    },

    isPending(barcode) {
      return pendingBarcodes.has(normalizeBarcode(barcode));
    },
  };
}
