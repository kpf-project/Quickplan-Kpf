export const WIP_OPENING_UNITS = Object.freeze([
  { code: "sachet", label: "ซองแยก", precision: 0 },
  { code: "pack", label: "แพ็คเต็ม", precision: 0 },
  { code: "pail", label: "ปี๊บ", precision: 0 },
  { code: "kg", label: "กก.", precision: 3 },
]);

export function pendingWipOpeningKey(userId, requestId) {
  return `wip-opening-pending:${userId}:${requestId}`;
}

export function readPendingWipOpening(storage, userId) {
  const prefix = pendingWipOpeningKey(userId, "");
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const payload = JSON.parse(storage.getItem(key));
    normalizeWipOpening(payload);
    if (key !== pendingWipOpeningKey(userId, payload.requestId)) throw new Error("ข้อมูลคำขอค้างไม่ตรงกัน กรุณาติดต่อผู้ดูแลระบบ");
    return payload;
  }
  return null;
}

export function normalizeWipOpening(input) {
  const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input?.requestId || "") || !uuid.test(input?.departmentId || "")) invalid("กรุณาเลือกแผนกและเลขคำขอให้ถูกต้อง");
  const date = input.openingDate;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) invalid("วันที่ตั้งต้นไม่ถูกต้อง");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) invalid("บันทึกได้ครั้งละ 1–50 รายการ");
  const seen = new Set();
  const entries = [];
  for (const row of input.items) {
    const productCode = typeof row?.productCode === "string" ? row.productCode.trim().toUpperCase() : "";
    const lotNo = typeof row?.lotNo === "string" ? row.lotNo.trim().toUpperCase() : "";
    const notes = row?.notes ?? "";
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,99}$/.test(productCode) || !lotNo || lotNo.length > 100 || /[\x00-\x1f\x7f]/.test(lotNo)) invalid("ระบุสินค้าและ LOT ให้ครบ");
    if (typeof notes !== "string" || notes.length > 500) invalid("หมายเหตุยาวเกิน 500 ตัวอักษร");
    if (!row.quantities || typeof row.quantities !== "object" || Array.isArray(row.quantities)
      || Object.keys(row.quantities).some(key => !WIP_OPENING_UNITS.some(unit => unit.code === key))) invalid("หน่วยไม่ถูกต้อง");
    let positive = false;
    for (const unit of WIP_OPENING_UNITS) {
      const raw = row.quantities[unit.code];
      if (raw === "" || raw === undefined || raw === null) continue;
      const text = typeof raw === "number" || typeof raw === "string" ? String(raw) : "invalid";
      const pattern = unit.precision ? /^\d{1,9}(\.\d{1,3})?$/ : /^\d{1,9}$/;
      if (!pattern.test(text)) invalid(`${unit.label}: ต้องเป็นจำนวนไม่ติดลบ${unit.precision ? " ทศนิยมไม่เกิน 3 ตำแหน่ง" : "เต็มจำนวน"}`);
      const quantity = Number(text);
      if (!quantity) continue;
      positive = true;
      const key = JSON.stringify([productCode, lotNo, unit.code]);
      if (seen.has(key)) invalid("สินค้า LOT และหน่วยซ้ำในชุดนี้");
      seen.add(key);
      entries.push({ productCode, lotNo, unit: unit.code, quantity, notes: notes.trim() });
    }
    if (!positive) invalid("แต่ละรายการต้องมีจำนวนมากกว่า 0 อย่างน้อยหนึ่งหน่วย");
  }
  entries.sort((a, b) => JSON.stringify([a.productCode, a.lotNo, a.unit]).localeCompare(JSON.stringify([b.productCode, b.lotNo, b.unit]), "en"));
  return { requestId: input.requestId.toLowerCase(), departmentId: input.departmentId.toLowerCase(), openingDate: date, entries };
}
