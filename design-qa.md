# Design QA: ประวัติรับเข้าวัตถุดิบแยก LOT

- Source visual truth: `C:\Users\Riew\AppData\Local\Temp\codex-clipboard-a3a921b9-5429-47a7-b9d9-92417d48e5be.png` (1680 × 945 px desktop mockup).
- Implementation: authenticated populated page at `http://127.0.0.1:3000/raw-material-receipts`.
- State inspected: 43,402 ERP receipt rows, selected first row, and the LOT detail panel open.
- Frontend comparison: title, one-line filters, navy header, compact single-line rows, selected-row highlight, status dots, right detail panel, and fixed pagination are present.
- Data-order comparison: blocked because `api.kpfoods.co.th` still runs the prior date-first query; the latest product/LOT-first gateway query was verified locally only.

## Findings

- [P0] Deploy the latest `kpf-api-gateway/server.js`. The deployed endpoint still sorts by date, so repeated SKU/LOT groups remain separated even though the local gateway returns contiguous groups.
- [P1] Recheck the total INV and unique SKU+LOT+warehouse counts after deployment; the current deployed response predates those summary fields.

## Required fidelity surfaces

The populated frontend was visually inspected. Long product and supplier names now truncate to keep every row compact. The final data-order comparison still requires the updated gateway.

## Comparison history

The compact table and drawer layout were iterated against the supplied mockup. Local ERP tests covered 200 rows across two cursor pages with no duplicate row, no repeated LOT group, and chronological dates inside each LOT.

## Implementation checklist

1. Update the deployed ERP gateway with the latest read-only route.
2. Reload `/raw-material-receipts` and confirm SKU → LOT → receipt date order plus INV/LOT summary counts.
3. Capture the populated 1680 × 945 viewport for the final same-state comparison.

final result: blocked
