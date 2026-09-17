import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync("./.env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabase = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const lotCode = "0707260002-1";
  
  const { data: items, error } = await supabase
    .from("production_stock_issue_items")
    .select(`
      id,
      status,
      barcode,
      weight_kg,
      issue_document_id,
      production_stock_issue_documents!inner(
        issue_no,
        issue_date,
        status
      )
    `)
    .eq("lot_no", lotCode);

  if (error) {
    console.error(error);
    return;
  }

  const docSummary = {};
  items.forEach((item) => {
    const doc = item.production_stock_issue_documents;
    const docId = item.issue_document_id;
    if (!docSummary[docId]) {
      docSummary[docId] = {
        issue_no: doc.issue_no,
        issue_date: doc.issue_date,
        doc_status: doc.status,
        item_count: 0,
        total_weight: 0
      };
    }
    docSummary[docId].item_count++;
    docSummary[docId].total_weight += item.weight_kg || 0;
  });

  console.log("Documents containing items of lot 0707260002-1:");
  console.table(Object.values(docSummary));
}

run();
