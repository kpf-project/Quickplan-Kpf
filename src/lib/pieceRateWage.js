export function calculatePieceRateWageAmount({
  wageBasis,
  normalizedKgAmount,
  countValue,
  payRatePerKg,
  payRatePerUnit,
}) {
  const amount = wageBasis === "count"
    ? Number(countValue || 0) * Number(payRatePerUnit || 0)
    : Number(normalizedKgAmount || 0) * Number(payRatePerKg || 0);

  return Number.isFinite(amount) ? Number(amount.toFixed(4)) : 0;
}

export function applyPieceRatePayPeriodWage(rows = []) {
  const result = rows.map((row) => ({ ...row }));
  const groups = new Map();

  result.forEach((row, index) => {
    if ((row.docStatus || "active") !== "active") return;
    const wageBasis = row.wageBasis === "count" ? "count" : "kg";
    const rate = Number(wageBasis === "count" ? row.payRatePerUnit : row.payRatePerKg);
    if (!Number.isFinite(rate)) return;
    const employee = row.rawEmployeeCode || row.employeeCode || "-";
    const day = row.groupDayKey || row.workDate || String(row.loggedAt || "").slice(0, 10) || "-";
    const dayOfMonth = Number(String(day).slice(8, 10));
    const payPeriod = Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31
      ? `${String(day).slice(0, 7)}-${dayOfMonth <= 15 ? "01-15" : "16-end"}`
      : day;
    const key = [employee, payPeriod, wageBasis, rate].join("::");
    const group = groups.get(key) || [];
    group.push(index);
    groups.set(key, group);
  });

  groups.forEach((indexes) => {
    indexes.sort((left, right) => {
      const timeDifference = (Date.parse(result[left].loggedAt || "") || 0)
        - (Date.parse(result[right].loggedAt || "") || 0);
      return timeDifference || String(result[left].docNo || "").localeCompare(String(result[right].docNo || ""));
    });

    let cumulativeUnits = 0;
    let creditedUnits = 0;
    indexes.forEach((index) => {
      const row = result[index];
      const wageBasis = row.wageBasis === "count" ? "count" : "kg";
      const units = Number(wageBasis === "count" ? row.countValue : row.normalizedKgAmount) || 0;
      const rate = Number(wageBasis === "count" ? row.payRatePerUnit : row.payRatePerKg) || 0;
      cumulativeUnits = Number((cumulativeUnits + units).toFixed(6));
      const fraction = cumulativeUnits - Math.floor(cumulativeUnits);
      const nextCreditedUnits = wageBasis === "kg" && fraction < 0.5
        ? Math.floor(cumulativeUnits)
        : cumulativeUnits;
      row.wageAmount = Number(((nextCreditedUnits - creditedUnits) * rate).toFixed(4));
      creditedUnits = nextCreditedUnits;
    });
  });

  return result;
}
