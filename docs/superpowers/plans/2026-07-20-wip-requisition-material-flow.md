# WIP Requisition Material Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow only active WIP policies with `requires_requisition = true` to behave like raw-material lines in room routing, requisition preview, confirmed Excel export, and FIFO auto-LOT allocation, without exposing those WIP lines in departmental production-floor workflows.

**Architecture:** Keep the existing backward-compatible `production_wip_policies.requires_requisition` flag and centralize snapshot filtering in `src/lib/requisitionMaterialPolicy.js`. Preview and confirm-daily will both call the same helper, preserving their existing routing, grouping, draft, Excel, and LOT pipelines. No production-floor or material-claim module will import the new helper.

**Tech Stack:** Next.js 16 App Router route handlers, React client settings UI, Supabase/Postgres, Node test runner, ExcelJS export pipeline.

## Global Constraints

- WIP defaults to not requisitioned (`requires_requisition = false`).
- Only active policies with `requires_requisition = true` enter the main requisition pipeline.
- Included WIP uses the same work-center routing, owner department, quantities, Excel row shape, and FIFO auto-LOT allocator as RAW.
- Do not alter `supply_mode`, `allow_master_plan`, WIP planning, material claims, or departmental production-floor behavior.
- Preserve existing RAW and PACK results exactly.

---

### Task 1: Requisition WIP policy contract

**Files:**
- Create: `src/lib/requisitionMaterialPolicy.js`
- Create: `tests/wip-requisition-policy.test.mjs`

**Interfaces:**
- Produces: `collectSnapshotWipSkuCodes(planRows)`, `loadRequiredRequisitionWipSkuSet(supabaseAdmin, skuCodes)`, and `mapRequisitionSnapshotMaterials(planRow, requiredWipSkuSet)`.
- Guarantees: RAW/PACK remain included; WIP is included only when its normalized SKU exists in the required set.

- [ ] **Step 1: Write failing pure behavior tests** covering RAW retention, unflagged WIP exclusion, flagged WIP inclusion, inactive policy exclusion, and missing-column safe fallback.
- [ ] **Step 2: Run `node --test tests/wip-requisition-policy.test.mjs` and confirm failure because the helper module does not exist.**
- [ ] **Step 3: Implement the three helper exports with uppercase SKU normalization, positive-quantity filtering, server-side policy lookup, and safe false behavior when the migration column is absent.**
- [ ] **Step 4: Run `node --test tests/wip-requisition-policy.test.mjs` and confirm all helper tests pass.**

### Task 2: Preview and confirmation parity

**Files:**
- Modify: `src/app/api/production-planning/requisition/preview/route.js`
- Modify: `src/app/api/production-planning/requisition/confirm-daily/route.js`
- Test: `tests/wip-requisition-policy.test.mjs`

**Interfaces:**
- Consumes: helper exports from Task 1.
- Produces: identical material inclusion in Preview and Confirm/Export.

- [ ] **Step 1: Add source-contract tests requiring both routes to collect WIP codes, load the same policy set, and map snapshot materials with that set.**
- [ ] **Step 2: Run the test and confirm both route assertions fail against the current unconditional `itemType !== "WIP"` filter.**
- [ ] **Step 3: Replace duplicated snapshot mapping functions with helper imports and load the required WIP set once per request after plan rows are loaded.**
- [ ] **Step 4: Keep WIP `itemType` intact so existing routing treats it as a routed component while existing material grouping continues to place non-PACK items with RAW.**
- [ ] **Step 5: Run the focused test and confirm Preview/Confirm parity passes.**

### Task 3: WIP Policy settings completion

**Files:**
- Modify: `src/features/production-line-settings/components/WipPoliciesSettingsTab.js`
- Test: `tests/wip-requisition-policy.test.mjs`

**Interfaces:**
- Consumes and emits: `requiresRequisition: boolean` through the existing `/api/production-wip-policies` service.
- Produces: an editable “เบิกจากคลัง” checkbox persisted with each changed WIP policy.

- [ ] **Step 1: Add source-contract tests for change detection, save payload, table header, checkbox binding, and eight-column empty/loading spans.**
- [ ] **Step 2: Run the test and confirm failure because the current UI only normalizes the flag but does not compare, send, or render it.**
- [ ] **Step 3: Add `requiresRequisition` to `isDraftChanged` and `handleSave`, render the checkbox with explanatory title text, and update table spans.**
- [ ] **Step 4: Run focused tests and confirm the settings contract passes.**

### Task 4: Routing, Excel, LOT, and floor-work isolation

**Files:**
- Test: `tests/wip-requisition-policy.test.mjs`
- Verify: `src/features/production-line-settings/components/RoutingSettingsTab.js`
- Verify: `src/app/api/production-planning/requisition/confirm-daily/route.js`
- Verify: `src/lib/requisitionLotExport.js`

**Interfaces:**
- Routing: existing `production_routing_components` WIP mapping supplies `work_center_id` and issue owner.
- Excel/LOT: existing confirm pipeline sends every confirmed line through `allocateLotNumbersForExportRows` using ERP trade-code metadata and FIFO lots.

- [ ] **Step 1: Add source-contract tests proving WIP components remain selectable for room routing, confirmed WIP lines share the Excel-row builder, and allocation runs after all rows are assembled.**
- [ ] **Step 2: Add an isolation assertion that the new requisition helper is imported only by Preview and Confirm routes, never production-floor or material-claim modules.**
- [ ] **Step 3: Run focused tests and correct only confirmed gaps; do not refactor existing routing or LOT allocation if the contract already passes.**

### Task 5: Schema and full verification

**Files:**
- Verify: `supabase/migrations/20260719_add_requires_requisition_to_wip_policies.sql`

**Interfaces:**
- Schema: non-null boolean default false; existing rows remain excluded until explicitly enabled.

- [ ] **Step 1: Check linked migration status and apply the existing migration if it is pending and the linked environment permits it.**
- [ ] **Step 2: Run `node --test tests/wip-requisition-policy.test.mjs`.**
- [ ] **Step 3: Run the relevant existing tests plus `npm run lint`.**
- [ ] **Step 4: Run `npm run build` and require exit code 0.**
- [ ] **Step 5: Report any database action separately from code completion and identify whether a SQL run is still required.**
