# BOM Excel Import and Template Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy BOM Excel template/import flow with a single-file, multi-product importer that preserves current DEFAULT-formula FG/WIP BOM fields, trade codes, calculation bases, planning offsets, and approval behavior.

**Architecture:** Introduce a shared BOM import contract and pure normalization/merge layer used by workbook parsing, client preview preparation, Preview API, and Import API. Keep ExcelJS lazy-loaded in the browser, resolve authoritative product/trade-code metadata on the server in batches, and write each Parent BOM through one database RPC so a version and its items are atomic.

**Tech Stack:** Next.js 16 App Router, React 19, JavaScript ESM, ExcelJS 4.4, Supabase/Postgres, Node test runner, Tailwind CSS.

---

## File Structure

- Create `src/features/production-line/utils/bomImportContract.js`: column aliases, enums, defaults, row normalization, grouping keys, and formula-injection-safe text.
- Modify `src/features/production-line/utils/bomExcel.js`: generate the new workbook and parse both new and legacy layouts into the shared contract.
- Modify `src/lib/bomImportHelpers.js`: normalize, validate, merge, diff, and serialize complete BOM item fields using `SKU + goods code`.
- Create `src/lib/bomImportServer.js`: batch-resolve Parent/component metadata and prepare authoritative Preview/Import payloads.
- Modify `src/app/api/production-boms/import-batch/preview/route.js`: call the shared server preparation pipeline without writes.
- Modify `src/app/api/production-boms/import-batch/route.js`: call the same pipeline and atomic RPC for each validated Parent.
- Create `supabase/migrations/20260625_add_atomic_default_bom_import_rpc.sql`: transaction-safe DEFAULT formula BOM version write.
- Modify `src/features/production-line/components/BomEditorPageClient.js`: remove legacy row grouping and send parsed rows to the shared preparation shape.
- Modify `src/features/production-line/components/MultiProductImportPreviewModal.js`: show all current fields and replace Mojibake with UTF-8 Thai.
- Create `tests/bom-import-contract.test.mjs`: pure contract/default/composite-key tests.
- Create `tests/bom-import-helpers.test.mjs`: merge, validation, and diff tests.
- Create `tests/bom-excel-parser.test.mjs`: parser tests using generated in-memory workbooks.
- Create `tests/bom-import-server.test.mjs`: server preparation tests with a fake Supabase/gateway data source.

### Task 1: Shared Import Contract

**Files:**
- Create: `src/features/production-line/utils/bomImportContract.js`
- Create: `tests/bom-import-contract.test.mjs`

- [ ] **Step 1: Write failing normalization and compatibility tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  BOM_IMPORT_DEFAULTS,
  buildBomImportItemKey,
  normalizeBomImportRow,
} from "../src/features/production-line/utils/bomImportContract.js";

test("normalizes a complete current-format row", () => {
  assert.deepEqual(
    normalizeBomImportRow({
      rowNumber: 4,
      parentSkuCode: " wkb-0041 ",
      wipQtyInputMode: "unit",
      baseBatch: "1",
      baseOutputBoxes: "2",
      materialGoodsCode: " m04-00790 ",
      materialSkuCode: "m04-0079",
      qty: "5",
      calculationBasis: "machine_count",
      calculationBase: "2",
      roundMode: "up",
      planningOffsetDays: "-1",
      notes: " ทดสอบ ",
    }),
    {
      rowNumber: 4,
      parentSkuCode: "WKB-0041",
      formulaCode: "DEFAULT",
      formulaName: "สูตรหลัก",
      wipQtyInputMode: "unit",
      baseBatch: 1,
      baseOutputBoxes: 2,
      materialGoodsCode: "M04-00790",
      materialSkuCode: "M04-0079",
      qty: 5,
      uomName: "",
      calculationBasis: "MACHINE_COUNT",
      headcountBase: 1,
      headcountRoundMode: "NONE",
      machineBase: 2,
      machineRoundMode: "UP",
      doughSetBase: 1,
      doughSetRoundMode: "NONE",
      planningOffsetDays: -1,
      notes: "ทดสอบ",
    }
  );
});

