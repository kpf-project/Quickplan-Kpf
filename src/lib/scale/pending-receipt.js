const KEY = "kpf.central-scale.pending-receipt.v1";

export function assertCentralReceiptMatches(receipt, pending) {
  const gross = Number(receipt?.gross_kg);
  const tare = Number(receipt?.tare_kg);
  const net = Number(receipt?.net_kg);
  const milli = value => Math.round(value * 1000);
  if (!pending || receipt?.request_id !== pending.requestId || receipt.point_id !== pending.pointId
    || receipt.department_id !== pending.departmentId || receipt.product_code !== pending.productCode
    || !/^\d{14}$/.test(receipt.barcode || "") || !receipt.lot_no
    || receipt.gross_kg == null || receipt.tare_kg == null || receipt.net_kg == null
    || ![gross, tare, net].every(Number.isFinite) || gross <= 0 || tare < 0 || net <= 0
    || tare !== Number(pending.tareWeightKg) || milli(net) !== milli(gross) - milli(tare)) {
    throw new Error("ใบรับไม่ตรงกับคำขอ หรือน้ำหนักไม่ครบถ้วน ห้ามรับซ้ำจนกว่าจะตรวจสอบได้");
  }
}

export async function withCentralReceiptLock(locks, save) {
  if (!locks) throw new Error("เบราว์เซอร์นี้ไม่รองรับการล็อกข้ามแท็บ ห้ามรับเข้า");
  return locks.request("kpf.central-scale.receive", { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("อีกแท็บกำลังรับเข้า กรุณารอตรวจผลรายการเดิม");
    return save();
  });
}

// Keep an unresolved request until the server confirms it; a missing response is not a failed receipt.
export function readPendingReceipt(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value?.requestId || !value?.pointId || !value?.productCode) throw new Error("ข้อมูลคำขอค้างไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล ห้ามรับซ้ำ");
  return value;
}

export function persistPendingReceipt(storage, payload) {
  if (readPendingReceipt(storage)) throw new Error("มีคำขอค้าง ต้องตรวจรายการเดิมก่อนรับรายการใหม่");
  storage.setItem(KEY, JSON.stringify(payload));
}

export function clearConfirmedReceipt(storage, requestId) {
  const pending = readPendingReceipt(storage);
  if (pending?.requestId !== requestId) throw new Error("คำขอยืนยันไม่ตรงกับรายการค้าง");
  storage.removeItem(KEY);
}
