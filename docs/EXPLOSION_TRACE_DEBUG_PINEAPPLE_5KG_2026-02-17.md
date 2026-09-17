# Explosion Trace/Debug Example (Real Data)

Date: 2026-02-17

## 1) Endpoint for QA

`GET /api/production-planning/trace/debug`

Supported inputs:
- `planId` or `planIds` (comma-separated)
- `masterPlanNo` (or `planNo`)
- `skuCode` + `plannedQty` (ad-hoc debug)
- Optional: `formulaCode`, `bomVersionId`, `maxDepth` (default 12), `planLimit` (default 20)

Response includes:
- `traceRows`: parent -> child rows per depth with equation terms
- `depthBuckets`: grouped rows per layer for easy QA
- `materials`: aggregated required qty by material
- `summary`: max depth, cycle flags, raw/wip counts

---

## 2) Real Case Requested: แยมสับปะรด 5 KG

Target SKU from real system:
- `B03-0003` = `แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)`

Request:

```http
GET /api/production-planning/trace/debug?skuCode=B03-0003&plannedQty=5&formulaCode=DEFAULT&maxDepth=12
```

Current real-data outcome:
- Product exists in `products_cache`
- But there is no `approved` BOM version for `B03-0003` yet
- Result is empty trace with warning `NO_BOM_COMPONENTS_FOUND_FOR_INPUT`

QA should read this as:
- Engine works, but source BOM data is not ready for this SKU in current environment.

---

## 3) Deepest Real Example Available Now (for QA run-through)

Because pineapple 5 KG has no approved BOM yet, use current richest approved SKU:
- `WKB-0042` = `แป้งเมนโด`

Request:

```http
GET /api/production-planning/trace/debug?skuCode=WKB-0042&plannedQty=5&formulaCode=DEFAULT&maxDepth=12
```

Observed real trace rows:

1. `WKB-0042 -> M04-0027`  
   equation: `5 * (1 / 16) = 0.3125`
2. `WKB-0042 -> M04-0094`  
   equation: `5 * (2 / 16) = 0.625`
3. `WKB-0042 -> M04-0134`  
   equation: `5 * (1 / 16) = 0.3125`
4. `WKB-0042 -> M05-0101`  
   equation: `5 * (1 / 16) = 0.3125`

All rows are `RAW`, no cycle, current `maxDepth = 1` in this environment.

---

## 4) Why no multi-layer yet

On this database snapshot, `approved` BOM roots currently exist for only 3 WIP SKUs:
- `WKA-0001`
- `WKB-0041`
- `WKB-0042`

All 3 currently explode to RAW directly (no WIP->WIP chain yet), so recursive depth is still 1.

