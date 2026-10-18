import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const width = 1400;
const height = 5050;
const outDir = path.resolve("docs/piece-rate-scan-user-guide");
const output = path.join(outDir, "คู่มือดูรายงานบันทึกเนื้อขนมป้ายแยม.png");
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

const svg = (body, h = height) => Buffer.from(`
<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <style>.thai{font-family:"Leelawadee UI","Tahoma",sans-serif}.navy{fill:#0b2f5b}.muted{fill:#536b88}</style>
  ${body}
</svg>`);
const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

fs.mkdirSync(outDir, { recursive: true });
const composites = [{
  input: svg(`
    <defs><linearGradient id="h" x2="1"><stop stop-color="#062849"/><stop offset="1" stop-color="#0f4d7d"/></linearGradient></defs>
    <rect width="1400" height="315" fill="url(#h)"/><circle cx="105" cy="106" r="65" fill="#009bd0"/>
    <text x="105" y="128" text-anchor="middle" class="thai" font-size="62" font-weight="800" fill="white">KPF</text>
    <text x="210" y="102" class="thai" font-size="34" fill="#d9e7f4">คู่มือการใช้งานระบบรายงาน</text>
    <text x="210" y="174" class="thai" font-size="55" font-weight="800" fill="white">รายงานสต็อกป้ายแยม</text>
    <text x="210" y="225" class="thai" font-size="27" fill="#d9e7f4">รับเข้า • เบิก • เคลื่อนไหว • คงเหลือ • เรือนจำ</text>
    <path d="M0 290 Q900 350 1400 260 V315 H0Z" fill="#e7b72f"/>
  `), top: 0, left: 0,
}];

