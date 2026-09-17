"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

async function run() {
  const rootDir = path.resolve(__dirname, "..");
  loadEnvFile(path.join(rootDir, ".env.local"));
  loadEnvFile(path.join(rootDir, ".env"));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const args = parseArgs(process.argv);

  console.log("=== Historical WIP Sub-Plan Shift Repair ===");
  console.log(`Mode: ${args.apply ? "APPLY (Writing changes)" : "DRY RUN (ReadOnly)"}`);

  // 1. Fetch all active shifts
  console.log("\nFetching production_shifts...");
  const { data: shiftsData, error: shiftsError } = await supabase
    .from("production_shifts")
    .select("id, code, name")
    .is("deleted_at", null);

  if (shiftsError) {
    console.error("Error loading shifts:", shiftsError);
    process.exit(1);
  }

  const shiftMap = new Map();
  (shiftsData || []).forEach((s) => {
    if (s.id) {
      shiftMap.set(String(s.id).trim(), {
        id: String(s.id).trim(),
        code: String(s.code || "").trim(),
        name: String(s.name || "").trim(),
      });
    }
  });
  console.log(`Loaded ${shiftMap.size} active shifts.`);

  // 2. Fetch all active section-shift assignments
  console.log("Fetching production_section_shifts...");
  const { data: sectionShiftsData, error: secShiftsError } = await supabase
    .from("production_section_shifts")
    .select("id, shift_id")
    .is("deleted_at", null);

  if (secShiftsError) {
    console.error("Error loading section shifts:", secShiftsError);
    process.exit(1);
  }

  const sectionShiftObjMap = new Map();
  (sectionShiftsData || []).forEach((ss) => {
    if (ss.id && ss.shift_id) {
      const actualShift = shiftMap.get(String(ss.shift_id).trim());
      if (actualShift) {
        sectionShiftObjMap.set(String(ss.id).trim(), actualShift);
      }
    }
  });
  console.log(`Loaded ${sectionShiftObjMap.size} active section shift assignments.`);

  // 3. Query all sub plans where shift_id is not null but shift_code is null
  console.log("\nSearching for affected WIP sub-plan rows in production_plan_status...");
  const { data: affectedRows, error: affectedError } = await supabase
    .from("production_plan_status")
    .select("plan_id, sku_code, sku_name, master_plan_no, period_start, shift_id, shift_code, shift_name")
    .eq("plan_kind", "sub")
    .not("shift_id", "is", null)
    .is("shift_code", null);

  if (affectedError) {
    console.error("Error loading affected plans:", affectedError);
    process.exit(1);
  }

  const totalAffected = affectedRows?.length || 0;
  console.log(`Found ${totalAffected} sub-plan rows missing shift codes.`);

  if (totalAffected === 0) {
    console.log("No historical sub-plans require repair. Everything is clean!");
    process.exit(0);
  }

  let repairedCount = 0;

  for (const row of affectedRows) {
    const rawSid = String(row.shift_id || "").trim();
    let resolvedShift = null;

    if (rawSid) {
      if (sectionShiftObjMap.has(rawSid)) {
        resolvedShift = sectionShiftObjMap.get(rawSid);
      } else if (shiftMap.has(rawSid)) {
        resolvedShift = shiftMap.get(rawSid);
      }
    }

    if (resolvedShift) {
      console.log(`\nRow: Plan [${row.plan_id}] (${row.sku_name || row.sku_code}) on [${row.period_start}]`);
      console.log(`  Raw shift_id:  ${row.shift_id}`);
      console.log(`  Resolved shift: [${resolvedShift.code}] "${resolvedShift.name}"`);

      if (args.apply) {
        const { error: updateError } = await supabase
          .from("production_plan_status")
          .update({
            shift_code: resolvedShift.code,
            shift_name: resolvedShift.name,
          })
          .eq("plan_id", row.plan_id);

        if (updateError) {
          console.error(`  [ERROR] Failed to update:`, updateError.message);
        } else {
          console.log(`  [SUCCESS] Successfully repaired.`);
          repairedCount++;
        }
      } else {
        console.log(`  [DRY RUN] Will update to shift_code="${resolvedShift.code}"`);
        repairedCount++;
      }
    } else {
      console.warn(`\nRow: Plan [${row.plan_id}] (${row.sku_name || row.sku_code})`);
      console.warn(`  [WARNING] Unable to resolve shift details for shift_id: "${row.shift_id}"`);
    }
  }

  console.log("\n=== Repair Summary ===");
  if (args.apply) {
    console.log(`Successfully repaired and saved ${repairedCount} / ${totalAffected} rows.`);
  } else {
    console.log(`Dry run complete. ${repairedCount} / ${totalAffected} rows can be resolved.`);
    console.log("To apply these changes, run the script with: node scripts/repair-subplan-shifts.js --apply");
  }
}

run().catch(console.error);
