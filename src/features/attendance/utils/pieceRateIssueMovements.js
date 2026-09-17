function normalizeDocumentNo(value) {
  return String(value || "").trim().toUpperCase();
}

export function excludeReversedIssueMovements(rows = []) {
  const reversedDocumentNos = new Set(
    rows
      .filter((row) => row?.source_document_type === "piece_rate_issue_void")
      .map((row) => normalizeDocumentNo(row.source_document_no || row.reference_no))
      .filter(Boolean)
  );

  return rows.filter((row) => {
    if (row?.source_document_type !== "piece_rate_issue") return true;
    return !reversedDocumentNos.has(normalizeDocumentNo(row.source_document_no));
  });
}
