import assert from "node:assert/strict";
import test from "node:test";

async function importOptional(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  }
}

test("requisition export remark uses a four-digit Buddhist Era date", async () => {
  const { formatRequisitionRemarkDate } = await importOptional(
    "../src/lib/requisitionExportFormat.js"
  );
  assert.equal(typeof formatRequisitionRemarkDate, "function", "remark date formatter must exist");

  assert.equal(formatRequisitionRemarkDate("2026-09-10"), "10/09/2569");
});

test("requisition export separates the production-plan label and date with a comma", async () => {
  const { buildRequisitionPlanRemark } = await importOptional(
    "../src/lib/requisitionExportFormat.js"
  );
  assert.equal(typeof buildRequisitionPlanRemark, "function", "plan remark builder must exist");

  assert.equal(buildRequisitionPlanRemark("10/09/2569"), "แผนผลิต,10/09/2569");
});
