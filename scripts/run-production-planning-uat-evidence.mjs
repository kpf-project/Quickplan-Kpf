import fs from "fs/promises";
import path from "path";

function normalizeDate(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function getDateOffset(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function nowTag() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

function boolLabel(value) {
  return value ? "PASS" : "FAIL";
}

function jsonToString(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

async function requestJson({
  baseUrl,
  pathName,
  method = "GET",
  token = "",
  body = null,
  headers = {},
}) {
  const url = `${baseUrl}${pathName}`;
  const finalHeaders = {
    "content-type": "application/json",
    ...headers,
  };
  if (token) {
    finalHeaders.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
    error: response.ok ? "" : String(payload?.error || payload?.message || "Request failed"),
    url,
    method,
  };
}

function classifyMovementType(row) {
  const moveQty = Number(row?.MOVE_QTY) || 0;
  const docType = Number(row?.DT_PROPERTIES) || 0;
  const docRef = String(row?.DI_REF || "").trim().toUpperCase();
  const remark = String(row?.DI_REMARK || "").trim().toLowerCase();

  if (moveQty < 0) return "ISSUE";
  if (docType === 203) return "PO_RECEIPT";
  if (docType === 310) return "RETURN_RECEIPT";
  if (docRef.startsWith("MO") || remark.includes("ผลิต")) return "MO_RECEIPT";
  return "RECEIPT";
}

function toMovementSummary(rows) {
  const summary = {
    movementCount: 0,
    issueQty: 0,
    poReceiptQty: 0,
    moReceiptQty: 0,
    returnReceiptQty: 0,
    otherReceiptQty: 0,
  };
  const dedupe = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const movementDate = normalizeDate(row?.MOVEMENT_DATE || row?.movementDate);
    const skuCode = String(row?.SKU_CODE || row?.skuCode || "").trim().toUpperCase();
    const docRef = String(row?.DI_REF || row?.docRef || "").trim();
    const docType = Number(row?.DT_PROPERTIES ?? row?.docType ?? 0);
    const moveQty = Number(row?.MOVE_QTY ?? row?.moveQty ?? 0) || 0;
    const qty = Math.abs(moveQty) || Number(row?.quantity || 0) || 0;
    const movementType = row?.movementType || classifyMovementType(row);
    if (!movementDate || !skuCode || qty <= 0) return;

    const key = [skuCode, movementDate, docRef, docType, movementType, qty, moveQty < 0 ? "OUT" : "IN"].join("|");
    if (dedupe.has(key)) return;
    dedupe.add(key);

    summary.movementCount += 1;
    if (movementType === "ISSUE") summary.issueQty += qty;
    else if (movementType === "PO_RECEIPT") summary.poReceiptQty += qty;
    else if (movementType === "MO_RECEIPT") summary.moReceiptQty += qty;
    else if (movementType === "RETURN_RECEIPT") summary.returnReceiptQty += qty;
    else summary.otherReceiptQty += qty;
  });
  Object.keys(summary).forEach((key) => {
    summary[key] = Number(summary[key].toFixed(3));
  });
  return summary;
}

function compareMovementSummary(a, b) {
  const fields = [
    "movementCount",
    "issueQty",
    "poReceiptQty",
    "moReceiptQty",
    "returnReceiptQty",
    "otherReceiptQty",
  ];
  const diffs = [];
  fields.forEach((field) => {
    const left = Number(a?.[field] || 0);
    const right = Number(b?.[field] || 0);
    if (Math.abs(left - right) > 0.0001) {
      diffs.push({ field, trace: left, gateway: right });
    }
  });
  return diffs;
}

async function writeDoc(relativePath, content) {
  const absolute = path.join(process.cwd(), relativePath);
  await fs.writeFile(absolute, content, "utf8");
}

async function run() {
  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const gatewayUrl = process.env.KPF_GATEWAY_URL || "";
  const gatewayApiKey = process.env.KPF_API_KEY || "";
  const managerToken = process.env.MANAGER_TOKEN || "";
  const editorToken = process.env.EDITOR_TOKEN || "";
  const viewerToken = process.env.VIEWER_TOKEN || "";
  const planNo = String(process.env.PLAN_NO || "").trim().toUpperCase();
  const fromDate = normalizeDate(process.env.FROM_DATE) || getDateOffset(-7);
  const toDate = normalizeDate(process.env.TO_DATE) || getDateOffset(0);
  const tag = nowTag();

  const missing = [];
  if (!managerToken) missing.push("MANAGER_TOKEN");

  const flowChecks = [];
  const roleChecks = [];
  let traceRows = [];
  let movementAcceptance = {
    status: "BLOCKED",
    reason: "",
    comparedMasters: 0,
    mismatches: [],
  };

  if (missing.length === 0) {
    const publishPath = "/api/production-planning/master-publish";
    flowChecks.push({
      step: "Publish",
      ...(await requestJson({
        baseUrl: appBaseUrl,
        pathName: publishPath,
        method: "POST",
        token: managerToken,
        body: { planGroupId: planNo },
      })),
    });

    const inboxQuery = planNo ? `?planNo=${encodeURIComponent(planNo)}&scope=all` : "?scope=all";
    flowChecks.push({
      step: "Workbench (Inbox)",
      ...(await requestJson({
        baseUrl: appBaseUrl,
        pathName: `/api/production-planning/inbox${inboxQuery}`,
        token: managerToken,
      })),
    });

    flowChecks.push({
      step: "Control Tower",
      ...(await requestJson({
        baseUrl: appBaseUrl,
        pathName: `/api/production-planning/control-tower?startDate=${fromDate}&endDate=${toDate}&planKind=all`,
        token: managerToken,
      })),
    });

    flowChecks.push({
      step: "Replan Jobs",
      ...(await requestJson({
        baseUrl: appBaseUrl,
        pathName: "/api/production-planning/replan/jobs?limit=10",
        token: managerToken,
      })),
    });

    const traceResult = await requestJson({
      baseUrl: appBaseUrl,
      pathName: `/api/production-planning/trace?fromDate=${fromDate}&toDate=${toDate}${planNo ? `&planNo=${encodeURIComponent(planNo)}` : ""}&limit=120`,
      token: managerToken,
    });
    flowChecks.push({ step: "Trace", ...traceResult });
    traceRows = Array.isArray(traceResult?.payload?.data) ? traceResult.payload.data : [];

    const roleTargets = [
      { role: "manager", token: managerToken },
      { role: "editor", token: editorToken },
      { role: "viewer", token: viewerToken },
    ].filter((item) => item.token);

    for (const target of roleTargets) {
      const calculateResult = await requestJson({
        baseUrl: appBaseUrl,
        pathName: "/api/production-planning/calculate",
        method: "POST",
        token: target.token,
        body: { plans: [] },
      });
      roleChecks.push({
        role: target.role,
        action: "POST /api/production-planning/calculate",
        status: calculateResult.status,
        pass: target.role === "viewer"
          ? calculateResult.status === 403
          : calculateResult.status !== 403,
        error: calculateResult.error,
      });
    }

    if (!gatewayUrl || !gatewayApiKey) {
      movementAcceptance = {
        status: "BLOCKED",
        reason: "KPF_GATEWAY_URL หรือ KPF_API_KEY ไม่พร้อม",
        comparedMasters: 0,
        mismatches: [],
      };
    } else if (!traceRows.length) {
      movementAcceptance = {
        status: "BLOCKED",
        reason: "ไม่พบข้อมูล trace สำหรับเทียบ movement",
        comparedMasters: 0,
        mismatches: [],
      };
    } else {
      const mismatches = [];
      let comparedMasters = 0;
      for (const master of traceRows.slice(0, 20)) {
        const materials = Array.isArray(master?.materials) ? master.materials : [];
        const skus = Array.from(new Set(materials.map((row) => String(row?.materialSkuCode || "").trim().toUpperCase()).filter(Boolean)));
        const start = normalizeDate(master?.periodStart) || fromDate;
        const end = normalizeDate(master?.periodEnd) || toDate;
        if (!skus.length) continue;
        comparedMasters += 1;
        const params = new URLSearchParams({
          skus: skus.join(","),
          dateFrom: start,
          dateTo: end,
          limit: "2000",
        });
        const gatewayResponse = await requestJson({
          baseUrl: gatewayUrl,
          pathName: `/api/material-movement-log?${params.toString()}`,
          headers: { "x-api-key": gatewayApiKey },
        });
        if (!gatewayResponse.ok) {
          mismatches.push({
            masterPlanNo: master.masterPlanNo,
            reason: `gateway-error:${gatewayResponse.status}`,
            detail: gatewayResponse.error,
          });
          continue;
        }
        const gatewayRows = Array.isArray(gatewayResponse?.payload?.data) ? gatewayResponse.payload.data : [];
        const traceSummary = toMovementSummary(master?.materialMovements || []);
        const gatewaySummary = toMovementSummary(gatewayRows);
        const diffs = compareMovementSummary(traceSummary, gatewaySummary);
        if (diffs.length > 0) {
          mismatches.push({
            masterPlanNo: master.masterPlanNo,
            periodStart: start,
            periodEnd: end,
            diffs,
          });
        }
      }
      movementAcceptance = {
        status: mismatches.length === 0 ? "PASS" : "FAIL",
        reason: "",
        comparedMasters,
        mismatches,
      };
    }
  }

  const flowPass = flowChecks.length > 0 && flowChecks.every((item) => item.ok);
  const rolePass = roleChecks.length > 0 && roleChecks.every((item) => item.pass);

  const flowReportPath = `docs/UAT_EXECUTION_RESULTS_PRODUCTION_PLANNING_FLOW_${tag}.md`;
  const roleReportPath = `docs/ROLE_E2E_RESULTS_PRODUCTION_PLANNING_${tag}.md`;
  const movementReportPath = `docs/MOVEMENT_MAPPING_ACCEPTANCE_${tag}.md`;

  const flowMd = [
    "# UAT Execution Results (Production Planning Flow)",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `App base URL: ${appBaseUrl}`,
    `Plan No: ${planNo || "-"}`,
    `Date range: ${fromDate} -> ${toDate}`,
    "",
    "## Flow Result",
    `- Overall: ${flowPass ? "PASS" : "FAIL"}`,
    `- Missing env: ${missing.length ? missing.join(", ") : "-"}`,
    "",
    "## Step Checks",
    "| Step | Method | URL | Status | Result | Error |",
    "|---|---|---|---|---|---|",
    ...(flowChecks.length
      ? flowChecks.map((row) => `| ${row.step} | ${row.method} | ${row.url} | ${row.status} | ${row.ok ? "PASS" : "FAIL"} | ${row.error || "-"} |`)
      : ["| - | - | - | - | BLOCKED | Missing env |"]),
    "",
    "## Manual Evidence (Attach manually)",
    "- Screenshot Publish",
    "- Screenshot Workbench",
    "- Screenshot Control Tower",
    "- Screenshot Replan",
    "- Screenshot Trace",
    "- Sign-off manager / planner / production",
    "",
  ].join("\n");

  const roleMd = [
    "# Role E2E Results (Manager / Editor / Viewer)",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `App base URL: ${appBaseUrl}`,
    "",
    "## Summary",
    `- Overall: ${rolePass ? "PASS" : "FAIL"}`,
    `- Checks: ${roleChecks.length || 0}`,
    "",
    "## Role Checks",
    "| Role | Action | HTTP Status | Result | Error |",
    "|---|---|---|---|---|",
    ...(roleChecks.length
      ? roleChecks.map((row) => `| ${row.role} | ${row.action} | ${row.status} | ${boolLabel(row.pass)} | ${row.error || "-"} |`)
      : ["| - | - | - | BLOCKED | Missing EDITOR_TOKEN/VIEWER_TOKEN |"]),
    "",
    "## Notes",
    "- PASS criteria: manager/editor must not receive 403, viewer must receive 403 on write action",
    "",
  ].join("\n");

  const movementMd = [
    "# Movement Mapping Acceptance",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `App base URL: ${appBaseUrl}`,
    `Gateway URL: ${gatewayUrl || "-"}`,
    "",
    "## Summary",
    `- Status: ${movementAcceptance.status}`,
    `- Compared masters: ${movementAcceptance.comparedMasters || 0}`,
    `- Mismatch count: ${movementAcceptance.mismatches?.length || 0}`,
    movementAcceptance.reason ? `- Reason: ${movementAcceptance.reason}` : "- Reason: -",
    "",
    "## Details",
    ...(movementAcceptance.mismatches?.length
      ? movementAcceptance.mismatches.map((item) => `- ${item.masterPlanNo || "-"}: ${jsonToString(item)}`)
      : ["- No mismatch"]),
    "",
    "## Criteria",
    "- Trace movement summary must match transaction movement log with no difference",
    "",
  ].join("\n");

  await writeDoc(flowReportPath, flowMd);
  await writeDoc(roleReportPath, roleMd);
  await writeDoc(movementReportPath, movementMd);

  const resultJson = {
    ok: missing.length === 0 && flowPass && rolePass && movementAcceptance.status === "PASS",
    missing,
    reports: {
      flow: flowReportPath,
      role: roleReportPath,
      movement: movementReportPath,
    },
    summary: {
      flowPass,
      rolePass,
      movementStatus: movementAcceptance.status,
    },
  };
  process.stdout.write(`${JSON.stringify(resultJson, null, 2)}\n`);
  if (!resultJson.ok) process.exitCode = 1;
}

run().catch((error) => {
  process.stderr.write(`${String(error?.stack || error?.message || error)}\n`);
  process.exitCode = 1;
});
