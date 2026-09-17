import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  buildBarcodeRange,
  buildRestoreMovement,
  buildRestoredMetadata,
  validateRestoreCandidates,
} from "./lib/restore-voided-weight-receipts.mjs";

const TARGET = Object.freeze({
  firstBarcode: "18072600020204",
  lastBarcode: "18072600020222",
  productCode: "WKB-0002",
  lotNo: "1807260002-1",
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function assertOnePerBarcode(rows, barcodes, label) {
  const counts = new Map();
  rows.forEach((row) => {
    const barcode = String(row.source_document_no || "").trim();
    counts.set(barcode, (counts.get(barcode) || 0) + 1);
  });
  for (const barcode of barcodes) {
    if (counts.get(barcode) !== 1) {
      throw new Error(`${label}: expected exactly one row for ${barcode}, found ${counts.get(barcode) || 0}`);
    }
  }
}

function bangkokDate(isoTimestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTimestamp));
}

async function loadScope(supabase, barcodes) {
  const receiptsResult = await supabase
    .from("production_weight_receipts")
    .select("id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,barcode,weighed_at,status,metadata")
    .in("barcode", barcodes)
    .order("barcode", { ascending: true });
  if (receiptsResult.error) throw receiptsResult.error;
  const receipts = receiptsResult.data || [];

  const configIds = unique(receipts.map((row) => row.product_config_id));
  const lotIds = unique(receipts.map((row) => row.lot_id));
  const [configsResult, lotsResult] = await Promise.all([
    supabase
      .from("production_weight_scale_products")
      .select("id,department_id,sku_code")
      .in("id", configIds),
    supabase
      .from("production_weight_scale_lots")
      .select("id,product_config_id,lot_code")
      .in("id", lotIds),
  ]);
  if (configsResult.error) throw configsResult.error;
  if (lotsResult.error) throw lotsResult.error;

  const configById = new Map((configsResult.data || []).map((row) => [row.id, row]));
  const lotById = new Map((lotsResult.data || []).map((row) => [row.id, row]));
  const candidates = receipts.map((row) => ({
    ...row,
    product_code: configById.get(row.product_config_id)?.sku_code || "",
    lot_no: lotById.get(row.lot_id)?.lot_code || "",
  }));
  const receiptIds = candidates.map((row) => row.id);

  const [movementsResult, issueItemsResult] = await Promise.all([
    supabase
      .from("production_stock_movements")
      .select("id,movement_no,movement_type,movement_date,movement_at,department_id,department_code,product_code,product_name_snapshot,category_code,lot_no,uom_name,quantity_in,quantity_out,weight_in_kg,weight_out_kg,source_document_type,source_document_no,reference_type,reference_no,metadata")
      .in("source_document_no", barcodes)
      .in("source_document_type", ["weight_receipt", "weight_receipt_void", "weight_receipt_restore"]),
    supabase
      .from("production_stock_issue_items")
      .select("id,source_receipt_id,barcode,status,issue_document_id")
      .in("source_receipt_id", receiptIds),
  ]);
  if (movementsResult.error) throw movementsResult.error;
  if (issueItemsResult.error) throw issueItemsResult.error;

  return {
    candidates,
    movements: movementsResult.data || [],
    issueItems: issueItemsResult.data || [],
  };
}

function validateScope(scope, barcodes) {
  validateRestoreCandidates(scope.candidates, {
    barcodes,
    productCode: TARGET.productCode,
    lotNo: TARGET.lotNo,
  });

  const receiptMovements = scope.movements.filter(
    (row) => row.movement_type === "receipt_in" && row.source_document_type === "weight_receipt"
  );
  const voidMovements = scope.movements.filter(
    (row) => row.movement_type === "adjustment_out" && row.source_document_type === "weight_receipt_void"
  );
  const priorRestores = scope.movements.filter(
    (row) => row.source_document_type === "weight_receipt_restore"
  );
  const activeIssueItems = scope.issueItems.filter(
    (row) => String(row.status || "").toLowerCase() === "confirmed"
  );

  assertOnePerBarcode(receiptMovements, barcodes, "original receipt movement");
  assertOnePerBarcode(voidMovements, barcodes, "void movement");
  if (priorRestores.length) {
    throw new Error(`Found ${priorRestores.length} prior restore movements; refusing to restore twice`);
  }
  if (activeIssueItems.length) {
    throw new Error(`Found ${activeIssueItems.length} confirmed stock issue items; refusing unsafe restore`);
  }

  const candidateByBarcode = new Map(scope.candidates.map((row) => [row.barcode, row]));
  for (const movement of voidMovements) {
    const receipt = candidateByBarcode.get(movement.source_document_no);
    if (
      movement.product_code !== TARGET.productCode
      || movement.lot_no !== TARGET.lotNo
      || Number(movement.quantity_out) !== 1
      || Number(movement.weight_out_kg) !== Number(receipt.net_weight_kg)
    ) {
      throw new Error(`Void movement does not exactly match receipt ${movement.source_document_no}`);
    }
  }

  return { receiptMovements, voidMovements, activeIssueItems };
}

