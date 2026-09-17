export function formatRequisitionRemarkDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

export function buildRequisitionPlanRemark(formattedDate) {
  return `แผนผลิต,${formattedDate}`;
}
