import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const width = 3508;
const height = 2480;
const outDir = path.resolve("docs/weight-scale-user-guide");
const output = path.join(outDir, "คู่มือดูรายงานวัตถุดิบและผลผลิต-A4-แนวนอน.png");
const shots = [
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-022c51bb-5e43-4d8a-9d28-41fda60cafca.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-b7760570-dca6-4a83-af4d-adbfd40e59fe.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8b230bcd-2577-4efa-8671-2b91e04aae9f.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-4d827c33-5741-4320-b2b8-8722e29b5c60.png",
];
const svg = (body) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.t{font-family:"Leelawadee UI","Tahoma",sans-serif}.n{fill:#0b2f5b}.m{fill:#536b88}</style>${body}</svg>`);
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
fs.mkdirSync(outDir, { recursive: true });

const steps = [
  ["เข้าสู่ระบบ", "กรอกชื่อผู้ใช้และรหัสผ่าน จากนั้นกด “เข้าสู่ระบบ”", shots[0], [{ x: 768, y: 440, w: 385, h: 330 }]],
  ["เลือกเมนูชั่งน้ำหนักผลิตภัณฑ์", "เมื่ออยู่หน้าแรก ให้กดการ์ด “ชั่งน้ำหนักผลิตภัณฑ์”", shots[1], [{ x: 1012, y: 450, w: 380, h: 480 }]],
  ["เปิดรายงานวัตถุดิบและผลผลิต", "ไปที่ “รายงาน” แล้วเลือก “รายงานวัตถุดิบและผลผลิต”", shots[2], [{ x: 632, y: 76, w: 176, h: 56 }, { x: 632, y: 198, w: 350, h: 74 }]],
  ["เลือกช่วงวันที่และแสดงรายงาน", "กำหนด “จากวันที่” และ “ถึงวันที่” แล้วกด “แสดงรายงาน”", shots[3], [{ x: 190, y: 314, w: 556, h: 120 }, { x: 1362, y: 361, w: 182, h: 51 }]],
];

const composites = [{ input: svg(`
  <defs><linearGradient id="h" x2="1"><stop stop-color="#062849"/><stop offset="1" stop-color="#0f4d7d"/></linearGradient></defs>
  <rect width="3508" height="285" fill="url(#h)"/><circle cx="145" cy="132" r="82" fill="#009bd0"/>
  <text x="145" y="158" text-anchor="middle" class="t" font-size="78" font-weight="800" fill="white">KPF</text>
  <text x="270" y="102" class="t" font-size="42" fill="#d9e7f4">คู่มือการใช้งานระบบรายงาน</text>
  <text x="270" y="190" class="t" font-size="72" font-weight="800" fill="white">รายงานวัตถุดิบและผลผลิต</text>
  <text x="2050" y="168" class="t" font-size="37" fill="#d9e7f4">เข้าสู่ระบบ • เลือกเมนู • เปิดรายงาน • กำหนดวันที่</text>
  <rect y="270" width="3508" height="15" fill="#e7b72f"/>
`), top: 0, left: 0 }];

for (let i = 0; i < steps.length; i += 1) {
  const [title, detail, image, regions] = steps[i];
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 55 + col * 1725;
  const y = 335 + row * 1000;
  const shotX = x + 45;
  const shotY = y + 220;
  const shotW = 1590;
  const shotH = 700;
  const meta = await sharp(image).metadata();
  const sx = shotW / meta.width;
  const sy = shotH / meta.height;
  composites.push({ input: svg(`
    <rect x="${x}" y="${y}" width="1670" height="955" rx="32" fill="white" stroke="#d5e1ee" stroke-width="3"/>
    <circle cx="${x + 88}" cy="${y + 82}" r="56" fill="#e7b72f"/>
    <text x="${x + 88}" y="${y + 102}" text-anchor="middle" class="t n" font-size="54" font-weight="800">${i + 1}</text>
    <rect x="${x + 165}" y="${y + 28}" width="1030" height="104" rx="52" fill="#0b2f5b"/>
    <text x="${x + 215}" y="${y + 96}" class="t" font-size="43" font-weight="800" fill="white">${esc(title)}</text>
    <text x="${x + 165}" y="${y + 180}" class="t m" font-size="30">${esc(detail)}</text>
    <rect x="${shotX - 12}" y="${shotY - 12}" width="1614" height="724" rx="20" fill="#eaf0f7"/>
  `), top: 0, left: 0 });
  composites.push({ input: await sharp(image).resize(shotW, shotH, { fit: "fill" }).png().toBuffer(), top: shotY, left: shotX });
  const boxes = regions.map((r) => ({ x: shotX + r.x * sx, y: shotY + r.y * sy, w: r.w * sx, h: r.h * sy }));
  const last = boxes.at(-1);
  const lx = Math.min(x + 1620, last.x + last.w + 55);
  const ly = last.y + last.h / 2;
  composites.push({ input: svg(`
    ${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="none" stroke="#ff3b30" stroke-width="12"/>`).join("")}
    <circle cx="${lx}" cy="${ly}" r="48" fill="#ff3b30" stroke="white" stroke-width="8"/>
    <text x="${lx}" y="${ly + 18}" text-anchor="middle" class="t" font-size="50" font-weight="800" fill="white">${i + 1}</text>
  `), top: 0, left: 0 });
}

composites.push({ input: svg(`
  <rect x="55" y="2370" width="3398" height="70" rx="25" fill="#dceeff"/>
  <circle cx="110" cy="2405" r="25" fill="#0b2f5b"/><text x="110" y="2415" text-anchor="middle" class="t" font-size="28" fill="white">✓</text>
  <text x="155" y="2416" class="t n" font-size="27" font-weight="700">ตรวจสอบช่วงวันที่ให้ถูกต้องก่อนกดแสดงรายงานทุกครั้ง</text>
  <text x="3320" y="2416" text-anchor="end" class="t m" font-size="23">A4 แนวนอน • 300 DPI</text>
`), top: 0, left: 0 });

await sharp({ create: { width, height, channels: 4, background: "#f5f8fc" } })
  .composite(composites).withMetadata({ density: 300 }).png({ compressionLevel: 9 }).toFile(output);
console.log(output);
