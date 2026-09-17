function resolvePrinterForJob(config = {}, job = "weight-scale") {
  if (job === "piece-rate") {
    return String(config.pieceRatePrinterName || "").trim();
  }
  return String(config.printerName || "").trim();
}

module.exports = { resolvePrinterForJob };
