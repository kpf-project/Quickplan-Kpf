// Historical pail documents use their saved conversion, never the current ERP profile.
export function legacyPackingHistory(rows) {
  return rows.map(row => ({
    id: row.id, origin: "legacy", work_date: row.production_date, lot_no: row.lot_no,
    product_code: row.fg_product_code, product_name: row.fg_product_name_snapshot,
    created_at: row.created_at, sourceSummary: "ดูการเบิกในประวัติหน้าเดิม",
    payload: {
      units: [{ code: "pail", label: "ปี๊บ", factor: 1, precision: 0 },
        { code: "outer", label: row.fg_unit_snapshot || "กล่อง", factor: row.tins_per_case_snapshot, precision: 0 }],
      produced: { outer: row.fg_case_qty }, producedBase: row.fg_tin_qty,
      closing: { pail: row.wip_tin_qty }, sources: [],
    },
  }));
}
