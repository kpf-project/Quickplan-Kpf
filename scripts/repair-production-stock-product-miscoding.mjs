import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  buildCandidateReceipts,
  buildRepairScope,
  getReceiptProductionDate,
  replaceInvariantLotCodes,
  summarizeLedgerInvariants,
  summarizeReceiptInvariants,
} from "./lib/production-stock-product-repair.mjs";

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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv) {
  const values = new Map();
  argv.forEach((arg) => {
    const separatorIndex = arg.indexOf("=");
    if (!arg.startsWith("--") || separatorIndex <= 2) return;
    values.set(arg.slice(2, separatorIndex), arg.slice(separatorIndex + 1));
  });

  return {
    apply: argv.includes("--apply"),
    wrongCode: normalizeText(values.get("from") || "WKB-0002-2").toUpperCase(),
    correctCode: normalizeText(values.get("to") || "WKB-0002").toUpperCase(),
    targetLot: normalizeText(values.get("target-lot")),
    targetDates: argv
      .filter((arg) => arg.startsWith("--date="))
      .map((arg) => normalizeText(arg.slice("--date=".length)))
      .filter(Boolean),
  };
}

async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await buildQuery().range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
}

async function fetchByChunks(values, buildQuery, chunkSize = 75) {
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    rows.push(...await fetchAll(() => buildQuery(values.slice(index, index + chunkSize))));
  }
  return rows;
}

function chunkValues(values, chunkSize = 75) {
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function summarizeIssueInvariants(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const sum = (field) => Number(
    sourceRows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0).toFixed(3)
  );
  return {
    rowCount: sourceRows.length,
    lotCodes: Array.from(new Set(sourceRows.map((row) => normalizeText(row?.lot_no)).filter(Boolean))).sort(),
    statuses: Array.from(new Set(sourceRows.map((row) => normalizeText(row?.status)).filter(Boolean))).sort(),
    quantity: sum("quantity"),
    weightKg: sum("weight_kg"),
  };
}

function invariantEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function updateRowsWithRollback(
  supabase,
  appliedOperations,
  { table, ids, values, rollbackValues }
) {
  for (const idChunk of chunkValues(ids)) {
    const result = await supabase.from(table).update(values).in("id", idChunk).select("id");
    if (result.error) throw result.error;
    const updatedIds = (result.data || []).map((row) => row.id);
    if (updatedIds.length !== idChunk.length) {
      throw new Error(`Expected to update ${idChunk.length} rows in ${table}, updated ${updatedIds.length}`);
    }
    appliedOperations.push({ table, ids: updatedIds, values: rollbackValues });
  }
}

async function updateProductIdentityRows(
  supabase,
  appliedOperations,
  { table, rows, values, rollbackIdentity, targetLot }
) {
  if (!targetLot) {
    await updateRowsWithRollback(supabase, appliedOperations, {
      table,
      ids: rows.map((row) => row.id),
      values,
      rollbackValues: rollbackIdentity,
    });
    return;
  }

  const rowsByOriginalLot = new Map();
  rows.forEach((row) => {
    const originalLot = normalizeText(row.lot_no);
    const current = rowsByOriginalLot.get(originalLot) || [];
    current.push(row.id);
    rowsByOriginalLot.set(originalLot, current);
  });
  for (const [originalLot, ids] of rowsByOriginalLot) {
    await updateRowsWithRollback(supabase, appliedOperations, {
      table,
      ids,
      values: { ...values, lot_no: targetLot },
      rollbackValues: { ...rollbackIdentity, lot_no: originalLot },
    });
  }
}

async function rollbackAppliedOperations(supabase, appliedOperations) {
  const rollbackErrors = [];
  for (const operation of [...appliedOperations].reverse()) {
    for (const idChunk of chunkValues(operation.ids)) {
      const result = await supabase.from(operation.table).update(operation.values).in("id", idChunk);
      if (result.error) rollbackErrors.push(`${operation.table}: ${result.error.message}`);
    }
  }
  return rollbackErrors;
}

