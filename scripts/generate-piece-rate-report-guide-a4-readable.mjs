import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const W = 3508, H = 2480;
const dir = path.resolve("docs/piece-rate-scan-user-guide");
const page1 = path.join(dir, "คู่มือดูรายงานบันทึกเนื้อขนมป้ายแยม-A4-หน้า1.png");
const page2 = path.join(dir, "คู่มือดูรายงานบันทึกเนื้อขนมป้ายแยม-A4-หน้า2.png");
const login = "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-022c51bb-5e43-4d8a-9d28-41fda60cafca.png";
const imgs = [
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-c9ce0a5d-2926-4d63-936c-f2b80eb405ed.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-50447cf4-2bb9-40fb-9bac-3d1805973d36.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-d99c3484-99f3-417a-8f93-b1c583bcb891.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-74b4691e-51e4-41c6-a413-f5ca67efca02.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-e7cc28ae-bbb4-45a7-9dd4-38e4d58ef505.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-a2d2d9e7-09bd-4852-8250-238d35a0dfdc.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-fc423015-81b0-4729-86c4-9e448431b353.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-2d19b858-b156-40a8-ba98-77789147c719.png",
];
const svg = (body) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><style>.t{font-family:"Leelawadee UI","Tahoma",sans-serif}.n{fill:#0b2f5b}.m{fill:#536b88}</style>${body}</svg>`);
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const header = (subtitle) => ({ input: svg(`<rect width="3508" height="280" fill="#0b416d"/><circle cx="140" cy="128" r="80" fill="#08a7d8"/><text x="140" y="155" text-anchor="middle" class="t" font-size="76" font-weight="800" fill="white">KPF</text><text x="270" y="105" class="t" font-size="42" fill="#d9e7f4">คู่มือการใช้งานระบบรายงาน</text><text x="270" y="192" class="t" font-size="70" font-weight="800" fill="white">รายงานสต็อกป้ายแยม</text><text x="3290" y="165" text-anchor="end" class="t" font-size="38" fill="#d9e7f4">${subtitle}</text><rect y="265" width="3508" height="15" fill="#e7b72f"/>`), top: 0, left: 0 });

const steps = [
  ["เข้าสู่ระบบ", "กรอกชื่อผู้ใช้และรหัสผ่าน แล้วกดเข้าสู่ระบบ", login, [{ x: 768, y: 440, w: 385, h: 330 }]],
  ["เลือกเมนูบันทึกเนื้อขนมป้ายแยม", "กดเมนูจากแถบไลน์ผลิตด้านซ้าย", imgs[0], [{ x: 4, y: 295, w: 270, h: 51 }]],
  ["เปิดแท็บรายงาน", "กดแท็บ “รายงาน” ที่มุมขวาบน", imgs[1], [{ x: 1450, y: 60, w: 440, h: 470 }]],
  ["เลือกประเภทรายงาน", "เลือกวันที่หรือคำค้น แล้วกดค้นหา", imgs[2], [{ x: 138, y: 239, w: 1275, h: 50 }, { x: 139, y: 326, w: 1610, h: 80 }]],
];
const c1 = [header("หน้า 1/2 • ขั้นตอนการใช้งาน")];
for (let i = 0; i < 4; i++) {
  const [title, detail, image, regions] = steps[i];
  const col = i % 2, row = Math.floor(i / 2);
  const x = 50 + col * 1725, y = 325 + row * 1015;
  const ix = x + 38, iy = y + 225, iw = 1600, ih = 700;
  const meta = await sharp(image).metadata();
  const contain = i === 0;
  const scale = contain ? Math.min(iw / meta.width, ih / meta.height) : Math.max(iw / meta.width, ih / meta.height);
  const ox = contain ? (iw - meta.width * scale) / 2 : 0;
  c1.push({ input: svg(`<rect x="${x}" y="${y}" width="1675" height="970" rx="30" fill="white" stroke="#d5e1ee" stroke-width="3"/><circle cx="${x + 85}" cy="${y + 78}" r="55" fill="#e7b72f"/><text x="${x + 85}" y="${y + 98}" text-anchor="middle" class="t n" font-size="54" font-weight="800">${i + 1}</text><text x="${x + 165}" y="${y + 75}" class="t n" font-size="46" font-weight="800">${esc(title)}</text><text x="${x + 165}" y="${y + 145}" class="t m" font-size="34">${esc(detail)}</text>`), top: 0, left: 0 });
  c1.push({ input: await sharp(image).resize(iw, ih, { fit: contain ? "contain" : "cover", position: contain ? "center" : "north", background: "#f3f6fa" }).png().toBuffer(), top: iy, left: ix });
  const boxes = regions.map(r => ({ x: ix + ox + r.x * scale, y: iy + r.y * scale, w: r.w * scale, h: r.h * scale }));
  c1.push({ input: svg(boxes.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="none" stroke="#ff3b30" stroke-width="12"/>`).join("")), top: 0, left: 0 });
}
await sharp({ create: { width: W, height: H, channels: 4, background: "#f5f8fc" } }).composite(c1).withMetadata({ density: 300 }).png().toFile(page1);

const reports = [
  ["รับเข้า WIP", "รายการรับเข้า WIP", imgs[2]], ["รับเข้า FG", "สินค้าสำเร็จรูปที่ผลิตเสร็จ", imgs[3]],
  ["รายงานเบิก", "แบบรายละเอียด / แบบสรุป", imgs[4]], ["รายงานเคลื่อนไหว", "รับเข้า เบิก ใช้จริง และคงเหลือ", imgs[5]],
  ["รายงานคงเหลือ", "คงเหลือแยกสินค้าและ LOT", imgs[6]], ["รายงานเรือนจำ", "รับเข้า • เบิกออก • คงเหลือแยก LOT", imgs[7]],
];
const c2 = [header("หน้า 2/2 • ประเภทรายงาน")];
for (let i = 0; i < 6; i++) {
  const [title, detail, image] = reports[i];
  const col = i % 3, row = Math.floor(i / 3);
  const x = 55 + col * 1150, y = 340 + row * 1015;
  c2.push({ input: svg(`<rect x="${x}" y="${y}" width="1100" height="960" rx="28" fill="white" stroke="#c9d8e8" stroke-width="3"/><rect x="${x}" y="${y}" width="1100" height="125" rx="28" fill="#0b2f5b"/><text x="${x + 40}" y="${y + 83}" class="t" font-size="50" font-weight="800" fill="white">${esc(title)}</text><text x="${x + 40}" y="${y + 900}" class="t m" font-size="34">${esc(detail)}</text>`), top: 0, left: 0 });
  c2.push({ input: await sharp(image).resize(1020, 690, { fit: "cover", position: "north" }).png().toBuffer(), top: y + 155, left: x + 40 });
}
await sharp({ create: { width: W, height: H, channels: 4, background: "#f5f8fc" } }).composite(c2).withMetadata({ density: 300 }).png().toFile(page2);
console.log(page1); console.log(page2);
