import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPackingTestBackend } from "./helpers/packing-test-backend.mjs";

test("real packing and old WIP services share receipts under service_role without company writes", { timeout: 120000 }, async () => {
  const backend = await createPackingTestBackend();
  try {
    const read = async (view, code = "QA-PAIL") => (await (await backend.dispatch(`http://test/api/attendance/non-wage-packing-output?version=2&view=${view}&departmentId=${backend.departmentId}&skuCode=${code}&dateFrom=${backend.date}`)).json());
    const profile = (await read("profile")).data;
    const sources = (await read("sources")).data;
    assert.equal(sources.reduce((sum, row) => sum + Number(row.remaining), 0), 94);
    const source = sources.find(row => row.source_kind === "legacy_opening");
    const body = { version: 2, requestId: randomUUID(), departmentId: backend.departmentId, workDate: backend.date, productCode: "QA-PAIL", unitVersion: profile.unitVersion, produced: { carton: 5 }, closing: { pail: 2 }, sources: [{ id: source.id, quantity: 3 }] };
    const saved = await backend.dispatch("http://test/api/attendance/non-wage-packing-output", "POST", body);
    assert.equal(saved.status, 201);
    const old = await (await backend.dispatch("http://test/api/production-line/fg-wip/issues")).json();
    assert.equal(old.data.reduce((sum, row) => sum + row.remainingQty, 0), 93);
    assert.equal((await read("sources")).data.reduce((sum, row) => sum + Number(row.remaining), 0), 93);
    assert.equal((await backend.dispatch("http://test/api/attendance/non-wage-packing-output", "POST", body)).status, 200);
    assert.equal(backend.sql("select count(*) from production_packing_documents"), "1");
    const history = await (await backend.dispatch(`http://test/api/production-line/fg-wip?productionDate=${backend.date}`)).json();
    assert.equal(history.packingDocuments.length, 1);
    assert.equal((await read("records")).data.length, 2);
    const closingSource = old.data.find(row => row.sourceMovementId === source.id);
    assert.ok(closingSource, "same-product same-LOT closing stock remains selectable by the old page");
    assert.equal(closingSource.remainingQty, 51, "52 opening - 3 consumed + 2 closing share one LOT balance");
    await backend.dispatch("http://test/api/production-line/fg-wip/issues", "POST", {
      requestId: randomUUID(), sourceMovementId: closingSource.sourceMovementId,
      barcode: closingSource.barcode, lotNo: closingSource.lotNo, quantity: 1, issueDate: backend.date,
    });
    assert.equal((await read("sources")).data.reduce((sum, row) => sum + Number(row.remaining), 0), 92);
    const beforeRejected = backend.sql("select count(*) from production_packing_documents");
    await assert.rejects(backend.dispatch("http://test/api/attendance/non-wage-packing-output", "POST", {
      ...body, requestId: randomUUID(), sources: [{ id: source.id, quantity: 999 }],
    }), error => error.status === 400);
    assert.equal(backend.sql("select count(*) from production_packing_documents"), beforeRejected);
    assert.equal((await read("sources")).data.reduce((sum, row) => sum + Number(row.remaining), 0), 92);
    const packet = (await read("profile", "QA-PACK")).data;
    await backend.dispatch("http://test/api/attendance/non-wage-packing-output", "POST", { ...body, requestId: randomUUID(), productCode: "QA-PACK", unitVersion: packet.unitVersion, produced: { pack: 2 }, closing: { pack: 1, sachet: 3 }, sources: [] });
    const packetSources = (await read("sources", "QA-PACK")).data;
    assert.deepEqual(packetSources.map(row => [row.unit_code, Number(row.remaining)]).sort(), [["pack", 1], ["sachet", 3]]);
    assert.equal(backend.sql("select sum(quantity_in-quantity_out) from production_wip_opening_balance_movements where product_code='QA-PACK'"), "");
  } finally { backend.close(); }
});
