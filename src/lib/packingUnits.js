const DEFINITIONS = {
  sachet: { label: "ซอง", aliases: ["ซอง"] },
  pack: { label: "แพ็ค", aliases: ["แพ็ค", "แพ็ก", "แพค", "PACK"] },
  pail: { label: "ปี๊บ", aliases: ["ปี๊บ", "ปีบ"] },
  carton: { label: "ลัง", aliases: ["ลัง", "กล่อง", "CASE", "CARTON"] },
  kg: { label: "กก.", aliases: ["กก.", "กก", "กิโลกรัม", "KG", "KGS"] },
};

export function buildPackingUnits(productCode, rows) {
  const mapped = new Map();
  const sameSku = rows.filter(row => String(row.SKU_CODE || row.sku_code || "").trim().toUpperCase() === productCode.trim().toUpperCase());
  for (const row of sameSku) {
    for (const suffix of ["", "_1", "_2"]) {
      const name = String(row[`UTQ_NAME${suffix}`] || "").trim().toUpperCase();
      if (!name) continue;
      // Decorations describe packaging; only numeric ERP fields supply conversion factors.
      const token = name.match(/^(ซอง|แพ็ค|แพ็ก|แพค|ปี๊บ|ปีบ|ลัง|กล่อง|กิโลกรัม|กก\.?|KGS?|PACK|CASE|CARTON)(?=$|[\s(/X×*])/u)?.[1] || name;
      const entry = Object.entries(DEFINITIONS).find(([, definition]) => definition.aliases.includes(token));
      if (!entry) throw new Error(`ยังไม่รองรับหน่วย ${name} กรุณาตรวจข้อมูลหน่วยสินค้า`);
      const [code, { label }] = entry;
      const factor = Number(row[`UTQ_QTY${suffix}`]);
      if (!Number.isFinite(factor) || factor <= 0) throw new Error(`ไม่พบอัตราแปลงหน่วย ${label}`);
      if (mapped.has(code) && mapped.get(code).factor !== factor) throw new Error(`อัตราหน่วย ${label} ขัดแย้งกัน กรุณาตรวจ Trade Code`);
      mapped.set(code, { code, label, factor, precision: code === "kg" ? 3 : 0 });
    }
  }
  const units = [...mapped.values()].sort((a, b) => a.factor - b.factor || a.code.localeCompare(b.code));
  if (!units.length) throw new Error("ไม่พบข้อมูลหน่วยสินค้าจาก Trade Code");
  const base = units[0].factor;
  return units.map(unit => ({ ...unit, factor: unit.factor / base }));
}

export function supplementPackingUnits(units, setting) {
  if (!setting) return units;
  const { parentCode, childCode, quantity } = setting;
  const parent = units.find(unit => unit.code === parentCode);
  if (!parent || !DEFINITIONS[childCode] || childCode === "kg" || parentCode === "kg" || parentCode === childCode
    || !Number.isSafeInteger(quantity) || quantity < 2 || quantity > 10000) throw new Error("อัตราบรรจุต้องเป็นจำนวนเต็ม 2–10,000 และใช้หน่วยที่รองรับ");
  const factor = parent.factor / quantity;
  const existing = units.find(unit => unit.code === childCode);
  if (existing && Math.abs(existing.factor - factor) > 0.000001) throw new Error("อัตราบรรจุขัดกับข้อมูลสินค้า กรุณาตรวจสอบ");
  const result = existing ? units : [...units, { code: childCode, label: DEFINITIONS[childCode].label, factor, precision: 0 }];
  const base = Math.min(...result.map(unit => unit.factor));
  return result.map(unit => ({ ...unit, factor: unit.factor / base })).sort((a, b) => a.factor - b.factor || a.code.localeCompare(b.code));
}

export function quantityInBase(units, quantities = {}) {
  let total = 0;
  for (const [code, raw] of Object.entries(quantities)) {
    const unit = units.find(item => item.code === code);
    if (!unit) throw new Error("หน่วยไม่ตรงกับสินค้า");
    if (raw === "" || raw === null || raw === undefined) continue;
    const text = String(raw);
    if (unit.precision ? !/^\d{1,9}(\.\d{1,3})?$/.test(text) : !/^\d{1,9}$/.test(text)) {
      throw new Error(unit.precision ? "จำนวนต้องไม่ติดลบ ทศนิยมไม่เกิน 3 ตำแหน่ง" : "จำนวนต้องเป็นจำนวนเต็มไม่ติดลบ");
    }
    total += Number(text) * unit.factor;
  }
  if (!Number.isFinite(total) || total > 999999999) throw new Error("จำนวนเกินขอบเขตที่รองรับ");
  return Math.round(total * 1000000) / 1000000;
}

export function packingQuantityText(units, quantities) {
  return [...units].reverse().filter(unit => Number(quantities?.[unit.code]) > 0)
    .map(unit => `${Number(quantities[unit.code]).toLocaleString("th-TH")} ${unit.label}`).join(" + ") || "—";
}
