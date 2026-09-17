import { createClient } from "@supabase/supabase-js";
import { test } from "node:test";
import fs from "node:fs";

// Manually parse .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || "";
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test("debug verification status for MP202607003", async () => {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const masterPlanNo = "MP202607003";

  console.log(`\nQuerying production_plan_status for: ${masterPlanNo}`);
  const { data: statusRows } = await supabase
    .from("production_plan_status")
    .select("plan_id, sku_code, sku_name, planned_qty, plan_kind, line_staff_count, line_dough_set_count, line_machine_no, period_start")
    .eq("master_plan_no", masterPlanNo);

  console.log(`Found ${statusRows?.length || 0} status rows:`);
  console.log(JSON.stringify(statusRows, null, 2));
});
