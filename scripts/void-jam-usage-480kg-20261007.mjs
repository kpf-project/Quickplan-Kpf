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
  // Read current row
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
  console.log("=== รายการที่จะ Void ===");
  console.log(JSON.stringify(row, null, 2));

  // Preconditions
  if (row.status === "voided") {
    console.error("ERROR: รายการนี้ถูก void ไปแล้ว");
    process.exit(1);
  }
  if (row.goods_code !== "M04-0126-1") {
    console.error(`ERROR: goods_code เป็น "${row.goods_code}" ไม่ตรงกับที่คาดไว้ — หยุดเพื่อความปลอดภัย`);
    process.exit(1);
  }
  if (String(row.weight_kg) !== "480") {
    console.error(`ERROR: weight_kg เป็น "${row.weight_kg}" ไม่ใช่ 480 — หยุดเพื่อความปลอดภัย`);
    process.exit(1);
  }

  // Backup
  const backupPath = `scripts/void-jam-usage-backup-${TARGET_ID}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(row, null, 2), "utf8");
  console.log(`\n✓ สำรองข้อมูลไว้ที่: ${backupPath}`);
  console.log("\n=== จะ Void รายการ ===");
  console.log(`  id:         ${row.id}`);
  console.log(`  goods_code: ${row.goods_code} (${row.goods_name_snapshot})`);
  console.log(`  lot_no:     ${row.lot_no}`);
  console.log(`  weight_kg:  ${row.weight_kg} กก.`);
  console.log(`  usage_date: ${row.usage_date}`);

  if (!apply) {
    console.log("\n⚠️  DRY RUN — ยังไม่ได้แก้ไข เพิ่ม --apply เพื่อยืนยัน");
    return;
  }

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
        status: "voided",
        voided_at: new Date().toISOString(),
        voided_by: row.created_by,
      }),
    }
  );

  const updated = await patchRes.json();
  if (Array.isArray(updated) && updated[0]?.status === "voided") {
    console.log("\n✅ Void สำเร็จ — รายการ 480 กก. ถูกยกเลิกแล้ว");
    console.log(JSON.stringify(updated[0], null, 2));
  } else {
    console.error("\n❌ Void ไม่สำเร็จ:", JSON.stringify(updated, null, 2));
    process.exit(1);
  }
}

run().catch(console.error);
