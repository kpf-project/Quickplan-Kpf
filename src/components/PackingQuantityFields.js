"use client";

export default function PackingQuantityFields({ units, value, onChange, disabled = false, prefix = "จำนวน" }) {
  return units.slice().reverse().map(unit => <label key={unit.code}>
    <span>{unit.label}{units.length > 1 ? (unit.code === "carton" || unit.code === "pack" ? "เต็ม" : "แยก") : ""}</span>
    <input aria-label={`${prefix} ${unit.label}`} type="number" min="0" step={unit.precision ? "0.001" : "1"}
      disabled={disabled} value={value[unit.code] ?? ""} onChange={event => onChange({ ...value, [unit.code]: event.target.value })} />
  </label>);
}
