# Weight Scale Return Realtime and Auto-Print Design

## Goal

Make `/production-line/weight-scale/return` use the same realtime scale-reading, stable-weight, automatic label-printing, reprint, and reset-cycle behavior as the product inbound weighing page without modifying any inbound weighing file or behavior.

## Scope boundary

- Modify only the return page component and return-specific tests/helpers when needed.
- Do not modify `WeightScalePageClient.js`, inbound scale receipt APIs, inbound receipt creation, or inbound page behavior.
- Reuse existing shared, unchanged scale-stream and printer services.

## Runtime flow

1. The operator scans a confirmed issued-stock barcode.
2. The return API validates the issue and returns its remaining returnable weight.
3. A valid scan starts the existing `/api/scale/stream` Modbus TCP SSE stream automatically.
4. Gross scale readings are treated as net return weight with tare fixed at zero.
5. A candidate must remain within `0.01 kg` of its baseline for `2500 ms`.
6. The candidate must be greater than zero and no greater than `remainingWeightKg`.
7. The existing return API creates the return receipt, return barcode, and stock movement atomically.
8. The client prints the returned `result.barcode` on the existing 80 x 50 mm CODE128 label via Local Print Agent or WebUSB.
9. After persistence, the station enters `awaiting-reset` even if printing fails. It does not accept the next scan until scale weight is `<= 0.1 kg`.
10. A failed print can be retried using the same persisted return barcode without creating another return record.

## State machine

- `armed`: ready to evaluate a scanned item and live weight.
- `stabilizing`: baseline and timestamp are held while readings remain within tolerance.
- `saving`: one return API request is in flight.
- `awaiting-reset`: the return is persisted; wait for weight to fall to `<= 0.1 kg` before clearing the item and focusing the scanner.

## Printing

- Default mode is Local Print Agent and the mode uses `kpf-weight-scale-print-mode-v1`.
- Agent printing uses the existing bitmap renderer and `http://127.0.0.1:41951` agent.
- WebUSB uses the existing TSPL bulk-out implementation and requires prior pairing.
- Label fields are return barcode, product code/name, lot, tare `0.00`, returned net weight, and return timestamp.
- Persistence success and print success are separate. Print failure never rolls back or repeats the return.

## Error handling

- Device errors display the SSE `message` and close the stream consistently.
- Transport errors close the stream unless the client intentionally closed it.
- Overweight readings remain visible but cannot save.
- API failures re-arm the same item for a corrected/new stable reading.
- Print failures show a warning and enable reprint of the persisted result.

## Verification

- Regression test confirms constants, state phases, auto-connect, Local Agent/WebUSB paths, return-barcode printing, reprint, and reset guard.
- Run the focused test, focused ESLint, full test suite, and production build.
- Inspect changed paths to prove no inbound weighing file changed.
