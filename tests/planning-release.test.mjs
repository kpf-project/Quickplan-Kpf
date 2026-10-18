import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planningSourceRevision, isRequisitionDraftStale } from "../src/lib/planningRelease.js";

test("only publication or confirmation revision changes invalidate requisition drafts", () => {
  const revision = planningSourceRevision([{ id: "A", published_revision: 2, status: "draft" }], [{ department_id: "D", confirmed_revision: 3 }]);
  assert.equal(revision, "M:A:2|S:D:3");
  const draft = { source_revision: revision, draft_payload: { DOC: [] } };
  assert.equal(isRequisitionDraftStale(draft, revision), false);
  assert.equal(isRequisitionDraftStale(draft, "M:A:3|S:D:3"), true);
  assert.equal(isRequisitionDraftStale({ draft_payload: { DOC: [] } }, revision), true);
  assert.equal(isRequisitionDraftStale({ draft_payload: {} }, revision), false);
});

test("preview and export read the same released plans; draft revisions are checked server-side", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const route of ["preview", "confirm-daily"]) {
    const source = read(`src/app/api/production-planning/requisition/${route}/route.js`);
    assert.match(source, /loadMainPlanRowsForClaimDemand\(supabaseAdmin,\s*\{\s*releasedOnly: true/);
    assert.match(source, /loadSubplanRowsForClaimDemand\(supabaseAdmin, \{[^\n]+releasedOnly: true/);
  }
  const draft = read("src/app/api/production-planning/requisition/draft/route.js");
  assert.match(draft, /body\?\.sourceRevision !== sourceRevision/);
  assert.match(draft, /previousDrafts: staleDraft/);
  const confirm = read("src/app/api/production-planning/requisition/confirm-daily/route.js");
  assert.match(confirm, /isRequisitionDraftStale\(draftRow, sourceRevision\)/);
  assert.ok(confirm.indexOf("isRequisitionDraftStale(draftRow") < confirm.indexOf("await reserveDocumentNumbers"));
});