async function addStep({ number, y, title, detail, image, regions }) {
  const top = y + 155;
  const left = 70;
  const w = 1260;
  const h = 675;
  const meta = await sharp(image).metadata();
  const sx = w / meta.width;
  const sy = h / meta.height;
  composites.push({ input: svg(`
    <rect x="45" y="${y - 30}" width="1310" height="745" rx="28" fill="white" stroke="#d5e1ee" stroke-width="2"/>
    <circle cx="100" cy="${y + 52}" r="45" fill="#e7b72f"/>
    <text x="100" y="${y + 68}" text-anchor="middle" class="thai navy" font-size="44" font-weight="800">${number}</text>
    <rect x="165" y="${y + 12}" width="760" height="80" rx="40" fill="#0b2f5b"/>
    <text x="205" y="${y + 65}" class="thai" font-size="36" font-weight="700" fill="white">${esc(title)}</text>
    <text x="165" y="${y + 125}" class="thai muted" font-size="25">${esc(detail)}</text>
    <rect x="60" y="${top - 10}" width="1280" height="695" rx="20" fill="#eaf0f7"/>
  `), top: 0, left: 0 });
  composites.push({ input: await sharp(image).resize(w, h, { fit: "fill" }).png().toBuffer(), top, left });
  const boxes = regions.map((r) => ({ x: left + r.x * sx, y: top + r.y * sy, w: r.w * sx, h: r.h * sy }));
  const last = boxes.at(-1);
  const lx = Math.min(1290, last.x + last.w + 45);
  const ly = last.y + last.h / 2;
  composites.push({ input: svg(`
    ${boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="none" stroke="#ff3b30" stroke-width="8"/>`).join("")}
    <circle cx="${lx}" cy="${ly}" r="37" fill="#ff3b30" stroke="white" stroke-width="6"/>
    <text x="${lx}" y="${ly + 15}" text-anchor="middle" class="thai" font-size="40" font-weight="800" fill="white">${number}</text>
  `), top: 0, left: 0 });
}

await addStep({ number: 1, y: 360, title: "เข้าสู่ระบบ", detail: "กรอกชื่อผู้ใช้และรหัสผ่าน จากนั้นกด “เข้าสู่ระบบ”", image: login,
  regions: [{ x: 768, y: 440, w: 385, h: 330 }] });
await addStep({ number: 2, y: 1130, title: "เลือกเมนูบันทึกเนื้อขนมป้ายแยม", detail: "จากเมนูไลน์ผลิตด้านซ้าย กด “บันทึกเนื้อขนมป้ายแยม”", image: images[0],
  regions: [{ x: 4, y: 295, w: 270, h: 51 }] });
await addStep({ number: 3, y: 1900, title: "เปิดแท็บรายงาน", detail: "ที่มุมขวาบน กดแท็บ “รายงาน” เพื่อดูรายการรายงานทั้งหมด", image: images[1],
  regions: [{ x: 1450, y: 60, w: 440, h: 470 }] });
await addStep({ number: 4, y: 2670, title: "เลือกประเภทรายงาน", detail: "กำหนดช่วงวันที่หรือคำค้น แล้วเลือกรายงานที่ต้องการ", image: images[2],
  regions: [{ x: 138, y: 239, w: 1275, h: 50 }, { x: 139, y: 326, w: 1610, h: 80 }] });

const reports = [
  ["รับเข้า WIP", "รายการรับเข้า WIP", images[2]],
  ["รับเข้า FG", "รายการสินค้าสำเร็จรูปที่ผลิตเสร็จ", images[3]],
  ["รายงานเบิก", "เลือกดูแบบรายละเอียดหรือแบบสรุป", images[4]],
  ["รายงานเคลื่อนไหว", "ยอดรับเข้า เบิก ใช้จริง และคงเหลือ", images[5]],
  ["รายงานคงเหลือ", "คงเหลือแยกตามสินค้าและ LOT", images[6]],
  ["รายงานเรือนจำ", "รับเข้า • เบิกออก • คงเหลือแยก LOT", images[7]],
];
const gridY = 3485;
composites.push({ input: svg(`
  <rect x="45" y="${gridY - 40}" width="1310" height="1485" rx="28" fill="white" stroke="#d5e1ee" stroke-width="2"/>
  <circle cx="100" cy="${gridY + 35}" r="45" fill="#e7b72f"/>
  <text x="100" y="${gridY + 51}" text-anchor="middle" class="thai navy" font-size="44" font-weight="800">5</text>
  <text x="165" y="${gridY + 48}" class="thai navy" font-size="38" font-weight="800">รายงานที่สามารถเลือกดูได้</text>
  <text x="165" y="${gridY + 92}" class="thai muted" font-size="24">เลือกรายงานให้ตรงกับข้อมูลที่ต้องการตรวจสอบ</text>
`), top: 0, left: 0 });

for (let i = 0; i < reports.length; i += 1) {
  const [title, detail, image] = reports[i];
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 75 + col * 650;
  const y = gridY + 135 + row * 425;
  composites.push({ input: svg(`
    <rect x="${x}" y="${y}" width="610" height="390" rx="20" fill="#f7faff" stroke="#c9d8e8" stroke-width="2"/>
    <rect x="${x}" y="${y}" width="610" height="72" rx="20" fill="#0b2f5b"/>
    <text x="${x + 28}" y="${y + 47}" class="thai" font-size="29" font-weight="800" fill="white">${esc(title)}</text>
    <text x="${x + 28}" y="${y + 365}" class="thai muted" font-size="21">${esc(detail)}</text>
  `), top: 0, left: 0 });
  composites.push({ input: await sharp(image).resize(570, 250, { fit: "cover", position: "top" }).png().toBuffer(), top: y + 88, left: x + 20 });
}

composites.push({ input: svg(`
  <rect x="45" y="4938" width="1310" height="80" rx="24" fill="#dceeff"/>
  <circle cx="95" cy="4978" r="25" fill="#0b2f5b"/><text x="95" y="4988" text-anchor="middle" class="thai" font-size="28" fill="white">✓</text>
  <text x="140" y="4988" class="thai navy" font-size="24" font-weight="700">ตรวจสอบช่วงวันที่และประเภทรายงานก่อนกดค้นหาทุกครั้ง</text>
`), top: 0, left: 0 });

await sharp({ create: { width, height, channels: 4, background: "#f5f8fc" } })
  .composite(composites).png({ compressionLevel: 9 }).toFile(output);
console.log(output);
