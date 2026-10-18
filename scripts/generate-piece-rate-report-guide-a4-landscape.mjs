import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const width = 3508;
const height = 2480;
const outDir = path.resolve("docs/piece-rate-scan-user-guide");
const output = path.join(outDir, "คู่มือดูรายงานบันทึกเนื้อขนมป้ายแยม-A4-แนวนอน.png");
const login = "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-022c51bb-5e43-4d8a-9d28-41fda60cafca.png";
const images = [
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-c9ce0a5d-2926-4d63-936c-f2b80eb405ed.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-50447cf4-2bb9-40fb-9bac-3d1805973d36.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-d99c3484-99f3-417a-8f93-b1c583bcb891.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-74b4691e-51e4-41c6-a413-f5ca67efca02.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-e7cc28ae-bbb4-45a7-9dd4-38e4d58ef505.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-a2d2d9e7-09bd-4852-8250-238d35a0dfdc.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-fc423015-81b0-4729-86c4-9e448431b353.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-2d19b858-b156-40a8-ba98-77789147c719.png",
];
const svg = (body) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.t{font-family:"Leelawadee UI","Tahoma",sans-serif}.n{fill:#0b2f5b}.m{fill:#536b88}</style>${body}</svg>`);
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
fs.mkdirSync(outDir, { recursive: true });

const composites = [{ input: svg(`
  <defs><linearGradient id="h" x2="1"><stop stop-color="#062849"/><stop offset="1" stop-color="#0f4d7d"/></linearGradient></defs>
  <rect width="3508" height="285" fill="url(#h)"/><circle cx="145" cy="132" r="82" fill="#009bd0"/>
  <text x="145" y="158" text-anchor="middle" class="t" font-size="78" font-weight="800" fill="white">KPF</text>
  <text x="270" y="102" class="t" font-size="42" fill="#d9e7f4">คู่มือการใช้งานระบบรายงาน</text>
  <text x="270" y="190" class="t" font-size="72" font-weight="800" fill="white">รายงานสต็อกป้ายแยม</text>
  <text x="1660" y="168" class="t" font-size="37" fill="#d9e7f4">รับเข้า • เบิก • เคลื่อนไหว • คงเหลือ • เรือนจำ</text>
  <rect y="270" width="3508" height="15" fill="#e7b72f"/>
`), top: 0, left: 0 }];

const steps = [
  ["เข้าสู่ระบบ", "กรอกชื่อผู้ใช้และรหัสผ่าน แล้วกดเข้าสู่ระบบ", login, [{ x: 768, y: 440, w: 385, h: 330 }]],
  ["เลือกเมนูบันทึกเนื้อขนมป้ายแยม", "กดเมนูจากแถบไลน์ผลิตด้านซ้าย", images[0], [{ x: 4, y: 295, w: 270, h: 51 }]],
  ["เปิดแท็บรายงาน", "กดแท็บ “รายงาน” ที่มุมขวาบน", images[1], [{ x: 1450, y: 60, w: 440, h: 470 }]],
  ["เลือกประเภทรายงาน", "เลือกวันที่หรือคำค้น แล้วกดค้นหา", images[2], [{ x: 138, y: 239, w: 1275, h: 50 }, { x: 139, y: 326, w: 1610, h: 80 }]],
];

for (let i = 0; i < steps.length; i += 1) {
  const [title, detail, image, regions] = steps[i];
  const x = 55;
  const y = 330 + i * 505;
  const shotX = 720;
  const shotY = y + 25;
  const shotW = 1400;
  const shotH = 430;
  const meta = await sharp(image).metadata();
  const loginStep = i === 0;
  const scale = loginStep ? Math.min(shotW / meta.width, shotH / meta.height) : Math.max(shotW / meta.width, shotH / meta.height);
  const renderedW = meta.width * scale;
  const offsetX = loginStep ? (shotW - renderedW) / 2 : 0;
  const longTitle = title === "เลือกเมนูบันทึกเนื้อขนมป้ายแยม";
  const titleMarkup = longTitle
    ? `<text x="220" y="${y + 70}" class="t n" font-size="36" font-weight="800">เลือกเมนูบันทึก</text><text x="220" y="${y + 116}" class="t n" font-size="36" font-weight="800">เนื้อขนมป้ายแยม</text>`
    : `<text x="220" y="${y + 82}" class="t n" font-size="42" font-weight="800">${esc(title)}</text>`;
  composites.push({ input: svg(`
    <rect x="${x}" y="${y}" width="2105" height="470" rx="28" fill="white" stroke="#d5e1ee" stroke-width="3"/>
    <circle cx="135" cy="${y + 82}" r="55" fill="#e7b72f"/><text x="135" y="${y + 101}" text-anchor="middle" class="t n" font-size="54" font-weight="800">${i + 1}</text>
    ${titleMarkup}
    <text x="220" y="${y + (longTitle ? 170 : 140)}" class="t m" font-size="29">${esc(detail)}</text>
    <rect x="220" y="${y + (longTitle ? 225 : 205)}" width="430" height="8" rx="4" fill="#e7b72f"/>
  `), top: 0, left: 0 });
  composites.push({
    input: await sharp(image).resize(shotW, shotH, {
      fit: loginStep ? "contain" : "cover",
      position: loginStep ? "center" : "north",
      background: "#f3f6fa",
    }).png().toBuffer(),
    top: shotY,
    left: shotX,
  });
  const boxes = regions.map((r) => ({
    x: shotX + offsetX + r.x * scale,
    y: shotY + r.y * scale,
    w: r.w * scale,
    h: r.h * scale,
  }));
  composites.push({ input: svg(boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="none" stroke="#ff3b30" stroke-width="11"/>`).join("")), top: 0, left: 0 });
}

composites.push({ input: svg(`
  <rect x="2200" y="330" width="1253" height="1990" rx="30" fill="white" stroke="#d5e1ee" stroke-width="3"/>
  <rect x="2200" y="330" width="1253" height="145" rx="30" fill="#0b2f5b"/>
  <text x="2265" y="420" class="t" font-size="50" font-weight="800" fill="white">รายงานที่สามารถเลือกดูได้</text>
  <text x="2265" y="525" class="t m" font-size="29">เลือกให้ตรงกับข้อมูลที่ต้องการตรวจสอบ</text>
`), top: 0, left: 0 });

const reports = [
  ["รับเข้า WIP", "รายการรับเข้า WIP", images[2]],
  ["รับเข้า FG", "สินค้าสำเร็จรูปที่ผลิตเสร็จ", images[3]],
  ["รายงานเบิก", "แบบรายละเอียด / แบบสรุป", images[4]],
  ["รายงานเคลื่อนไหว", "รับเข้า เบิก ใช้จริง และคงเหลือ", images[5]],
  ["รายงานคงเหลือ", "คงเหลือแยกสินค้าและ LOT", images[6]],
  ["รายงานเรือนจำ", "รับเข้า • เบิกออก • คงเหลือแยก LOT", images[7]],
];
for (let i = 0; i < reports.length; i += 1) {
  const [title, detail, image] = reports[i];
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 2245 + col * 600;
  const y = 575 + row * 560;
  composites.push({ input: svg(`
    <rect x="${x}" y="${y}" width="560" height="515" rx="22" fill="#f7faff" stroke="#c9d8e8" stroke-width="3"/>
    <rect x="${x}" y="${y}" width="560" height="84" rx="22" fill="#0b2f5b"/>
    <text x="${x + 28}" y="${y + 57}" class="t" font-size="34" font-weight="800" fill="white">${esc(title)}</text>
    <text x="${x + 28}" y="${y + 480}" class="t m" font-size="23">${esc(detail)}</text>
  `), top: 0, left: 0 });
  composites.push({ input: await sharp(image).resize(520, 350, { fit: "cover", position: "top" }).png().toBuffer(), top: y + 100, left: x + 20 });
}

composites.push({ input: svg(`
  <rect x="55" y="2370" width="3398" height="70" rx="25" fill="#dceeff"/>
  <circle cx="110" cy="2405" r="25" fill="#0b2f5b"/><text x="110" y="2415" text-anchor="middle" class="t" font-size="28" fill="white">✓</text>
  <text x="155" y="2416" class="t n" font-size="27" font-weight="700">ตรวจสอบช่วงวันที่ ประเภทรายงาน และคำค้นก่อนกดค้นหาทุกครั้ง</text>
  <text x="3320" y="2416" text-anchor="end" class="t m" font-size="23">A4 แนวนอน • 300 DPI</text>
`), top: 0, left: 0 });

await sharp({ create: { width, height, channels: 4, background: "#f5f8fc" } })
  .composite(composites).withMetadata({ density: 300 }).png({ compressionLevel: 9 }).toFile(output);
console.log(output);
