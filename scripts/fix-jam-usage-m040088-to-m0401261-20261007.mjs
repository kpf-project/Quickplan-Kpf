import fs from "fs";

const content = fs.readFileSync(".env.local", "utf8");
const env = {};
content.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const idx = trimmed.indexOf("=");
  if (idx !== -1) {
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const apply = process.argv.includes("--apply");

const TARGET_ID = "1c72c570-ea8d-4d41-834a-16f64a5670c6";

async function run() {
  // 1. Read current row
  const readRes = await fetch(
    `${supabaseUrl}/rest/v1/production_jam_usage_entries?id=eq.${TARGET_ID}&select=*`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await readRes.json();

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("ERROR: ไม่พบ record ID:", TARGET_ID);
    process.exit(1);
  }

  const row = rows[0];
  console.log("=== ข้อมูลปัจจุบัน (Before) ===");
  console.log(JSON.stringify(row, null, 2));

  // Precondition checks
  if (row.goods_code !== "M04-0088") {
    console.error(`ERROR: goods_code ปัจจุบันเป็น "${row.goods_code}" ไม่ใช่ M04-0088 — หยุดเพื่อความปลอดภัย`);
    process.exit(1);
  }
  if (String(row.weight_kg) !== "480") {
    console.error(`ERROR: weight_kg ปัจจุบันเป็น "${row.weight_kg}" ไม่ใช่ 480 — หยุดเพื่อความปลอดภัย`);
    process.exit(1);
  }
  if (row.lot_no !== "260928") {
    console.error(`ERROR: lot_no ปัจจุบันเป็น "${row.lot_no}" ไม่ใช่ 260928 — หยุดเพื่อความปลอดภัย`);
    process.exit(1);
  }
  if (row.status === "voided") {
    console.error("ERROR: record นี้ถูก void ไปแล้ว — ไม่สามารถแก้ไขได้");
    process.exit(1);
  }

  // Backup
  const backupPath = `scripts/fix-jam-usage-backup-${TARGET_ID}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(row, null, 2), "utf8");
  console.log(`\n✓ สำรองข้อมูลเดิมไว้ที่: ${backupPath}`);

  console.log("\n=== การเปลี่ยนแปลงที่จะทำ ===");
  console.log(`  goods_code:          "${row.goods_code}" → "M04-0126-1"`);
  console.log(`  goods_name_snapshot: "${row.goods_name_snapshot}" → "แยมสตรอเบอรี่ PJST3"`);
  console.log(`  ที่เหลือทุกช่องเหมือนเดิม (lot_no: ${row.lot_no}, weight_kg: ${row.weight_kg}, usage_date: ${row.usage_date}, status: ${row.status})`);

  if (!apply) {
    console.log("\n⚠️  DRY RUN — ยังไม่ได้แก้ไข เพิ่ม --apply เพื่อยืนยัน");
    return;
  }

  // Update
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/production_jam_usage_entries?id=eq.${TARGET_ID}`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        goods_code: "M04-0126-1",
        goods_name_snapshot: "แยมสตรอเบอรี่ PJST3",
      }),
    }
  );

  const updated = await patchRes.json();
  console.log("\n=== ข้อมูลหลังแก้ไข (After) ===");
  console.log(JSON.stringify(updated, null, 2));

  // Verify
  if (Array.isArray(updated) && updated[0]?.goods_code === "M04-0126-1") {
    console.log("\n✅ แก้ไขสำเร็จ — goods_code เป็น M04-0126-1 (แยมสตรอเบอรี่ PJST3) แล้ว");
  } else {
    console.error("\n❌ แก้ไขไม่สำเร็จ — กรุณาตรวจสอบด้วยตนเอง");
    process.exit(1);
  }
}

run().catch(console.error);
