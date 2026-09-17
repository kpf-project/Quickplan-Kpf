import { NextResponse } from "next/server";
import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import {
  buildRequisitionDraftScopeKey,
  loadRequisitionAccessScope,
  loadScopedRequisitionDraftRow,
} from "@/lib/requisitionPreviewAccess";

export const dynamic = "force-dynamic";

const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const MAX_DRAFT_DOCUMENTS = 300;
const MAX_LINES_PER_DOCUMENT = 700;
const MAX_DRAFT_TEXT_LENGTH = 500;

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(3));
}

function normalizeDraftText(value, fieldName) {
  const text = String(value || "").trim();
  if (text.length > MAX_DRAFT_TEXT_LENGTH) {
    throw new ApiError(413, `${fieldName} is too long`);
  }
  return text;
}

function normalizeLine(line) {
  const materialSkuCode = normalizeDraftText(line?.materialSkuCode, "materialSkuCode");
  const materialGoodsCode = normalizeDraftText(line?.materialGoodsCode || materialSkuCode || "", "materialGoodsCode");
  const materialName = normalizeDraftText(line?.materialName, "materialName");
  const unit = normalizeDraftText(line?.unit, "unit");
  const itemType = normalizeDraftText(line?.itemType, "itemType").toUpperCase();
  const qtyByDate = Object.fromEntries(
    Object.entries(line?.qtyByDate || {})
      .map(([dateValue, qty]) => [normalizeDateOnly(dateValue), roundQty(qty)])
      .filter(([dateValue, qty]) => dateValue && qty > 0)
  );
  const totalQty = roundQty(Object.values(qtyByDate).reduce((sum, qty) => sum + toNumber(qty), 0));

  if (!materialGoodsCode || !materialName || !unit) {
    return null;
  }

  return {
    materialSkuCode,
    materialGoodsCode,
    materialName,
    unit,
    itemType,
    qtyByDate,
    totalQty,
    isManual: line?.isManual === true,
  };
}

function normalizeDraftPayload(drafts) {
  const entries = Object.entries(drafts || {})
    .map(([docKey, lines]) => {
      const normalizedDocKey = normalizeDraftText(docKey, "documentKey");
      if (!normalizedDocKey) return null;
      if (!Array.isArray(lines)) {
        throw new ApiError(400, "draft document lines must be an array");
      }
      if (lines.length > MAX_LINES_PER_DOCUMENT) {
        throw new ApiError(413, "too many draft lines in one document");
      }
      const normalizedLines = (Array.isArray(lines) ? lines : [])
        .map(normalizeLine)
        .filter(Boolean)
        .sort((a, b) => {
          const codeA = String(a.materialGoodsCode || a.materialSkuCode || "");
          const codeB = String(b.materialGoodsCode || b.materialSkuCode || "");
          if (codeA !== codeB) return codeA.localeCompare(codeB);
          return String(a.unit || "").localeCompare(String(b.unit || ""));
        });
      return [normalizedDocKey, normalizedLines];
    })
    .filter(Boolean);

  return Object.fromEntries(entries);
}

function assertDraftObject(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "drafts must be an object keyed by documentKey");
  }
  if (Object.keys(value).length > MAX_DRAFT_DOCUMENTS) {
    throw new ApiError(413, "too many draft documents");
  }
  return value;
}

function buildDraftResponse({ scopeKey, masterPlanNo, dateFrom, dateTo, drafts, updatedAt, updatedBy }) {
  return {
    data: {
      scopeKey,
      masterPlanNo,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      drafts: normalizeDraftPayload(drafts),
      updatedAt: updatedAt || null,
      updatedBy: updatedBy || null,
    },
  };
}

function parseScopeFromSearchParams(searchParams) {
  const inputMasterPlanNo = String(
    searchParams.get("masterPlanNo") || searchParams.get("planNo") || ""
  )
    .trim()
    .toUpperCase();
  const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
  const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
  const dateTo = normalizeDateOnly(searchParams.get("dateTo"));
  if (!inputMasterPlanNo) {
    throw new ApiError(400, "masterPlanNo is required");
  }
  if (!masterPlanNo) {
    throw new ApiError(400, "Invalid masterPlanNo format");
  }
  return {
    masterPlanNo,
    dateFrom,
    dateTo,
  };
}

function parseScopeFromBody(body) {
  const inputMasterPlanNo = String(body?.masterPlanNo || body?.planNo || "")
    .trim()
    .toUpperCase();
  const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
  const dateFrom = normalizeDateOnly(body?.dateFrom);
  const dateTo = normalizeDateOnly(body?.dateTo);
  if (!inputMasterPlanNo) {
    throw new ApiError(400, "masterPlanNo is required");
  }
  if (!masterPlanNo) {
    throw new ApiError(400, "Invalid masterPlanNo format");
  }
  return {
    masterPlanNo,
    dateFrom,
    dateTo,
  };
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const { masterPlanNo, dateFrom, dateTo } = parseScopeFromSearchParams(searchParams);
    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });
    const scopeKey = buildRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo, scope);
    const row = await loadScopedRequisitionDraftRow(supabaseAdmin, {
      masterPlanNo,
      dateFrom,
      dateTo,
      scope,
      allowLegacyFallback: scope.canManageGlobal,
    });

    return NextResponse.json(
      buildDraftResponse({
        scopeKey: row?.scope_key || scopeKey,
        masterPlanNo,
        dateFrom,
        dateTo,
        drafts: row?.draft_payload || {},
        updatedAt: row?.updated_at || null,
        updatedBy: row?.updated_by || null,
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_DRAFT_BYTES) {
      throw new ApiError(413, "draft payload is too large");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const body = await readJson(request);
    const { masterPlanNo, dateFrom, dateTo } = parseScopeFromBody(body);
    const scope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "edit",
    });
    const scopeKey = buildRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo, scope);
    const drafts = normalizeDraftPayload(assertDraftObject(body?.drafts));

    const upsertPayload = {
      scope_key: scopeKey,
      master_plan_no: masterPlanNo,
      date_from: dateFrom,
      date_to: dateTo,
      draft_payload: drafts,
      updated_by: permission.userId,
      updated_at: new Date().toISOString(),
    };

    const existingRow = await loadScopedRequisitionDraftRow(supabaseAdmin, {
      masterPlanNo,
      dateFrom,
      dateTo,
      scope,
    });
    const baseUpdatedAt = String(body?.baseUpdatedAt || "").trim() || null;
    if (existingRow?.updated_at && baseUpdatedAt !== existingRow.updated_at) {
      throw new ApiError(409, "แบบร่างถูกแก้ไขจากที่อื่น กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง", {
        currentUpdatedAt: existingRow.updated_at,
      });
    }
    if (!existingRow?.scope_key) {
      upsertPayload.created_by = permission.userId;
    }

    const result = await supabaseAdmin
      .from("production_requisition_preview_drafts")
      .upsert(upsertPayload, { onConflict: "scope_key" })
      .select("scope_key, master_plan_no, date_from, date_to, draft_payload, updated_at, updated_by")
      .single();

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json(
      buildDraftResponse({
        scopeKey: result.data.scope_key,
        masterPlanNo: result.data.master_plan_no,
        dateFrom: result.data.date_from,
        dateTo: result.data.date_to,
        drafts: result.data.draft_payload || {},
        updatedAt: result.data.updated_at || null,
        updatedBy: result.data.updated_by || null,
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}
