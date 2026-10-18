export function normalizeProductHotkey(value) {
  const key = String(value || "").trim().toUpperCase();
  return /^[1-9A-Z]$/.test(key) ? key : "";
}

export function productHotkeyStorageKey(stationId, departmentId) {
  return stationId && departmentId
    ? `kpf:product-hotkeys:v1:${encodeURIComponent(stationId)}:${encodeURIComponent(departmentId)}`
    : null;
}

export function validateProductHotkey(bindings, productCode, value) {
  const key = normalizeProductHotkey(value);
  if (!key) return "ใช้ได้เฉพาะ 1–9 หรือ A–Z";
  return Object.entries(bindings).some(([code, assigned]) => code !== productCode && normalizeProductHotkey(assigned) === key)
    ? `ปุ่ม ${key} ถูกใช้แล้ว กรุณาเลือกปุ่มอื่น`
    : "";
}

export function readProductHotkeys(storage, scope) {
  if (!scope) return {};
  const parsed = JSON.parse(storage.getItem(scope) || "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("ข้อมูลปุ่มลัดไม่ถูกต้อง");
  const clean = {};
  const used = new Set();
  for (const [code, value] of Object.entries(parsed)) {
    const key = normalizeProductHotkey(value);
    if (!key || used.has(key)) throw new Error("ข้อมูลปุ่มลัดซ้ำหรือไม่ถูกต้อง");
    clean[code] = key;
    used.add(key);
  }
  return clean;
}

export function productHotkeyFromEvent(event) {
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return "";
  if (event.target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return "";
  return normalizeProductHotkey(event.key);
}

export function saveProductHotkey(storage, scope, productCode, value) {
  if (!scope || !productCode) throw new Error("ต้องเลือกสถานี แผนก และสินค้าก่อน");
  const latest = readProductHotkeys(storage, scope);
  const error = validateProductHotkey(latest, productCode, value);
  if (error) throw new Error(error);
  const next = { ...latest, [productCode]: normalizeProductHotkey(value) };
  storage.setItem(scope, JSON.stringify(next));
  return next;
}
