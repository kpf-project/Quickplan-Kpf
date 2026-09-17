import assert from "node:assert/strict";
import test from "node:test";

import { excludeReversedIssueMovements } from "../src/features/attendance/utils/pieceRateIssueMovements.js";

test("confirmed issue report excludes an issue that has a matching issue-void movement", () => {
  const rows = [
    { id: "issue-1", source_document_type: "piece_rate_issue", source_document_no: "PRISS-001" },
    { id: "void-1", source_document_type: "piece_rate_issue_void", source_document_no: "PRISS-001" },
    { id: "issue-2", source_document_type: "piece_rate_issue", source_document_no: "PRISS-002" },
  ];

  assert.deepEqual(
    excludeReversedIssueMovements(rows).map((row) => row.id),
    ["void-1", "issue-2"]
  );
});

test("issue cancellation matching is case-insensitive and can use reference number", () => {
  const rows = [
    { id: "issue", source_document_type: "piece_rate_issue", source_document_no: "PRISS-ABC" },
    { id: "void", source_document_type: "piece_rate_issue_void", source_document_no: "", reference_no: "priss-abc" },
  ];

  assert.deepEqual(excludeReversedIssueMovements(rows).map((row) => row.id), ["void"]);
});
