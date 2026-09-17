function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const PIECE_RATE_REPORT_START_DATE = "2026-08-11";

function round3(value) {
  return Number(number(value).toFixed(3));
}

function kindOf(row) {
  const source = String(row?.source_document_type || "");
  if (source === "piece_rate_weigh") return "inbound";
  if (source === "piece_rate_weigh_void") return "inbound_void";
  if (source === "piece_rate_issue") return "issue";
  if (source === "piece_rate_issue_void") return "issue_void";
  if (source === "piece_rate_return") return "return";
  if (source === "piece_rate_waste") return "waste";
  return "other";
}

function emptyFlow() {
  return {
    inboundQty: 0,
    inboundWeightKg: 0,
    issueQty: 0,
    issueWeightKg: 0,
    returnQty: 0,
    returnWeightKg: 0,
    wasteQty: 0,
    wasteWeightKg: 0,
  };
}

function addMovement(flow, row) {
  const kind = kindOf(row);
  if (kind === "inbound" || kind === "inbound_void") {
    const direction = kind === "inbound" ? 1 : -1;
    flow.inboundQty = round3(flow.inboundQty + direction * number(kind === "inbound" ? row.quantity_in : row.quantity_out));
    flow.inboundWeightKg = round3(flow.inboundWeightKg + direction * number(kind === "inbound" ? row.weight_in_kg : row.weight_out_kg));
  } else if (kind === "issue" || kind === "issue_void") {
    const direction = kind === "issue" ? 1 : -1;
    flow.issueQty = round3(flow.issueQty + direction * number(kind === "issue" ? row.quantity_out : row.quantity_in));
    flow.issueWeightKg = round3(flow.issueWeightKg + direction * number(kind === "issue" ? row.weight_out_kg : row.weight_in_kg));
  } else if (kind === "return") {
    flow.returnQty = round3(flow.returnQty + number(row.quantity_in));
    flow.returnWeightKg = round3(flow.returnWeightKg + number(row.weight_in_kg));
  } else if (kind === "waste") {
    flow.wasteQty = round3(flow.wasteQty + number(row.quantity_out));
    flow.wasteWeightKg = round3(flow.wasteWeightKg + number(row.weight_out_kg));
  } else {
    flow.inboundQty = round3(flow.inboundQty + number(row.quantity_in));
    flow.inboundWeightKg = round3(flow.inboundWeightKg + number(row.weight_in_kg));
    flow.issueQty = round3(flow.issueQty + number(row.quantity_out));
    flow.issueWeightKg = round3(flow.issueWeightKg + number(row.weight_out_kg));
  }
}

function lotKey(row) {
  return `${String(row?.product_code || "-").trim().toUpperCase()}|${String(row?.lot_no || "-").trim() || "-"}`;
}

