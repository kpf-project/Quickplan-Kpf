# Pallet Barcode Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the pallet barcode settings tab to match the approved compact navy-and-gold mockup while preserving every current user interaction and data flow.

**Architecture:** Keep all hooks, handlers, API calls, state keys, validation, and table data structures in `PalletBarcodeSettingsTab.js`. Replace only the presentational JSX class names and structural wrappers for the four existing UI sections: toolbar, quantity barcode setup/list, ICDEPT mapping, and the trade-code mapping grid.

**Tech Stack:** Next.js App Router, React client component, Tailwind CSS, Lucide React.

## Global Constraints

- Keep the outer Settings page header and navigation unchanged.
- Do not change API routes, service calls, mutation action names, state, or event handlers.
- Preserve all ten columns in the trade-code mapping table and all inline actions.
- Use navy `#071A36` / `#102C57`, gold `#C99B2E`, hairline borders, and compact 2px corners.
- Keep all Thai text UTF-8; do not introduce mojibake.

---

### Task 1: Convert the upper controls to the compact three-part workband

**Files:**
- Modify: `src/features/production-line-settings/components/PalletBarcodeSettingsTab.js:863-1034`

**Interfaces:**
- Consumes: Existing `newQtyInput`, `newQtyLabel`, `qtyBarcodes`, `resolvedMappingIccatCode`, `resolvedCategoryQtyBarcodeId`, and existing handler functions.
- Produces: The same controls in a compact grid: create quantity barcode, quantity barcode list, and ICDEPT mapping.

- [ ] **Step 1: Keep the existing print/export/import/reload controls unchanged and change their container to a compact navy toolbar.**
- [ ] **Step 2: Place the create form and barcode list in the same responsive workband, retaining the quantity list columns `จำนวน`, `Barcode Value`, `ชื่อป้าย`, and `พิมพ์`.**
- [ ] **Step 3: Move the ICDEPT controls into the third workband cell and retain the selected mapping status line.**
- [ ] **Step 4: Verify the add, print, save ICDEPT, import, export, reload, and print-mode controls still bind to their original callbacks.**

### Task 2: Compact the trade-code mapping workspace and dense table

**Files:**
- Modify: `src/features/production-line-settings/components/PalletBarcodeSettingsTab.js:1036-1305`

**Interfaces:**
- Consumes: Existing search/filter state, pagination handlers, WIP 03 generator handler, row drafts, and product row shape.
- Produces: A compact toolbar and a dense data table with the original ten columns and row actions.

- [ ] **Step 1: Merge the title, filters, WIP 03 action, and pagination into compact horizontal toolbar rows without deleting controls.**
- [ ] **Step 2: Apply fixed compact table sizing, 10–11px text, 38–40px row targets, smaller image controls, and single-line value layouts.**
- [ ] **Step 3: Retain these exact columns and actions: Trade Code, SKU, product name, product image, ICDEPT, Brand, unit, product barcode/save, SKU override/save/clear, effective result/source.**
- [ ] **Step 4: Preserve horizontal fallback scrolling only below desktop width; the normal desktop layout must use the full available width.**

### Task 3: Validate presentation changes

**Files:**
- Test: `src/features/production-line-settings/components/PalletBarcodeSettingsTab.js`

- [ ] **Step 1: Run ESLint for the edited component.**

Run: `npx eslint "src/features/production-line-settings/components/PalletBarcodeSettingsTab.js"`

Expected: exit code 0.

- [ ] **Step 2: Run the production build.**

Run: `npm run build`

Expected: compilation succeeds with no error reported for the pallet barcode settings route.

- [ ] **Step 3: Inspect the rendered desktop page with authenticated data when available and verify every retained control remains visible and usable.**
