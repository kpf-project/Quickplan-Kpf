import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const parts = line.split("=");
  if (parts.length >= 2) {
    const key = parts[0].trim();
    env[key] = parts.slice(1).join("=").trim();
  }
});

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function run() {
  const headers = {
    "apikey": supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/production_stock_movements?select=product_code,product_name_snapshot,source_document_no,movement_type,created_at&limit=20&order=created_at.desc`, { headers });
  const data = await res.json();
  console.log("Movements rows:", data);
}

run().catch(console.error);
