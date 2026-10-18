import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

nextEnv.loadEnvConfig(process.cwd());
const startedAt = new Date().toISOString();
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) },
  });
async function readAll(table, columns, order) {
  const initial = await db.from(table).select("*", { count: "exact", head: true });
  if (initial.error) throw new Error(table + ": " + initial.error.message);
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select(columns).range(offset, offset + 499);
    for (const column of order) query = query.order(column);
    const result = await query;
    if (result.error) throw new Error(table + ": " + result.error.message);
    rows.push(...result.data);
    if (offset && offset % 10000 === 0) console.log(table + ": read " + rows.length);
    if (result.data.length < 500) break;
  }
  const final = await db.from(table).select("*", { count: "exact", head: true });
  if (final.error) throw new Error(table + ": " + final.error.message);
  return { rows, initialCount: initial.count, finalCount: final.count,
    countStable: initial.count === final.count && rows.length === final.count };
}
const normalize = value => String(value || "").trim().toUpperCase();
const digits = value => normalize(value).replace(/\D/g, "").slice(-4).padStart(4, "0");
function group(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const value = key(row);
    const existing = result.get(value) || [];
    existing.push(row);
    result.set(value, existing);
  }
  return result;
}

try {
  const tables = {};
  for (const [table, columns, order] of [
    ["products_cache", "sku_code,sku_name,iccat_code", ["sku_code"]],
    ["production_departments", "id,code,name", ["id"]],
    ["production_department_product_subcategories", "id,department_id,name", ["id"]],
    ["production_department_products", "department_id,sku_code,subcategory_id", ["department_id", "sku_code"]],
    ["production_weight_scale_products", "id,department_id,sku_code,is_active", ["id"]],
    ["production_weight_receipts", "id,barcode,request_id,product_config_id,metadata,status", ["id"]],
  ]) tables[table] = await readAll(table, columns, order);
  const departments = new Map(tables.production_departments.rows.map(row => [row.id, row]));
  const products = new Map(tables.products_cache.rows.map(row => [normalize(row.sku_code), row]));
  const configs = new Map(tables.production_weight_scale_products.rows.map(row => [row.id, row]));
  const mappings = tables.production_department_products.rows;
  const shellIds = new Set(tables.production_department_product_subcategories.rows
    .filter(row => departments.get(row.department_id)?.code === "KP13" && row.name === "เปลือก").map(row => row.id));
  const legacyCodes = new Set(mappings.filter(row => shellIds.has(row.subcategory_id))
    .map(row => normalize(row.sku_code)).filter(code => products.get(code)?.iccat_code === "03"));
  const wip = tables.products_cache.rows.filter(row => row.iccat_code === "03").map(row => ({
    code: normalize(row.sku_code), name: row.sku_name, digits: digits(row.sku_code),
    departments: [...new Set(mappings.filter(m => normalize(m.sku_code) === normalize(row.sku_code))
      .map(m => departments.get(m.department_id)?.code))].filter(Boolean),
    legacySelectable: legacyCodes.has(normalize(row.sku_code)),
  }));
  const mapped = wip.filter(row => row.departments.length);
  const collisions = [...group(wip, row => row.digits)].filter(([, rows]) => rows.length > 1)
    .map(([identifier, rows]) => ({ digits: identifier, products: rows }));
  const crossPageCollisions = wip.filter(row => row.legacySelectable).flatMap(old =>
    mapped.filter(other => !other.legacySelectable && other.code !== old.code && other.digits === old.digits)
      .map(other => ({ digits: old.digits, legacyProduct: old.code, newCandidate: other.code, departments: other.departments })));
  const receipts = tables.production_weight_receipts.rows;
  const numeric = receipts.filter(row => /^\d{14}$/.test(row.barcode || ""));
  const sourceCode = row => normalize(configs.get(row.product_config_id)?.sku_code);
  const historicalIdentifiers = [...group(numeric, row => row.barcode.slice(6, 10))]
    .map(([identifier, rows]) => ({ digits: identifier, count: rows.length,
      productCodes: [...new Set(rows.map(sourceCode))].filter(Boolean),
      maximumRunning: Math.max(...rows.map(row => Number(row.barcode.slice(10)))),
    }));
  const duplicates = (key) => [...group(receipts.filter(row => row[key]), row => row[key])]
    .filter(([, rows]) => rows.length > 1).map(([value, rows]) => ({ value, count: rows.length }));
  const overrides = [...new Set(receipts.filter(row => row.metadata?.barcodeProductCode)
    .map(row => sourceCode(row) + " -> " + normalize(row.metadata.barcodeProductCode)))];
  const reserved = new Set([...wip.map(row => row.digits), ...historicalIdentifiers.map(row => row.digits)]);
  const available = Array.from({ length: 9999 }, (_, index) => String(index + 1).padStart(4, "0")).filter(value => !reserved.has(value));
  const report = {
    startedAt, completedAt: new Date().toISOString(),
    method: "Paginated SELECT through Data API; no writes; not a transaction snapshot",
    pagination: Object.fromEntries(Object.entries(tables).map(([table, result]) => [table, {
      fetched: result.rows.length, initialCount: result.initialCount, finalCount: result.finalCount, countStable: result.countStable,
    }])),
    counts: { wip: wip.length, mappedWip: mapped.length, legacySelectable: legacyCodes.size,
      masterCollisionGroups: collisions.length, mappedCollisionGroups: collisions.filter(row => row.products.filter(p => p.departments.length).length > 1).length,
      receipts: receipts.length, numeric14Receipts: numeric.length, otherLabelReceipts: receipts.length - numeric.length,
      availableUnderConservativeAudit: available.length },
    legacyProducts: wip.filter(row => row.legacySelectable),
    crossPageCollisions, masterCollisions: collisions,
    duplicateBarcodes: duplicates("barcode"), duplicateRequestIds: duplicates("request_id"),
    historicalIdentifiers, barcodeOverrides: overrides,
    digitExtractionDisagreements: wip.filter(row => {
      const match = row.code.match(/(\d+)(?!.*\d)/);
      return match && match[1].padStart(4, "0") !== row.digits;
    }),
    availableIdentifiers: available,
    gates: [
      "No assignments approved or database/schema changes performed.",
      "New live picker currently includes legacy products; department/subcategory allowlist is not finalized.",
      "Available means absent from inspected WIP defaults and existing 14-digit receipts, not reserved for future use.",
      "Concurrent edits and future legacy product/override additions require re-audit; stable counts are not snapshot isolation.",
      "Full SQL index/trigger audit is still unavailable when the direct database connection times out.",
    ],
  };
  const directory = path.resolve("output", "scale-audit");
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "product-identifiers-" + startedAt.replace(/[:.]/g, "-") + ".json");
  writeFileSync(filename, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ filename, counts: report.counts,
    countStable: Object.values(tables).every(result => result.countStable),
    crossPageCollisions, duplicateBarcodeCount: report.duplicateBarcodes.length,
    duplicateRequestCount: report.duplicateRequestIds.length,
    extractionDisagreements: report.digitExtractionDisagreements.map(row => row.code),
    barcodeOverrides: overrides,
  }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
