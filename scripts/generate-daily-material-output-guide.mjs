import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const width = 1400;
const height = 3530;
const outDir = path.resolve("docs/weight-scale-user-guide");
const output = path.join(outDir, "คู่มือดูรายงานวัตถุดิบและผลผลิต.png");
const shots = [
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-022c51bb-5e43-4d8a-9d28-41fda60cafca.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-b7760570-dca6-4a83-af4d-adbfd40e59fe.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-8b230bcd-2577-4efa-8671-2b91e04aae9f.png",
  "C:/Users/Riew/AppData/Local/Temp/codex-clipboard-4d827c33-5741-4320-b2b8-8722e29b5c60.png",
];

const esc = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const svg = (body, h = height) => Buffer.from(`
  <svg width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .thai { font-family: "Leelawadee UI", "Tahoma", sans-serif; }
      .navy { fill: #0b2f5b; }
      .gold { fill: #e7b72f; }
      .muted { fill: #536b88; }
    </style>
    ${body}
  </svg>`);

const cards = [
  {
    y: 360,
    title: "เข้าสู่ระบบ",
    detail: "กรอกรหัสพนักงานหรือชื่อผู้ใช้ และรหัสผ่าน จากนั้นกด “เข้าสู่ระบบ”",
    image: shots[0],
    marker: { regions: [{ x: 768, y: 440, w: 385, h: 330 }], labelX: 1220, labelY: 605 },
  },
  {
    y: 1130,
    title: "เลือกเมนูชั่งน้ำหนักผลิตภัณฑ์",
    detail: "เมื่ออยู่หน้าแรก ให้กดการ์ด “ชั่งน้ำหนักผลิตภัณฑ์”",
    image: shots[1],
    marker: { regions: [{ x: 1012, y: 450, w: 380, h: 480 }], labelX: 1460, labelY: 535 },
  },
  {
    y: 1900,
    title: "เปิดรายงานวัตถุดิบและผลผลิต",
    detail: "เลื่อนเมาส์ไปที่ “รายงาน” แล้วเลือก “รายงานวัตถุดิบและผลผลิต”",
    image: shots[2],
    marker: { regions: [{ x: 632, y: 76, w: 176, h: 56 }, { x: 632, y: 198, w: 350, h: 74 }], labelX: 1050, labelY: 235 },
  },
  {
    y: 2670,
    title: "เลือกช่วงวันที่และแสดงรายงาน",
    detail: "กำหนด “จากวันที่” และ “ถึงวันที่” แล้วกดปุ่ม “แสดงรายงาน”",
    image: shots[3],
    marker: { regions: [{ x: 190, y: 314, w: 556, h: 120 }, { x: 1362, y: 361, w: 182, h: 51 }], labelX: 1615, labelY: 385 },
  },
];

fs.mkdirSync(outDir, { recursive: true });

const base = sharp({
  create: { width, height, channels: 4, background: "#f5f8fc" },
});

const composites = [
  {
    input: svg(`
      <defs>
        <linearGradient id="head" x1="0" x2="1">
          <stop stop-color="#062849"/><stop offset="1" stop-color="#0f4d7d"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="315" fill="url(#head)"/>
      <circle cx="105" cy="106" r="65" fill="#009bd0"/>
      <text x="105" y="128" text-anchor="middle" class="thai" font-size="62" font-weight="800" fill="white">KPF</text>
      <text x="210" y="105" class="thai" font-size="35" fill="#d9e7f4">คู่มือการใช้งานระบบรายงาน</text>
      <text x="210" y="175" class="thai" font-size="58" font-weight="800" fill="white">รายงานวัตถุดิบและผลผลิต</text>
      <text x="210" y="225" class="thai" font-size="27" fill="#d9e7f4">เข้าสู่ระบบ • เลือกเมนู • เปิดรายงาน • กำหนดวันที่</text>
      <path d="M0 290 Q900 350 1400 260 V315 H0Z" fill="#e7b72f"/>
    `),
    top: 0,
    left: 0,
  },
];

for (let index = 0; index < cards.length; index += 1) {
  const card = cards[index];
  const imageTop = card.y + 160;
  const imageLeft = 70;
  const imageWidth = 1260;
  const imageHeight = 675;
  const meta = await sharp(card.image).metadata();
  const scaleX = imageWidth / meta.width;
  const scaleY = imageHeight / meta.height;
  const marker = card.marker;

  composites.push({
    input: svg(`
      <rect x="45" y="${card.y - 30}" width="1310" height="745" rx="28" fill="white" stroke="#d5e1ee" stroke-width="2"/>
      <circle cx="100" cy="${card.y + 52}" r="45" fill="#e7b72f"/>
      <text x="100" y="${card.y + 68}" text-anchor="middle" class="thai navy" font-size="44" font-weight="800">${index + 1}</text>
      <rect x="165" y="${card.y + 12}" width="${Math.min(760, 300 + card.title.length * 22)}" height="80" rx="40" fill="#0b2f5b"/>
      <text x="205" y="${card.y + 65}" class="thai" font-size="36" font-weight="700" fill="white">${esc(card.title)}</text>
      <text x="165" y="${card.y + 125}" class="thai muted" font-size="25">${esc(card.detail)}</text>
      <rect x="60" y="${imageTop - 10}" width="1280" height="695" rx="20" fill="#eaf0f7"/>
    `),
    top: 0,
    left: 0,
  });

  composites.push({
    input: await sharp(card.image).resize(imageWidth, imageHeight, { fit: "fill" }).png().toBuffer(),
    top: imageTop,
    left: imageLeft,
  });

  const regions = marker.regions.map((region) => ({
    x: imageLeft + region.x * scaleX,
    y: imageTop + region.y * scaleY,
    w: region.w * scaleX,
    h: region.h * scaleY,
  }));
  const anchor = regions.at(-1);
  const lx = imageLeft + marker.labelX * scaleX;
  const ly = imageTop + marker.labelY * scaleY;
  composites.push({
    input: svg(`
      ${regions.map((region) => `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" rx="12" fill="none" stroke="#ff3b30" stroke-width="8"/>`).join("")}
      <path d="M${lx - 60} ${ly} L${anchor.x + anchor.w} ${anchor.y + anchor.h / 2}" stroke="#ff3b30" stroke-width="8" fill="none"/>
      <circle cx="${lx}" cy="${ly}" r="37" fill="#ff3b30" stroke="white" stroke-width="6"/>
      <text x="${lx}" y="${ly + 15}" text-anchor="middle" class="thai" font-size="40" font-weight="800" fill="white">${index + 1}</text>
    `),
    top: 0,
    left: 0,
  });
}

composites.push({
  input: svg(`
    <rect x="45" y="3420" width="1310" height="82" rx="24" fill="#dceeff"/>
    <circle cx="95" cy="3461" r="25" fill="#0b2f5b"/>
    <text x="95" y="3471" text-anchor="middle" class="thai" font-size="28" fill="white">✓</text>
    <text x="140" y="3471" class="thai navy" font-size="25" font-weight="700">ตรวจสอบช่วงวันที่ให้ถูกต้องก่อนกดแสดงรายงานทุกครั้ง</text>
  `),
  top: 0,
  left: 0,
});

await base.composite(composites).png({ compressionLevel: 9 }).toFile(output);
console.log(output);
