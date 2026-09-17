# Stock Return Source Tare Design

## Scope

Change only the product stock-return flow. Do not change inbound weighing, waste weighing, stock reports, issuing, or printer transport behavior.

## Approved behavior

- After validating an issued barcode, load `tare_weight_kg` from its original `production_weight_receipts` row.
- Pre-fill that value as the return tare and keep it editable.
- Treat the realtime scale value as gross weight and calculate `net = gross - tare` to three decimals.
- Auto-save only when gross is stable, net is positive, and net does not exceed the remaining returnable weight.
- Persist gross, tare, and net on the generated return receipt. Stock movement quantities continue to use net weight only.
- Record `tareSource` as `source_receipt` when unchanged from the source value and `manual` when edited.
- Return labels display the persisted tare and net weights. Existing automatic printing and reset behavior remain unchanged.

## Validation

- Tare must be zero or greater and must be less than gross weight.
- Net weight must be positive and must not exceed `remainingWeightKg`.
- The server and database RPC independently recompute and validate net weight; the browser value is not trusted.

## Tests

- Source lookup exposes the original receipt tare.
- Return UI pre-fills an editable tare, calculates net from gross, and submits all three weights.
- Server forwards gross and tare to the RPC.
- RPC stores gross/tare/net and movement weight remains net.
- Existing realtime, auto-print, reprint, and reset regression tests remain green.