async function rollback(supabase, updatedReceipts, insertedMovementIds) {
  for (const receipt of [...updatedReceipts].reverse()) {
    const result = await supabase
      .from("production_weight_receipts")
      .update({ status: receipt.status, metadata: receipt.metadata || {} })
      .eq("id", receipt.id);
    if (result.error) console.error(`Rollback failed for receipt ${receipt.barcode}: ${result.error.message}`);
  }
  if (insertedMovementIds.length) {
    const result = await supabase
      .from("production_stock_movements")
      .delete()
      .in("id", insertedMovementIds);
    if (result.error) console.error(`Rollback failed for restore movements: ${result.error.message}`);
  }
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const apply = process.argv.includes("--apply");
  const verify = process.argv.includes("--verify");
  const barcodes = buildBarcodeRange(TARGET.firstBarcode, TARGET.lastBarcode);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const before = await loadScope(supabase, barcodes);
  if (verify) {
    const recordedCount = before.candidates.filter((row) => row.status === "recorded").length;
    const restoreMovements = before.movements.filter(
      (row) => row.movement_type === "adjustment_in"
        && row.source_document_type === "weight_receipt_restore"
    );
    const confirmedIssueCount = before.issueItems.filter(
      (row) => String(row.status || "").toLowerCase() === "confirmed"
    ).length;
    const restoredWeightKg = Number(
      restoreMovements.reduce((total, row) => total + Number(row.weight_in_kg), 0).toFixed(3)
    );
    if (
      before.candidates.length !== barcodes.length
      || recordedCount !== barcodes.length
      || restoreMovements.length !== barcodes.length
      || confirmedIssueCount !== 0
    ) {
      throw new Error(
        `Verification failed: receipts=${before.candidates.length}, recorded=${recordedCount}, restores=${restoreMovements.length}, confirmedIssues=${confirmedIssueCount}`
      );
    }
    process.stdout.write(`${JSON.stringify({
      mode: "verify",
      receiptCount: before.candidates.length,
      recordedCount,
      restoreMovementCount: restoreMovements.length,
      confirmedIssueCount,
      restoredWeightKg,
      firstBarcode: TARGET.firstBarcode,
      lastBarcode: TARGET.lastBarcode,
    }, null, 2)}\n`);
    return;
  }
  const validated = validateScope(before, barcodes);
  const netWeightKg = Number(
    before.candidates.reduce((total, row) => total + Number(row.net_weight_kg), 0).toFixed(3)
  );

  if (!apply) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      target: TARGET,
      receiptCount: before.candidates.length,
      voidMovementCount: validated.voidMovements.length,
      confirmedIssueCount: validated.activeIssueItems.length,
      netWeightKg,
      statuses: unique(before.candidates.map((row) => row.status)),
      instruction: "Validation passed. Re-run with --apply to restore this exact set.",
    }, null, 2)}\n`);
    return;
  }

  const restoredAt = new Date().toISOString();
  const batchId = `${restoredAt.replace(/\D/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
  const receiptByBarcode = new Map(before.candidates.map((row) => [row.barcode, row]));
  const restoreMovements = validated.voidMovements.map((voidMovement) => ({
    ...buildRestoreMovement(voidMovement, {
      receiptId: receiptByBarcode.get(voidMovement.source_document_no).id,
      barcode: voidMovement.source_document_no,
      batchId,
      restoredAt,
    }),
    movement_date: bangkokDate(restoredAt),
  }));
  const insertedMovementIds = [];
  const updatedReceipts = [];

  try {
    const insertResult = await supabase
      .from("production_stock_movements")
      .insert(restoreMovements)
      .select("id");
    if (insertResult.error) throw insertResult.error;
    insertedMovementIds.push(...(insertResult.data || []).map((row) => row.id));
    if (insertedMovementIds.length !== barcodes.length) {
      throw new Error(`Expected ${barcodes.length} restore movements, inserted ${insertedMovementIds.length}`);
    }

    for (const receipt of before.candidates) {
      const updateResult = await supabase
        .from("production_weight_receipts")
        .update({
          status: "recorded",
          metadata: buildRestoredMetadata(receipt.metadata, { restoredAt, batchId }),
        })
        .eq("id", receipt.id)
        .eq("status", "voided")
        .select("id");
      if (updateResult.error) throw updateResult.error;
      if ((updateResult.data || []).length !== 1) {
        throw new Error(`Receipt ${receipt.barcode} changed during repair`);
      }
      updatedReceipts.push(receipt);
    }
  } catch (error) {
    await rollback(supabase, updatedReceipts, insertedMovementIds);
    throw error;
  }

  const after = await loadScope(supabase, barcodes);
  const recordedCount = after.candidates.filter((row) => row.status === "recorded").length;
  const restoreCount = after.movements.filter(
    (row) => row.source_document_type === "weight_receipt_restore"
      && row.metadata?.restoredBatchId === batchId
  ).length;
  if (recordedCount !== barcodes.length || restoreCount !== barcodes.length) {
    throw new Error(`Post-repair verification failed: recorded=${recordedCount}, restores=${restoreCount}`);
  }

  process.stdout.write(`${JSON.stringify({
    mode: "applied",
    batchId,
    restoredReceiptCount: recordedCount,
    restoreMovementCount: restoreCount,
    restoredNetWeightKg: netWeightKg,
    firstBarcode: TARGET.firstBarcode,
    lastBarcode: TARGET.lastBarcode,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
