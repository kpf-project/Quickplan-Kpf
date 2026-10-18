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

async function run() {
  // Get all jam usage entries on 2026-10-07 (all statuses)
  const res = await fetch(
    `${supabaseUrl}/rest/v1/production_jam_usage_entries?usage_date=eq.2026-10-07&select=*&order=created_at.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await res.json();
  console.log("=== ทุกรายการ jam usage วันที่ 2026-10-07 ===");
  console.log(JSON.stringify(rows, null, 2));

  // Sum by goods_code
  const summary = {};
  for (const r of rows) {
    const k = `${r.goods_code} | ${r.goods_name_snapshot} | status:${r.status}`;
    if (!summary[k]) summary[k] = 0;
    summary[k] += Number(r.weight_kg || 0);
  }
  console.log("\n=== ยอดรวมตามรหัสแยม ===");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v.toFixed(3)} กก.`);
  }
}

run().catch(console.error);
