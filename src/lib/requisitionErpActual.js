import { formatRequisitionRemarkDate } from "./requisitionExportFormat.js";

const normalize = (value) => String(value || "").trim().toUpperCase();

function normalizeRoom(value) {
  return normalize(value)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^(ห้อง|ส่วนงาน)\s*/, "")
    .replace(/\s+/g, "");
}

function normalizeDepartment(value) {
  return normalize(value).replace(/^แผนก\s*/, "").replace(/\s+/g, "");
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function departmentMatches(row, slot) {
  const actual = [row?.DEPT_CODE, row?.DEPT_THAIDESC].map(normalizeDepartment).filter(Boolean);
  return actual.includes(normalizeDepartment(slot?.departmentCode))
    || actual.includes(normalizeDepartment(slot?.departmentName));
}

export function groupErpRequisitionRows(rows) {
  const documents = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const documentNo = normalize(row?.DI_REF);
    if (!documentNo) return;
    if (!documents.has(documentNo)) documents.set(documentNo, []);
    documents.get(documentNo).push(row);
  });
  return documents;
}

export function matchErpActualDocuments(slots, erpRows) {
  const documents = groupErpRequisitionRows(erpRows);
  const used = new Set();

  return (Array.isArray(slots) ? slots : []).map((slot) => {
    const plannedDocumentNos = Array.isArray(slot?.plannedDocumentNos)
      ? slot.plannedDocumentNos.map(normalize).filter(Boolean)
      : [];
    if (plannedDocumentNos.length > 1) {
      const matched = plannedDocumentNos.map((documentNo) => [documentNo, documents.get(documentNo)]);
      if (matched.every(([documentNo, rows]) => rows?.length && !used.has(documentNo))) {
        matched.forEach(([documentNo]) => used.add(documentNo));
        return {
          ...slot,
          status: "exact",
          actualDocumentNo: plannedDocumentNos.join(" / "),
          rows: matched.flatMap(([, rows]) => rows),
        };
      }
    }

    const plannedDocumentNo = normalize(slot?.plannedDocumentNo);
    const exactRows = documents.get(plannedDocumentNo);
    if (exactRows?.length && !used.has(plannedDocumentNo)) {
      used.add(plannedDocumentNo);
      return {
        ...slot,
        status: "exact",
        actualDocumentNo: exactRows[0]?.DI_REF ? String(exactRows[0].DI_REF).trim() : plannedDocumentNo,
        rows: exactRows,
      };
    }

    const room = normalizeRoom(slot?.roomLabel);
    const remarkDate = formatRequisitionRemarkDate(slot?.workDate);
    const expectedParents = new Set(
      (slot?.expectedParentSkus || []).map(normalize).filter(Boolean)
    );
    const candidates = [...documents.entries()].filter(([documentNo, rows]) => {
      if (used.has(documentNo) || !rows.length) return false;
      const first = rows[0];
      const remark = normalize(first?.DI_REMARK);
      return departmentMatches(first, slot)
        && remark.includes(normalize(remarkDate))
        && (!room || remark.replace(/\s+/g, "").includes(room));
    });

    const combinations = candidates.flatMap((candidate, index) => [
      [candidate],
      ...candidates.slice(index + 1).map((other) => [candidate, other]),
    ]).filter((combination) => {
      const actualParents = new Set(
        combination.flatMap(([, rows]) => rows.map((row) => normalize(row?.PARENT_SKU_CODE))).filter(Boolean)
      );
      return expectedParents.size > 0 && sameSet(actualParents, expectedParents);
    });

    if (combinations.length === 1) {
      const matched = combinations[0];
      matched.forEach(([documentNo]) => used.add(documentNo));
      return {
        ...slot,
        status: "routing",
        actualDocumentNo: matched.map(([documentNo]) => documentNo).join(" / "),
        rows: matched.flatMap(([, rows]) => rows),
      };
    }

    return {
      ...slot,
      status: "review",
      reason: combinations.length > 1
        ? "พบใบเบิก ERP มากกว่า 1 ใบที่ตรงกับวัน ห้อง และชุดวัตถุดิบ"
        : "ไม่พบใบเบิก ERP ที่ยืนยันได้จากเลขเอกสารหรือ Routing",
      candidates: combinations.length > 1
        ? Array.from(new Set(combinations.flatMap((items) => items.map(([documentNo]) => documentNo))))
        : candidates.map(([documentNo]) => documentNo),
      rows: [],
    };
  });
}