test("legacy rows receive safe defaults", () => {
  const row = normalizeBomImportRow({
    productCode: "B03-0003",
    baseBatch: 1,
    baseOutputBoxes: 60,
    code: "WKB-0041",
    qty: 2,
  });

  assert.equal(row.formulaCode, "DEFAULT");
  assert.equal(row.calculationBasis, BOM_IMPORT_DEFAULTS.calculationBasis);
  assert.equal(row.materialGoodsCode, "WKB-0041");
  assert.equal(row.materialSkuCode, "");
});

test("item key preserves multiple trade codes for one SKU", () => {
  assert.notEqual(
    buildBomImportItemKey({ materialSkuCode: "M04-0079", materialGoodsCode: "M04-0079" }),
    buildBomImportItemKey({ materialSkuCode: "M04-0079", materialGoodsCode: "M04-00790" })
  );
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npm run test -- tests/bom-import-contract.test.mjs`  
Expected: FAIL because `bomImportContract.js` does not exist.

- [ ] **Step 3: Implement constants, aliases, sanitizers, and row normalization**

```js
export const BOM_IMPORT_DEFAULTS = Object.freeze({
  formulaCode: "DEFAULT",
  formulaName: "สูตรหลัก",
  calculationBasis: "JOB_QTY",
  roundMode: "NONE",
  planningOffsetDays: 0,
});

export const BOM_IMPORT_CALCULATION_BASES = new Set([
  "JOB_QTY",
  "HEADCOUNT",
  "MACHINE_COUNT",
  "DOUGH_SET_COUNT",
]);

export const BOM_IMPORT_ROUND_MODES = new Set(["NONE", "UP", "DOWN", "NEAREST"]);
export const BOM_IMPORT_WIP_MODES = new Set(["unit", "batch"]);

export function buildBomImportItemKey(item) {
  const sku = String(item?.materialSkuCode || item?.material_sku_code || "").trim().toUpperCase();
  const goods = String(
    item?.materialGoodsCode || item?.material_goods_code || sku
  ).trim().toUpperCase();
  return `${sku}::${goods}`;
}

export function sanitizeExcelText(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function normalizeBomImportRow(raw = {}) {
  const calculationBasis = normalizeCalculationBasis(raw.calculationBasis);
  const calculationBase = normalizePositiveNumber(raw.calculationBase, 1);
  const roundMode = normalizeRoundMode(raw.roundMode);
  const materialSkuCode = normalizeCode(raw.materialSkuCode);
  const materialGoodsCode = normalizeCode(
    raw.materialGoodsCode || raw.code || materialSkuCode
  );
  return {
    rowNumber: Number(raw.rowNumber) || null,
    parentSkuCode: normalizeCode(raw.parentSkuCode || raw.productCode),
    formulaCode: "DEFAULT",
    formulaName: "สูตรหลัก",
    wipQtyInputMode: normalizeWipMode(raw.wipQtyInputMode),
    baseBatch: normalizeNumber(raw.baseBatch),
    baseOutputBoxes: normalizeNumber(raw.baseOutputBoxes),
    materialGoodsCode,
    materialSkuCode,
    qty: normalizeNumber(raw.qty),
    uomName: String(raw.uomName || "").trim(),
    calculationBasis,
    headcountBase: calculationBasis === "HEADCOUNT" ? calculationBase : 1,
    headcountRoundMode: calculationBasis === "HEADCOUNT" ? roundMode : "NONE",
    machineBase: calculationBasis === "MACHINE_COUNT" ? calculationBase : 1,
    machineRoundMode: calculationBasis === "MACHINE_COUNT" ? roundMode : "NONE",
    doughSetBase: calculationBasis === "DOUGH_SET_COUNT" ? calculationBase : 1,
    doughSetRoundMode: calculationBasis === "DOUGH_SET_COUNT" ? roundMode : "NONE",
    planningOffsetDays: normalizePlanningOffset(raw.planningOffsetDays),
    notes: String(raw.notes ?? raw.note ?? "").trim(),
  };
}
```

- [ ] **Step 4: Run the contract test and verify it passes**

Run: `npm run test -- tests/bom-import-contract.test.mjs`  
Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/production-line/utils/bomImportContract.js tests/bom-import-contract.test.mjs
git commit -m "feat: define BOM Excel import contract"
```

If Git metadata remains unavailable, record the intended commit boundary and continue without initializing or replacing `.git`.

### Task 2: New Workbook and Backward-Compatible Parser

**Files:**
- Modify: `src/features/production-line/utils/bomExcel.js`
- Create: `tests/bom-excel-parser.test.mjs`

- [ ] **Step 1: Write failing parser tests for new and legacy headers**

```js
import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import { parseMultiProductWorkbookBuffer } from "../src/features/production-line/utils/bomExcel.js";

test("parses current columns including trade code and calculation settings", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  sheet.addRow([
    "รหัสสินค้าตัวแม่", "โหมดปริมาณ WIP", "base_batch", "base_output_boxes",
    "รหัสวัตถุดิบที่ใช้จริง", "SKU ภายใน", "จำนวน", "ฐานคำนวณ",
    "ค่าฐาน", "วิธีปัดเศษ", "วันเหลื่อมแผน", "หมายเหตุ",
  ]);
  sheet.addRow([
    "WKB-0041", "UNIT", 1, 2, "M04-00790", "M04-0079", 5,
    "MACHINE_COUNT", 2, "UP", -1, "ทดสอบ",
  ]);

  const rows = await parseMultiProductWorkbookBuffer(await workbook.xlsx.writeBuffer());
  assert.equal(rows[0].materialGoodsCode, "M04-00790");
  assert.equal(rows[0].calculationBasis, "MACHINE_COUNT");
  assert.equal(rows[0].machineBase, 2);
});

test("parses legacy A/C/D/E/G/H columns with defaults", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  sheet.addRow([
    "รหัสสินค้า", "ชื่อสินค้า (AUTO)", "base_batch", "base_output_boxes",
    "รหัสวัตถุดิบ", "ชื่อวัตถุดิบ/WIP (AUTO)", "จำนวน", "หมายเหตุ",
  ]);
  sheet.addRow(["B03-0003", "", 1, 60, "WKB-0041", "", 2, "สูตรเดิม"]);

  const rows = await parseMultiProductWorkbookBuffer(await workbook.xlsx.writeBuffer());
  assert.equal(rows[0].formulaCode, "DEFAULT");
  assert.equal(rows[0].calculationBasis, "JOB_QTY");
  assert.equal(rows[0].planningOffsetDays, 0);
  assert.equal(rows[0].materialGoodsCode, "WKB-0041");
});
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run: `npm run test -- tests/bom-excel-parser.test.mjs`  
Expected: FAIL because `parseMultiProductWorkbookBuffer` is missing.

- [ ] **Step 3: Split buffer parsing from browser File parsing**

```js
export async function parseMultiProductWorkbookBuffer(buffer) {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("BOM-Input") || workbook.worksheets[0];
  if (!sheet) throw new Error("ไม่พบชีต BOM-Input");
  // Resolve columns from the alias map and return normalizeBomImportRow(...) values.
}

export async function parseMultiProductWorkbook(file) {
  return {
    rows: await parseMultiProductWorkbookBuffer(await file.arrayBuffer()),
  };
}
```

- [ ] **Step 4: Rebuild `createMultiProductTemplate` with current columns**

Implement the 17-column `BOM-Input` layout from the design spec, catalog sheets, data validations for WIP mode/calculation basis/rounding, formulas for display-only fields, protected automatic columns, frozen header, filters, and Navy/Gold styling. Apply `sanitizeExcelText` to catalog and example text written into cells.

- [ ] **Step 5: Run parser tests**

Run: `npm run test -- tests/bom-excel-parser.test.mjs`  
Expected: PASS for current and legacy layouts.

- [ ] **Step 6: Generate and inspect a template fixture**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/generate-bom-template-fixture.mjs` after adding a small temporary verification script, then remove that script before commit.  
Expected: Workbook contains `BOM-Input`, `วิธีกรอก`, `รายการสินค้า`, and `รายการวัตถุดิบ`; Thai headers are readable.

- [ ] **Step 7: Commit**

```bash
git add src/features/production-line/utils/bomExcel.js tests/bom-excel-parser.test.mjs
git commit -m "feat: rebuild BOM Excel template and parser"
```

### Task 3: Complete Merge, Validation, and Diff Logic

**Files:**
- Modify: `src/lib/bomImportHelpers.js`
- Create: `tests/bom-import-helpers.test.mjs`

- [ ] **Step 1: Write failing composite-key and field-diff tests**

```js
test("merge keeps two trade codes belonging to the same SKU", () => {
  const next = mergeItems({
    mode: "replace",
    strategy: "overwrite",
    previousItems: [],
    incomingItems: [
      { material_sku_code: "M04-0079", material_goods_code: "M04-0079", qty: 5 },
      { material_sku_code: "M04-0079", material_goods_code: "M04-00790", qty: 1 },
    ],
  });
  assert.equal(next.length, 2);
});

test("diff detects calculation basis and planning offset changes", () => {
  const result = buildDiff(
    [{ material_sku_code: "WKB-0041", material_goods_code: "WKB-0041", qty: 2,
       calculation_basis: "JOB_QTY", planning_offset_days: 0 }],
    [{ material_sku_code: "WKB-0041", material_goods_code: "WKB-0041", qty: 2,
       calculation_basis: "HEADCOUNT", headcount_base: 10, planning_offset_days: -1 }],
    new Map([["WKB-0041", "แป้งหมัก"]])
  );
  assert.equal(result.diff.updated.length, 1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -- tests/bom-import-helpers.test.mjs`  
Expected: FAIL because the existing helper keys by SKU only and drops current fields.

- [ ] **Step 3: Implement complete item normalization**

Normalize and retain:

```js
{
  material_sku_code,
  material_goods_code,
  qty,
  uom_name,
  notes,
  planning_offset_days,
  calculation_basis,
  headcount_base,
  headcount_round_mode,
  machine_base,
  machine_round_mode,
  dough_set_base,
  dough_set_round_mode,
}
```

Use `buildBomImportItemKey` in `normalizeItems`, `mergeItems`, and `buildDiff`. Export a `validatePreparedBomImportProduct(product)` function that returns field-specific Thai errors and rejects formula codes other than `DEFAULT`.

- [ ] **Step 4: Run helper tests**

Run: `npm run test -- tests/bom-import-helpers.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bomImportHelpers.js tests/bom-import-helpers.test.mjs
git commit -m "feat: preserve complete BOM item fields during import"
```

### Task 4: Shared Server Preparation Pipeline

**Files:**
- Create: `src/lib/bomImportServer.js`
- Create: `tests/bom-import-server.test.mjs`

- [ ] **Step 1: Write failing authoritative-resolution tests**

```js
test("resolves a goods code to its SKU, name, type, and unit", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "B03-0003",
      base_batch: 1,
      base_output_boxes: 60,
      items: [{ material_goods_code: "M04-00790", qty: 1 }],
    }],
    catalog: fakeCatalog,
    loadCurrentBoms: async () => [],
  });

  assert.equal(result.products[0].items[0].material_sku_code, "M04-0079");
  assert.equal(result.products[0].items[0].uom_name, "กล่องx15");
});

test("rejects ambiguous legacy SKU when multiple goods codes exist", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "B03-0003",
      base_batch: 1,
      base_output_boxes: 60,
      items: [{ rowNumber: 8, material_goods_code: "M04-0079", qty: 1 }],
    }],
    catalog: fakeCatalogWithDuplicateGoodsVariants,
    loadCurrentBoms: async () => [],
  });
  assert.equal(result.hasErrors, true);
  assert.match(result.invalidRows[0].message, /แถว 8/);
  assert.match(result.invalidRows[0].message, /M04-00790/);
});

test("detects a cycle created by file BOMs plus current approved BOMs", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "WIP-A",
      base_batch: 1,
      base_output_boxes: 1,
      items: [{ material_goods_code: "WIP-B", qty: 1 }],
    }],
    catalog: fakeWipCatalog,
    loadCurrentBoms: async () => [{
      parent_sku_code: "WIP-B",
      items: [{ material_sku_code: "WIP-A" }],
    }],
  });
  assert.equal(result.hasErrors, true);
  assert.match(result.products[0].errors[0], /วงจร BOM/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -- tests/bom-import-server.test.mjs`  
Expected: FAIL because `prepareBomImportProducts` does not exist.

- [ ] **Step 3: Implement batched catalog and current-BOM loading**

`prepareBomImportProducts` must:

1. Normalize all Parent and item codes.
2. Load Parents from `products_cache` in chunks.
3. Load trade codes once for all requested goods/SKU codes.
4. Resolve authoritative SKU/name/type/unit.
5. Validate Parent config consistency and BOM matrix.
6. Load latest DEFAULT BOMs for diff and cycle checks.
7. Merge according to mode/strategy.
8. Return `{ products, invalidRows, hasErrors }` in original file order.

- [ ] **Step 4: Run server preparation tests**

Run: `npm run test -- tests/bom-import-server.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bomImportServer.js tests/bom-import-server.test.mjs
git commit -m "feat: add shared BOM import preparation pipeline"
```

### Task 5: Preview API Uses Shared Validation

**Files:**
- Modify: `src/app/api/production-boms/import-batch/preview/route.js`

- [ ] **Step 1: Add a route-level regression test fixture**

Extend `tests/bom-import-server.test.mjs` with a Preview-shaped payload containing two Parents, one FG and one WIP, and assert both are returned with complete item fields and independent diffs.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test -- tests/bom-import-server.test.mjs`  
Expected: FAIL until the route adapter shape is implemented in the shared module.

- [ ] **Step 3: Replace legacy Preview worker logic**

```js
export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-bom-manage"]);
    const body = await readJson(request);
    const result = await prepareBomImportProducts({
      supabaseAdmin: getSupabaseAdmin(),
      products: Array.isArray(body.products) ? body.products : [],
      mode: normalizeMode(body.mode),
      strategy: normalizeStrategy(body.strategy),
    });
    return Response.json(result, { status: result.hasErrors ? 207 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: Run focused tests and lint**

Run: `npm run test -- tests/bom-import-server.test.mjs`  
Expected: PASS.

Run: `npx eslint "src/app/api/production-boms/import-batch/preview/route.js" "src/lib/bomImportServer.js"`  
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/production-boms/import-batch/preview/route.js src/lib/bomImportServer.js tests/bom-import-server.test.mjs
git commit -m "refactor: share BOM import preview validation"
```

### Task 6: Atomic DEFAULT BOM Import

**Files:**
- Create: `supabase/migrations/20260625_add_atomic_default_bom_import_rpc.sql`
- Modify: `src/app/api/production-boms/import-batch/route.js`
- Modify: `src/lib/bomImportServer.js`

- [ ] **Step 1: Add failing payload serialization tests**

Add a test asserting `serializeBomImportRpcPayload(product)` includes all version and item fields, forces `DEFAULT`, and retains two trade codes for one SKU.

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test -- tests/bom-import-server.test.mjs`  
Expected: FAIL because the serializer is missing.

- [ ] **Step 3: Create the atomic Postgres function**

The migration must create:

```sql
create or replace function public.import_default_bom_version(
  p_parent_sku_code text,
  p_base_batch numeric,
  p_base_output_boxes numeric,
  p_wip_qty_input_mode text,
  p_note text,
  p_items jsonb,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bom_id uuid;
  v_version_id uuid;
  v_version_no integer;
  v_status text;
begin
  if trim(coalesce(p_parent_sku_code, '')) = '' then
    raise exception 'parent SKU is required';
  end if;
  if coalesce(p_base_batch, 0) <= 0 or coalesce(p_base_output_boxes, 0) <= 0 then
    raise exception 'BOM base values must be greater than zero';
  end if;
  if p_wip_qty_input_mode not in ('unit', 'batch') then
    raise exception 'invalid WIP quantity mode';
  end if;

  insert into public.production_boms (sku_code, status, created_by, updated_by)
  values (upper(trim(p_parent_sku_code)), 'approved', p_user_id, p_user_id)
  on conflict (sku_code) do update
    set updated_by = excluded.updated_by
  returning id into v_bom_id;

  insert into public.production_bom_formulas (
    bom_id, formula_code, formula_name, is_active, is_default, created_by, updated_by
  )
  values (v_bom_id, 'DEFAULT', 'สูตรหลัก', true, true, p_user_id, p_user_id)
  on conflict (bom_id, formula_code) do update
    set formula_name = excluded.formula_name,
        is_active = true,
        updated_by = excluded.updated_by;

  perform 1
  from public.production_boms
  where id = v_bom_id
  for update;

  select coalesce(max(version_no), 0) + 1
  into v_version_no
  from public.production_bom_versions
  where bom_id = v_bom_id;

  v_status := public.resolve_default_bom_import_status(v_bom_id, p_items);

  insert into public.production_bom_versions (
    bom_id, version_no, status, base_batch, base_output_boxes,
    wip_qty_input_mode, formula_code, formula_name, note, created_by
  )
  values (
    v_bom_id, v_version_no, v_status, p_base_batch, p_base_output_boxes,
    p_wip_qty_input_mode, 'DEFAULT', 'สูตรหลัก', p_note, p_user_id
  )
  returning id into v_version_id;

  insert into public.production_bom_items (
    version_id, material_sku_code, material_goods_code, qty, uom_name, notes,
    planning_offset_days, calculation_basis, headcount_base,
    headcount_round_mode, machine_base, machine_round_mode,
    dough_set_base, dough_set_round_mode
  )
  select
    v_version_id,
    upper(trim(x.material_sku_code)),
    upper(trim(x.material_goods_code)),
    x.qty,
    nullif(trim(x.uom_name), ''),
    nullif(trim(x.notes), ''),
    x.planning_offset_days,
    x.calculation_basis,
    x.headcount_base,
    x.headcount_round_mode,
    x.machine_base,
    x.machine_round_mode,
    x.dough_set_base,
    x.dough_set_round_mode
  from jsonb_to_recordset(p_items) as x(
    material_sku_code text,
    material_goods_code text,
    qty numeric,
    uom_name text,
    notes text,
    planning_offset_days integer,
    calculation_basis text,
    headcount_base numeric,
    headcount_round_mode text,
    machine_base numeric,
    machine_round_mode text,
    dough_set_base numeric,
    dough_set_round_mode text
  );

  update public.production_boms
  set status = v_status, updated_by = p_user_id
  where id = v_bom_id;

  return jsonb_build_object(
    'bom_id', v_bom_id,
    'version_id', v_version_id,
    'version_no', v_version_no,
    'status', v_status,
    'item_count', jsonb_array_length(p_items)
  );
end;
$$;
```

Create `public.resolve_default_bom_import_status(uuid, jsonb)` in the same migration as a `security invoker` helper that compares the latest DEFAULT version's normalized item JSON against `p_items` and returns `approved` for the first/empty/unchanged version, otherwise `pending_review`. Revoke execute from `public` and grant both functions only to the database role used by the server. Do not use `SECURITY DEFINER`.

- [ ] **Step 4: Replace sequential table writes with prepared RPC calls**

The Import route must reject the entire request before any writes when Preview preparation returns any error. Then call `import_default_bom_version` once per Parent and return per-Parent results. Preserve current approval semantics: first version/no previous items/no meaningful change is approved; changed existing content is pending review.

- [ ] **Step 5: Run focused tests and lint**

Run: `npm run test -- tests/bom-import-server.test.mjs tests/bom-import-helpers.test.mjs`  
Expected: PASS.

Run: `npx eslint "src/app/api/production-boms/import-batch/route.js" "src/lib/bomImportServer.js"`  
Expected: no errors.

- [ ] **Step 6: Apply and verify migration in the connected Supabase environment**

Use the Supabase MCP/CLI workflow required by the project:

1. Apply SQL in a reversible development context.
2. Call the RPC with a test Parent.
3. Verify one version and all items exist.
4. Force an invalid item insert and verify neither version nor partial items remain.
5. Run database advisors and inspect function privileges.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260625_add_atomic_default_bom_import_rpc.sql src/app/api/production-boms/import-batch/route.js src/lib/bomImportServer.js tests/bom-import-server.test.mjs
git commit -m "feat: import DEFAULT BOM versions atomically"
```

### Task 7: Client Flow and Complete Preview UI

**Files:**
- Modify: `src/features/production-line/components/BomEditorPageClient.js`
- Modify: `src/features/production-line/components/MultiProductImportPreviewModal.js`

- [ ] **Step 1: Remove client-side business validation duplication**

Change `buildImportPreview` so it only groups normalized parsed rows into transport payloads and sends all rows, including Excel row numbers, to Preview. The server response becomes the sole source for valid products, invalid rows, authoritative names/units/types, and diffs.

- [ ] **Step 2: Send complete fields on confirmation**

```js
const payload = {
  mode: importState.mode,
  strategy: importState.strategy,
  products: importState.preview.products.map((product) => ({
    sku: product.sku,
    formula_code: "DEFAULT",
    wip_qty_input_mode: product.wipQtyInputMode,
    base_batch: product.baseBatch,
    base_output_boxes: product.baseOutputBoxes,
    items: product.items,
  })),
};
```

- [ ] **Step 3: Rebuild Preview rows**

Display Parent type/mode/base, and columns for goods code, SKU, name, qty, unit, calculation basis/base/rounding, planning offset, and notes. Disable confirmation when `preview.hasErrors` is true. Keep the existing Navy/Gold visual language and square 2px corners.

- [ ] **Step 4: Replace all Mojibake in both touched components**

Replace corrupted strings with UTF-8 Thai, including:

- ดาวน์โหลดเทมเพลตไม่สำเร็จ
- อ่านไฟล์ไม่สำเร็จ
- นำเข้าสำเร็จ
- นำเข้าไม่สำเร็จ
- พรีวิวไฟล์นำเข้า
- แถวที่ไม่ถูกต้อง
- ยืนยันนำเข้า

- [ ] **Step 5: Run targeted static checks**

Run:

```powershell
$files = @(
  "src/features/production-line/components/BomEditorPageClient.js",
  "src/features/production-line/components/MultiProductImportPreviewModal.js",
  "src/features/production-line/utils/bomExcel.js",
  "src/lib/bomImportHelpers.js",
  "src/lib/bomImportServer.js"
)
Select-String -Path $files -Pattern "à¸|à¹|Â·|â€¢|â†" -Encoding UTF8
```

Expected: no matches in the modified import/template code paths.

- [ ] **Step 6: Run targeted lint**

Run: `npx eslint "src/features/production-line/components/BomEditorPageClient.js" "src/features/production-line/components/MultiProductImportPreviewModal.js" "src/features/production-line/utils/bomExcel.js"`  
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/production-line/components/BomEditorPageClient.js src/features/production-line/components/MultiProductImportPreviewModal.js src/features/production-line/utils/bomExcel.js
git commit -m "feat: update BOM Excel import preview"
```

### Task 8: Workbook Visual QA and End-to-End Verification

**Files:**
- Modify if needed: files changed in Tasks 1-7
- Test: `tests/bom-import-contract.test.mjs`
- Test: `tests/bom-import-helpers.test.mjs`
- Test: `tests/bom-excel-parser.test.mjs`
- Test: `tests/bom-import-server.test.mjs`

- [ ] **Step 1: Run all focused tests**

Run:

```bash
npm run test -- tests/bom-import-contract.test.mjs tests/bom-import-helpers.test.mjs tests/bom-excel-parser.test.mjs tests/bom-import-server.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Generate the final template through the app path**

Start the dev server and download the template from `/production-line/bom`. Verify the file name, sheets, validations, formulas, locked cells, and readable Thai.

- [ ] **Step 3: Render and visually inspect every workbook sheet**

Use the bundled spreadsheet runtime from `load_workspace_dependencies` and `@oai/artifact-tool` to import and render each visible sheet. Verify no clipped headers, no blank catalog, readable Navy/Gold contrast, and no broken formulas.

- [ ] **Step 4: Run browser UAT**

Test these files through the UI:

1. Two independent FG Parents.
2. FG referencing WIP plus that WIP's BOM in the same file.
3. One SKU with two distinct goods codes.
4. HEADCOUNT, MACHINE_COUNT, and DOUGH_SET_COUNT rows.
5. A legacy template.
6. A cyclic BOM file that must be blocked.

Verify Preview values and resulting DEFAULT BOM versions.

- [ ] **Step 5: Run complete repository checks**

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: all exit with code 0.

- [ ] **Step 6: Final Mojibake scan**

Run the targeted scan from Task 7 and inspect the generated workbook strings. Expected: no corrupted Thai in the changed flow.

- [ ] **Step 7: Commit verification fixes**

```bash
git add src tests supabase/migrations docs/superpowers
git commit -m "test: verify BOM Excel import redesign"
```

Only stage files changed for this feature. If Git metadata is unavailable, report that commits could not be created and provide the exact verification results.