function groupCandidatesByDate(candidates) {
  const grouped = new Map();
  candidates.forEach((row) => {
    const date = getReceiptProductionDate(row) || "unknown";
    const current = grouped.get(date) || [];
    current.push(row);
    grouped.set(date, current);
  });
  return Array.from(grouped.entries()).map(([productionDate, rows]) => ({
    productionDate,
    ...summarizeReceiptInvariants(rows),
    barcodes: rows.map((row) => row.barcode),
  }));
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        try {
          return await fetch(input, init);
        } catch (error) {
          const requestUrl = new URL(typeof input === "string" ? input : input.url);
          const causeCode = error?.cause?.code || "unknown";
          throw new Error(`Supabase request failed at ${requestUrl.pathname} (${causeCode})`, {
            cause: error,
          });
        }
      },
    },
  });

  const productsResult = await supabase
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name")
    .in("sku_code", [options.wrongCode, options.correctCode]);
  if (productsResult.error) throw productsResult.error;

  const configs = await fetchAll(() => supabase
    .from("production_weight_scale_products")
    .select("id,department_id,sku_code,is_active,current_lot_id")
    .in("sku_code", [options.wrongCode, options.correctCode]));
  const wrongConfigs = configs.filter((row) => normalizeText(row.sku_code).toUpperCase() === options.wrongCode);
  const correctConfigs = configs.filter((row) => normalizeText(row.sku_code).toUpperCase() === options.correctCode);
  if (!wrongConfigs.length) throw new Error(`No scale configuration found for ${options.wrongCode}`);

  const allWrongReceipts = await fetchAll(() => supabase
    .from("production_weight_receipts")
    .select("id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,status,metadata")
    .in("product_config_id", wrongConfigs.map((row) => row.id))
    .order("weighed_at", { ascending: true }));

  const allLotIds = Array.from(new Set(allWrongReceipts.map((row) => row.lot_id).filter(Boolean)));
  const lots = allLotIds.length
    ? await fetchAll(() => supabase
        .from("production_weight_scale_lots")
        .select("id,product_config_id,lot_code,status,opened_at,closed_at")
        .in("id", allLotIds))
    : [];
  const lotById = new Map(lots.map((row) => [row.id, row]));
  const receiptsWithLot = allWrongReceipts.map((row) => ({
    ...row,
    lot_code: lotById.get(row.lot_id)?.lot_code || "",
  }));

  const candidates = buildCandidateReceipts(receiptsWithLot, {
    wrongConfigIds: wrongConfigs.map((row) => row.id),
    targetDates: options.targetDates,
  });
  const candidateIds = candidates.map((row) => row.id);

  if (options.targetDates.length === 0) {
    process.stdout.write(`${JSON.stringify({
      mode: "date-discovery",
      from: options.wrongCode,
      to: options.correctCode,
      products: productsResult.data,
      candidateDateGroups: groupCandidatesByDate(candidates),
      instruction: "Re-run with one or more --date=YYYY-MM-DD filters before inspecting downstream rows.",
    }, null, 2)}\n`);
    return;
  }

  const issueItems = candidateIds.length
    ? await fetchByChunks(candidateIds, (ids) => supabase
        .from("production_stock_issue_items")
        .select("id,source_receipt_id,issue_document_id,barcode,product_code,product_name_snapshot,lot_no,quantity,weight_kg,status")
        .in("source_receipt_id", ids))
    : [];
  const prisonIssueItems = candidateIds.length
    ? await fetchByChunks(candidateIds, (ids) => supabase
        .from("production_prison_issue_items")
        .select("id,source_receipt_id,source_issue_item_id,barcode,product_code,product_name_snapshot,lot_no,quantity,weight_kg,status")
        .in("source_receipt_id", ids))
    : [];
  const erpExportLines = candidateIds.length
    ? await fetchByChunks(candidateIds, (ids) => supabase
        .from("production_erp_export_lines")
        .select("id,source_receipt_id,batch_id,document_no,trade_code,quantity,unit_weight_kg,lot_no,production_date,created_at")
        .in("source_receipt_id", ids))
    : [];
  const oldProductMovements = candidates.length
    ? await fetchAll(() => supabase
        .from("production_stock_movements")
        .select("id,movement_no,movement_type,movement_date,product_code,product_name_snapshot,lot_no,quantity_in,quantity_out,weight_in_kg,weight_out_kg,source_document_type,source_document_no,metadata")
        .eq("product_code", options.wrongCode))
    : [];

  const scope = buildRepairScope({
    candidateReceipts: candidates,
    receipts: receiptsWithLot,
    issueItems,
    movements: oldProductMovements,
  });

  const correctConfigByDepartment = new Map(correctConfigs.map((row) => [row.department_id, row]));
  const wrongConfigById = new Map(wrongConfigs.map((row) => [row.id, row]));
  const missingCorrectConfigDepartments = wrongConfigs
    .filter((row) => candidates.some((receipt) => receipt.product_config_id === row.id))
    .filter((row) => !correctConfigByDepartment.has(row.department_id))
    .map((row) => row.department_id);

  const affectedCorrectConfigIds = Array.from(new Set(
    candidates
      .map((receipt) => wrongConfigById.get(receipt.product_config_id)?.department_id)
      .map((departmentId) => correctConfigByDepartment.get(departmentId)?.id)
      .filter(Boolean)
  ));
  const candidateLotCodes = options.targetLot
    ? [options.targetLot]
    : Array.from(new Set(candidates.map((row) => row.lot_code).filter(Boolean)));
  const correctLots = affectedCorrectConfigIds.length && candidateLotCodes.length
    ? await fetchAll(() => supabase
        .from("production_weight_scale_lots")
        .select("id,product_config_id,lot_code,status,opened_at,closed_at")
        .in("product_config_id", affectedCorrectConfigIds)
        .in("lot_code", candidateLotCodes))
    : [];
  const correctLotByKey = new Map(
    correctLots.map((row) => [`${row.product_config_id}|${row.lot_code}`, row])
  );
  const missingCorrectLots = [];
  candidates.forEach((receipt) => {
    const wrongConfig = wrongConfigById.get(receipt.product_config_id);
    const correctConfig = correctConfigByDepartment.get(wrongConfig?.department_id);
    const targetLotCode = options.targetLot || receipt.lot_code;
    if (!correctConfig || !targetLotCode) return;
    const key = `${correctConfig.id}|${targetLotCode}`;
    if (correctLotByKey.has(key) || missingCorrectLots.some((row) => row.key === key)) return;
    missingCorrectLots.push({
      key,
      correctConfigId: correctConfig.id,
      lotCode: targetLotCode,
      sourceLot: lotById.get(receipt.lot_id) || null,
      sourceReceipt: receipt,
    });
  });

  const applyBlockedReasons = [
    ...(options.targetDates.length === 0 ? ["No --date filters supplied"] : []),
    ...(missingCorrectConfigDepartments.length ? ["Correct product scale configuration is missing"] : []),
    ...(erpExportLines.length ? ["Some receipts already exist in ERP export history"] : []),
    ...(candidates.length === 0 ? ["No candidate receipts found"] : []),
    ...(options.targetLot && options.targetDates.length !== 1
      ? ["--target-lot requires exactly one --date filter"]
      : []),
  ];

  if (!options.apply) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      from: options.wrongCode,
      to: options.correctCode,
      products: productsResult.data,
      requestedDates: options.targetDates,
      targetLot: options.targetLot || null,
      candidateDateGroups: groupCandidatesByDate(candidates),
      candidateReceiptCount: candidates.length,
      candidateReceiptIds: candidateIds,
      candidateBarcodes: candidates.map((row) => row.barcode),
      derivedReturnReceiptCount: scope.derivedReturnReceipts.length,
      issueItemCount: scope.issueItems.length,
      prisonIssueItemCount: prisonIssueItems.length,
      movementCount: scope.movements.length,
      erpExportLineCount: erpExportLines.length,
      erpExportLines,
      missingCorrectConfigDepartments,
      missingCorrectLots: missingCorrectLots.map((row) => row.lotCode),
      applyBlockedReasons,
    }, null, 2)}\n`);
    return;
  }

  if (applyBlockedReasons.length) {
    throw new Error(`Repair blocked: ${applyBlockedReasons.join("; ")}`);
  }

  const correctProduct = (productsResult.data || []).find(
    (row) => normalizeText(row?.sku_code).toUpperCase() === options.correctCode
  );
  if (!correctProduct) throw new Error(`Product master not found for ${options.correctCode}`);

  const appliedOperations = [];
  const createdLotIds = [];
  try {
    for (const missingLot of missingCorrectLots) {
      const insertResult = await supabase
        .from("production_weight_scale_lots")
        .insert({
          product_config_id: missingLot.correctConfigId,
          lot_code: missingLot.lotCode,
          status: options.targetLot ? "active" : missingLot.sourceLot?.status || "closed",
          opened_at:
            options.targetLot
              ? missingLot.sourceReceipt?.weighed_at || new Date().toISOString()
              : missingLot.sourceLot?.opened_at || new Date().toISOString(),
          closed_at: options.targetLot ? null : missingLot.sourceLot?.closed_at || null,
        })
        .select("id,product_config_id,lot_code,status,opened_at,closed_at")
        .single();
      if (insertResult.error) throw insertResult.error;
      correctLotByKey.set(missingLot.key, insertResult.data);
      createdLotIds.push(insertResult.data.id);
    }

    if (options.targetLot) {
      for (const correctConfigId of affectedCorrectConfigIds) {
        const correctConfig = correctConfigs.find((row) => row.id === correctConfigId);
        const targetLot = correctLotByKey.get(`${correctConfigId}|${options.targetLot}`);
        if (!targetLot) throw new Error(`Target lot ${options.targetLot} was not resolved`);

        await updateRowsWithRollback(supabase, appliedOperations, {
          table: "production_weight_scale_products",
          ids: [correctConfigId],
          values: { current_lot_id: targetLot.id },
          rollbackValues: { current_lot_id: correctConfig?.current_lot_id || null },
        });
        if (!createdLotIds.includes(targetLot.id)) {
          await updateRowsWithRollback(supabase, appliedOperations, {
            table: "production_weight_scale_lots",
            ids: [targetLot.id],
            values: { status: "active", closed_at: null },
            rollbackValues: {
              status: targetLot.status,
              closed_at: targetLot.closed_at || null,
            },
          });
        }
      }

      const sourceLotIds = Array.from(new Set(candidates.map((row) => row.lot_id).filter(Boolean)));
      for (const sourceLotId of sourceLotIds) {
        const sourceLot = lotById.get(sourceLotId);
        await updateRowsWithRollback(supabase, appliedOperations, {
          table: "production_weight_scale_lots",
          ids: [sourceLotId],
          values: { status: "closed", closed_at: new Date().toISOString() },
          rollbackValues: {
            status: sourceLot?.status || "active",
            closed_at: sourceLot?.closed_at || null,
          },
        });
      }
      for (const wrongConfig of wrongConfigs) {
        if (!sourceLotIds.includes(wrongConfig.current_lot_id)) continue;
        await updateRowsWithRollback(supabase, appliedOperations, {
          table: "production_weight_scale_products",
          ids: [wrongConfig.id],
          values: { current_lot_id: null },
          rollbackValues: { current_lot_id: wrongConfig.current_lot_id },
        });
      }
    }

    const receiptsToUpdate = [...candidates, ...scope.derivedReturnReceipts];
    const receiptGroups = new Map();
    receiptsToUpdate.forEach((receipt) => {
      const wrongConfig = wrongConfigById.get(receipt.product_config_id);
      const correctConfig = correctConfigByDepartment.get(wrongConfig?.department_id);
      const targetLotCode = options.targetLot || receipt.lot_code;
      const correctLot = correctLotByKey.get(`${correctConfig?.id}|${targetLotCode}`);
      if (!correctConfig || !correctLot) {
        throw new Error(`Unable to map receipt ${receipt.id} to the correct product lot`);
      }
      const key = [receipt.product_config_id, receipt.lot_id, correctConfig.id, correctLot.id].join("|");
      const group = receiptGroups.get(key) || {
        ids: [],
        values: { product_config_id: correctConfig.id, lot_id: correctLot.id },
        rollbackValues: { product_config_id: receipt.product_config_id, lot_id: receipt.lot_id },
      };
      group.ids.push(receipt.id);
      receiptGroups.set(key, group);
    });

    for (const group of receiptGroups.values()) {
      await updateRowsWithRollback(supabase, appliedOperations, {
        table: "production_weight_receipts",
        ...group,
      });
    }
    const rollbackIdentity = {
      product_code: options.wrongCode,
      product_name_snapshot: productsResult.data.find((row) => row.sku_code === options.wrongCode)?.sku_name || options.wrongCode,
    };
    await updateProductIdentityRows(supabase, appliedOperations, {
      table: "production_stock_issue_items",
      rows: scope.issueItems,
      values: { product_code: options.correctCode, product_name_snapshot: correctProduct.sku_name },
      rollbackIdentity,
      targetLot: options.targetLot,
    });
    await updateProductIdentityRows(supabase, appliedOperations, {
      table: "production_prison_issue_items",
      rows: prisonIssueItems,
      values: { product_code: options.correctCode, product_name_snapshot: correctProduct.sku_name },
      rollbackIdentity,
      targetLot: options.targetLot,
    });
    await updateProductIdentityRows(supabase, appliedOperations, {
      table: "production_stock_movements",
      rows: scope.movements,
      values: { product_code: options.correctCode, product_name_snapshot: correctProduct.sku_name },
      rollbackIdentity,
      targetLot: options.targetLot,
    });

    const updatedReceiptIds = receiptsToUpdate.map((row) => row.id);
    const verifiedReceipts = await fetchByChunks(updatedReceiptIds, (ids) => supabase
      .from("production_weight_receipts")
      .select("id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,status")
      .in("id", ids));
    const verifiedLotIds = Array.from(new Set(verifiedReceipts.map((row) => row.lot_id).filter(Boolean)));
    const verifiedLots = await fetchByChunks(verifiedLotIds, (ids) => supabase
      .from("production_weight_scale_lots")
      .select("id,lot_code")
      .in("id", ids));
    const verifiedLotById = new Map(verifiedLots.map((row) => [row.id, row.lot_code]));
    const verifiedReceiptsWithLot = verifiedReceipts.map((row) => ({
      ...row,
      lot_code: verifiedLotById.get(row.lot_id) || "",
    }));
    const verifiedIssueItems = await fetchByChunks(scope.issueItems.map((row) => row.id), (ids) => supabase
      .from("production_stock_issue_items")
      .select("id,product_code,product_name_snapshot,lot_no,quantity,weight_kg,status")
      .in("id", ids));
    const verifiedPrisonItems = await fetchByChunks(prisonIssueItems.map((row) => row.id), (ids) => supabase
      .from("production_prison_issue_items")
      .select("id,product_code,product_name_snapshot,lot_no,quantity,weight_kg,status")
      .in("id", ids));
    const verifiedMovements = await fetchByChunks(scope.movements.map((row) => row.id), (ids) => supabase
      .from("production_stock_movements")
      .select("id,movement_date,product_code,product_name_snapshot,lot_no,quantity_in,quantity_out,weight_in_kg,weight_out_kg")
      .in("id", ids));

    const beforeReceiptSummary = summarizeReceiptInvariants(receiptsToUpdate);
    const afterReceiptSummary = summarizeReceiptInvariants(verifiedReceiptsWithLot);
    const beforeIssueSummary = summarizeIssueInvariants(scope.issueItems);
    const afterIssueSummary = summarizeIssueInvariants(verifiedIssueItems);
    const beforePrisonSummary = summarizeIssueInvariants(prisonIssueItems);
    const afterPrisonSummary = summarizeIssueInvariants(verifiedPrisonItems);
    const beforeMovementSummary = summarizeLedgerInvariants(scope.movements);
    const afterMovementSummary = summarizeLedgerInvariants(verifiedMovements);
    const expectedReceiptSummary = replaceInvariantLotCodes(
      beforeReceiptSummary,
      options.targetLot
    );
    const expectedIssueSummary = replaceInvariantLotCodes(
      beforeIssueSummary,
      options.targetLot
    );
    const expectedPrisonSummary = replaceInvariantLotCodes(
      beforePrisonSummary,
      options.targetLot
    );
    const expectedMovementSummary = replaceInvariantLotCodes(
      beforeMovementSummary,
      options.targetLot
    );

    const productIdentityVerified = [
      ...verifiedIssueItems,
      ...verifiedPrisonItems,
      ...verifiedMovements,
    ].every((row) => (
      normalizeText(row.product_code).toUpperCase() === options.correctCode
      && normalizeText(row.product_name_snapshot) === normalizeText(correctProduct.sku_name)
    ));
    const receiptIdentityVerified = verifiedReceipts.every((receipt) => (
      affectedCorrectConfigIds.includes(receipt.product_config_id)
    ));
    if (
      !invariantEquals(expectedReceiptSummary, afterReceiptSummary)
      || !invariantEquals(expectedIssueSummary, afterIssueSummary)
      || !invariantEquals(expectedPrisonSummary, afterPrisonSummary)
      || !invariantEquals(expectedMovementSummary, afterMovementSummary)
      || !productIdentityVerified
      || !receiptIdentityVerified
    ) {
      throw new Error("Post-repair verification failed; starting rollback");
    }

    process.stdout.write(`${JSON.stringify({
      mode: "applied-and-verified",
      from: options.wrongCode,
      to: options.correctCode,
      productName: correctProduct.sku_name,
      dates: options.targetDates,
      targetLot: options.targetLot || null,
      receiptCount: candidates.length,
      returnReceiptCount: scope.derivedReturnReceipts.length,
      issueItemCount: scope.issueItems.length,
      prisonIssueItemCount: prisonIssueItems.length,
      movementCount: scope.movements.length,
      createdLotCount: createdLotIds.length,
      receiptInvariants: afterReceiptSummary,
      issueInvariants: afterIssueSummary,
      prisonIssueInvariants: afterPrisonSummary,
      movementInvariants: afterMovementSummary,
      barcodeValuesChanged: false,
    }, null, 2)}\n`);
    return;
  } catch (error) {
    const rollbackErrors = await rollbackAppliedOperations(supabase, appliedOperations);
    for (const lotId of [...createdLotIds].reverse()) {
      const deleteResult = await supabase.from("production_weight_scale_lots").delete().eq("id", lotId);
      if (deleteResult.error) rollbackErrors.push(`production_weight_scale_lots: ${deleteResult.error.message}`);
    }
    if (rollbackErrors.length) {
      throw new Error(`${error.message}; rollback errors: ${rollbackErrors.join(" | ")}`);
    }
    throw new Error(`${error.message}; all applied changes were rolled back`);
  }
}

main().catch((error) => {
  const cause = error?.cause;
  const details = [
    error?.message || String(error),
    cause?.code ? `cause=${cause.code}` : "",
    cause?.message ? `causeMessage=${cause.message}` : "",
  ].filter(Boolean).join(" ");
  process.stderr.write(`${details}\n`);
  process.exitCode = 1;
});