function matchesSearch(row, search) {
  if (!search) return true;
  return [row?.product_code, row?.product_name_snapshot, row?.lot_no]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

export function buildPieceRateDailyMovementReport(allRows, dateFrom, dateTo, rawSearch = "") {
  const search = String(rawSearch || "").trim().toLowerCase();
  const rows = (Array.isArray(allRows) ? allRows : []).filter((row) => (
    String(row?.movement_date || row?.movement_at || "").slice(0, 10) >= PIECE_RATE_REPORT_START_DATE
    && kindOf(row) !== "other"
    && matchesSearch(row, search)
  ));
  const balances = new Map();
  const metadata = new Map();
  const daily = new Map();

  rows.forEach((row) => {
    const date = String(row?.movement_date || row?.movement_at || "").slice(0, 10);
    const key = lotKey(row);
    metadata.set(key, {
      productCode: String(row?.product_code || "-").trim().toUpperCase(),
      productName: String(row?.product_name_snapshot || row?.product_code || "-").trim(),
      lotNo: String(row?.lot_no || "-").trim() || "-",
    });
    if (date < dateFrom) {
      const balance = balances.get(key) || { qty: 0, weightKg: 0 };
      const flow = emptyFlow();
      addMovement(flow, row);
      balance.qty = round3(balance.qty + flow.inboundQty - flow.issueQty + flow.returnQty - flow.wasteQty);
      balance.weightKg = round3(balance.weightKg + flow.inboundWeightKg - flow.issueWeightKg + flow.returnWeightKg - flow.wasteWeightKg);
      balances.set(key, balance);
      return;
    }
    if (date > dateTo) return;
    const dailyKey = `${date}|${key}`;
    if (!daily.has(dailyKey)) daily.set(dailyKey, { date, key, ...emptyFlow() });
    addMovement(daily.get(dailyKey), row);
  });

  const reportRows = [];
  const dailyByDate = new Map();
  daily.forEach((flow) => {
    if (!dailyByDate.has(flow.date)) dailyByDate.set(flow.date, new Map());
    dailyByDate.get(flow.date).set(flow.key, flow);
  });

  const movementDates = [...dailyByDate.keys()]
    .filter((date) => date >= dateFrom && date <= dateTo)
    .sort();
  movementDates.forEach((date) => {
    const flowsForDate = dailyByDate.get(date);
    const keys = [...flowsForDate.keys()].sort();

    keys.forEach((key) => {
      const flow = flowsForDate.get(key);
      const previous = balances.get(key) || { qty: 0, weightKg: 0 };
      const next = {
        qty: round3(previous.qty + flow.inboundQty - flow.issueQty + flow.returnQty - flow.wasteQty),
        weightKg: round3(previous.weightKg + flow.inboundWeightKg - flow.issueWeightKg + flow.returnWeightKg - flow.wasteWeightKg),
      };
      balances.set(key, next);
      reportRows.push({
        ...metadata.get(flow.key),
        reportDate: flow.date,
        openingQty: previous.qty,
        openingWeightKg: previous.weightKg,
        ...Object.fromEntries(Object.entries(flow).filter(([key]) => !["date", "key"].includes(key))),
        actualQty: round3(flow.issueQty - flow.returnQty + flow.wasteQty),
        actualWeightKg: round3(flow.issueWeightKg - flow.returnWeightKg + flow.wasteWeightKg),
        balanceQty: next.qty,
        balanceWeightKg: next.weightKg,
        isCarryForward: false,
      });
    });
  });

  const summary = { count: reportRows.length, openingQty: 0, openingWeightKg: 0, ...emptyFlow(), actualQty: 0, actualWeightKg: 0, balanceQty: 0, balanceWeightKg: 0 };
  const firstOpening = new Map();
  const latestBalance = new Map();
  reportRows.forEach((row) => {
    const key = `${row.productCode}|${row.lotNo}`;
    if (!firstOpening.has(key)) firstOpening.set(key, { qty: row.openingQty, weightKg: row.openingWeightKg });
    latestBalance.set(key, { qty: row.balanceQty, weightKg: row.balanceWeightKg });
    Object.keys(emptyFlow()).forEach((field) => { summary[field] = round3(summary[field] + number(row[field])); });
  });
  summary.openingQty = round3([...firstOpening.values()].reduce((sum, value) => sum + value.qty, 0));
  summary.openingWeightKg = round3([...firstOpening.values()].reduce((sum, value) => sum + value.weightKg, 0));
  summary.actualQty = round3(summary.issueQty - summary.returnQty + summary.wasteQty);
  summary.actualWeightKg = round3(summary.issueWeightKg - summary.returnWeightKg + summary.wasteWeightKg);
  summary.balanceQty = round3([...latestBalance.values()].reduce((sum, value) => sum + value.qty, 0));
  summary.balanceWeightKg = round3([...latestBalance.values()].reduce((sum, value) => sum + value.weightKg, 0));

  return { rows: reportRows, summary };
}

const STOCK_SUMMARY_FIELD_MAP = {
  openingQty: "openingQuantity",
  openingWeightKg: "openingWeightKg",
  inboundQty: "inboundQuantity",
  inboundWeightKg: "inboundWeightKg",
  issueQty: "issueQuantity",
  issueWeightKg: "issueWeightKg",
  returnQty: "returnQuantity",
  returnWeightKg: "returnWeightKg",
  wasteQty: "wasteQuantity",
  wasteWeightKg: "wasteWeightKg",
  actualQty: "actualQuantity",
  actualWeightKg: "actualWeightKg",
  balanceQty: "balanceQuantity",
  balanceWeightKg: "balanceWeightKg",
};

function mapCentralStockValues(source) {
  return Object.fromEntries(
    Object.entries(STOCK_SUMMARY_FIELD_MAP).map(([targetField, sourceField]) => [
      targetField,
      round3(source?.[sourceField]),
    ])
  );
}

export function mapStockSummaryToPieceRateMovementReport(payload, rawSearch = "") {
  const search = String(rawSearch || "").trim().toLowerCase();
  const rows = (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((row) => ({
      productCode: String(row?.productCode || "-").trim().toUpperCase(),
      productName: String(row?.productName || row?.productCode || "-").trim(),
      lotNo: String(row?.lotNo || "-").trim() || "-",
      reportDate: String(row?.issueDate || "").slice(0, 10),
      ...mapCentralStockValues(row),
      isCarryForward: Boolean(row?.isCarryForward),
    }))
    .filter((row) => matchesSearch({
      product_code: row.productCode,
      product_name_snapshot: row.productName,
      lot_no: row.lotNo,
    }, search));

  const summary = {
    count: Number(payload?.summary?.totalCount || rows.length),
    ...mapCentralStockValues(payload?.summary),
  };

  return { rows, summary };
}
