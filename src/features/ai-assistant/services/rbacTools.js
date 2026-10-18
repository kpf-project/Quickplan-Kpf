import fs from "node:fs";
import path from "node:path";
import { SYSTEM_TERMINOLOGY, SYSTEM_WORKFLOWS, SECURITY_POLICIES } from "./systemKnowledge.js";
import { SYSTEM_TOPOLOGY, getAuthorizedRoutes, findRouteByIntent } from "./systemTopology.js";

async function resolveSupabaseAdmin(customAdmin) {
  if (customAdmin) return customAdmin;
  try {
    const { getSupabaseAdmin } = await import("../../../lib/adminApi.js");
    return getSupabaseAdmin();
  } catch {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      } catch {
        return null;
      }
    }
    return null;
  }
}

const PLANNING_PERMISSION_KEYS = [
  "production-line-planning-view",
  "production-line-planning-manage",
  "plan.view_all",
  "plan.calculate_own_dept",
  "plan.edit_own_dept",
];

export function normalizePlanningDate(value) {
  const raw = String(value || "").trim();
  let year;
  let month;
  let day;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else {
    const thaiMatch = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2}|\d{4})$/.exec(raw);
    if (!thaiMatch) return null;
    [, day, month, year] = thaiMatch;
    if (year.length === 2) year = String(2500 + Number(year));
    if (Number(year) >= 2400) year = String(Number(year) - 543);
  }

  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized;
}

function hasGlobalPlanningAccess(userContext) {
  const permissions = new Set(userContext?.permissions || []);
  return Boolean(
    userContext?.isAdmin
    || permissions.has("production-line-planning-manage")
    || permissions.has("plan.view_all")
  );
}

async function loadAssistantPlanningScope({ request, userContext, supabaseAdmin }) {
  if (!request || !userContext?.userId) {
    return { error: "ACCESS_DENIED" };
  }

  try {
    const { requirePermissionKeys } = await import("../../../lib/permissionGuard.js");
    const permission = await requirePermissionKeys(request, PLANNING_PERMISSION_KEYS);
    if (String(permission.userId) !== String(userContext.userId)) {
      return { error: "ACCESS_DENIED" };
    }
    const { loadRequisitionAccessScope, canAccessRequisitionDepartment } = await import(
      "../../../lib/requisitionPreviewAccess.js"
    );
    const accessScope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });
    return { permission, accessScope, canAccessRequisitionDepartment };
  } catch (error) {
    if (error?.status === 403) return { error: "ACCESS_DENIED" };
    console.warn("AI planning access check failed:", error?.message || error);
    return { error: "QUERY_FAILED" };
  }
}

function planningAccessError(error) {
  return error === "ACCESS_DENIED"
    ? {
        success: false,
        error,
        message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลแผนกนี้ หรือไม่สามารถยืนยันขอบเขตสิทธิ์ได้",
      }
    : {
        success: false,
        error: "QUERY_FAILED",
        message: "ไม่สามารถตรวจสอบสิทธิ์และข้อมูลแผนกได้ในขณะนี้",
      };
}

async function fetchRequisitionActualRows({ goodsCode, departmentCode, workDate }) {
  const [{ fetchGatewayJson }, { formatRequisitionRemarkDate }] = await Promise.all([
    import("../../../lib/gatewayClient.js"),
    import("../../../lib/requisitionExportFormat.js"),
  ]);
  const rows = [];
  let cursor = "";

  const candidateCodes = [goodsCode];
  if (goodsCode === "WK-2202" && !candidateCodes.includes("WK-22020")) candidateCodes.push("WK-22020");
  else if (goodsCode === "WK-22020" && !candidateCodes.includes("WK-2202")) candidateCodes.push("WK-2202");
  const queryGoodsCodes = candidateCodes.join(",");

  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      pageSize: "500",
      includeTotal: "false",
      goodsCodes: queryGoodsCodes,
      departmentCodes: departmentCode,
      remarkDates: formatRequisitionRemarkDate(workDate),
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchGatewayJson(
      "/api/raw-material-requisitions",
      params,
      "production"
    );
    if (!result.ok) {
      return {
        rows: [],
        error: result.error?.message || "อ่านข้อมูลใบเบิกจริงจาก ERP ไม่สำเร็จ",
        truncated: false,
      };
    }

    rows.push(...(Array.isArray(result.data?.data) ? result.data.data : []));
    if (!result.data?.cursor?.hasMore || !result.data?.cursor?.next) {
      return { rows, error: null, truncated: false };
    }
    cursor = result.data.cursor.next;
  }

  return { rows, error: null, truncated: true };
}

/**
 * Check if the user is a production supervisor, department head, manager, or has stock/attendance management rights
 */
export function isProductionSupervisorOrManager(userContext) {
  if (!userContext) return false;
  if (userContext.isAdmin) return true;

  const roleSet = new Set((userContext.roles || []).map((r) => String(r).toLowerCase()));
  const permissionSet = new Set(userContext.permissions || []);

  // Standard roles for leaders / department heads / warehouse / costing / QA / planning
  if (
    roleSet.has("role-1771497622584") || // หัวหน้าแผนกบิสกิต
    roleSet.has("role-1770107032796") || // รองผู้จัดการ
    roleSet.has("role-1779435727767") || // คลังวัตถุดิบ
    roleSet.has("role-1782447318026") || // บัญชีต้นทุน
    roleSet.has("role-1786435380724") || // หัวหน้าบัญชีต้นทุน
    roleSet.has("qa") ||
    roleSet.has("qa-biscuit") ||
    roleSet.has("uat-pln-mgr") ||
    roleSet.has("acc")
  ) {
    return true;
  }

  // Name check for Thai or English role names
  for (const role of roleSet) {
    if (
      role.includes("หัวหน้า") ||
      role.includes("ผู้จัดการ") ||
      role.includes("leader") ||
      role.includes("supervisor") ||
      role.includes("manager") ||
      role.includes("biscuit")
    ) {
      return true;
    }
  }

  // Permissions for production management, attendance reporting, or inventory
  if (
    permissionSet.has("production-line-attendance-report-manage") ||
    permissionSet.has("production-line-attendance-manage") ||
    permissionSet.has("production-line-planning-view") ||
    permissionSet.has("stock-inventory") ||
    permissionSet.has("raw-materials-summary") ||
    permissionSet.has("raw-materials-lot")
  ) {
    return true;
  }

  return false;
}

/**
 * Fetch raw materials from ERP Gateway by SKU code or Thai name (e.g. 'น้ำตาลทราย', 'M01-0004')
 */
async function queryGatewayRawMaterials(searchQuery) {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl || !searchQuery) return [];

  try {
    const url = new URL("/api/raw-materials-summary", gatewayUrl);
    url.searchParams.set("page", "1");
    url.searchParams.set("pageSize", "10");
    url.searchParams.set("skuName", searchQuery);
    url.searchParams.set("unitSchema", "4");

    const res = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey || "",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const list = json?.data || json?.items || [];
    return list.map((item) => ({
      product_code: item.SKU_CODE,
      product_name: item.SKU_NAME,
      category_name: item.ICCAT_NAME,
      department_code: item.ICDEPT_CODE,
      unit: item.UTQ_NAME || item.BASE_UNIT_NAME,
      stock_unit_name: item.STOCK_UNIT_NAME,
      stock_unit_factor: item.STOCK_UNIT_FACTOR,
      current_quantity: item.QTY,
      current_weight_kg: item.QTY_BASE,
      source: "erp_gateway",
    }));
  } catch (err) {
    console.warn("Failed to query raw materials from Gateway:", err.message);
    return [];
  }
}

/**
 * Parse simple YAML frontmatter (metadata) from markdown files
 */
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { meta: {}, body: content };
  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return { meta: {}, body: content };

  const frontmatterStr = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 4).trim();
  const meta = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      try {
        val = JSON.parse(val.replace(/'/g, '"'));
      } catch {
        val = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      }
    } else if (val === "true" || val === "false") {
      val = val === "true";
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    meta[key] = val;
  }

  return { meta, body };
}

/**
 * Verify whether the user's role/permissions grant access to this documentation file
 */
function isDocAllowedForUser(meta, userContext) {
  if (!userContext) return true;
  if (userContext.isAdmin) return true;

  // If explicitly designated as public
  if (meta.public_access === true) return true;

  const userRoles = new Set((userContext.roles || []).map((r) => String(r).toLowerCase()));
  const userPerms = new Set(userContext.permissions || []);

  if (Array.isArray(meta.allowed_roles) && meta.allowed_roles.length > 0) {
    const hasRole = meta.allowed_roles.some((r) => userRoles.has(String(r).toLowerCase()));
    if (hasRole) return true;
  }

  if (Array.isArray(meta.required_permissions) && meta.required_permissions.length > 0) {
    const hasPerm = meta.required_permissions.some((p) => userPerms.has(p));
    if (hasPerm) return true;
  }

  // If public_access is explicitly false and user matched neither role nor permission
  if (meta.public_access === false) return false;

  // Default fallback: allow if no restriction explicitly declared
  return true;
}

// Domain synonyms dictionary for factory operations
const THAI_FACTORY_SYNONYMS = {
  "ตาชั่ง": ["เครื่องชั่ง", "ชั่ง", "rs232", "com port", "weight-scale", "ohaus", "stable", "tare", "ค่านิ่ง"],
  "เครื่องชั่ง": ["ตาชั่ง", "ชั่ง", "rs232", "com port", "weight-scale", "ohaus", "stable", "tare", "ค่านิ่ง"],
  "ค่านิ่ง": ["stable", "tare", "เครื่องชั่ง", "ตาชั่ง", "rs232", "น้ำหนัก"],
  "ป้ายแยม": ["wkb-0064", "แยม", "เนื้อขนม", "ถาด", "เรือนจำ", "ชั่งเข้า", "ชั่งคืน", "piece-rate-scan"],
  "เนื้อขนม": ["ป้ายแยม", "wkb-0064", "ถาด", "wip", "ประกอบร่าง", "เนื้อขนมออพาย"],
  "แยม": ["ป้ายแยม", "m04-0088", "m04-0126-1", "m04-0127-1", "b03-0003", "สับปะรด", "สตรอ"],
  "ค่าแรง": ["piece-rate", "ชิ้นงาน", "รายชิ้น", "เงินเดือน", "สแกนผลงาน", "kpf"],
  "สแกนนิ้ว": ["attendance", "เช็คชื่อ", "เข้างาน", "เข้าออกงาน", "ลงเวลา", "กะ", "เวลา", "hr", "สแกนเวลา"],
  "เช็คชื่อ": ["attendance", "สแกนนิ้ว", "เข้างาน", "เข้าออกงาน", "ลงเวลา", "กะ", "เวลา", "hr"],
  "เข้างาน": ["attendance", "สแกนนิ้ว", "เช็คชื่อ", "เข้าออกงาน", "ลงเวลา", "กะ", "เวลา", "hr"],
  "ลงเวลา": ["attendance", "สแกนนิ้ว", "เช็คชื่อ", "เข้าออกงาน", "เวลา", "hr"],
  "เวลาเข้างาน": ["attendance", "สแกนนิ้ว", "เช็คชื่อ", "กะ", "hr", "ลงเวลา"],
  "เปลือก": ["แผ่นขนม", "input-output", "wkb-0002", "wkb-0048", "เตาอบ", "ผลผลิต"],
  "ผลผลิต": ["input-output", "fg", "wip", "บรรจุ", "packing", "ของเสีย"],
  "สูตร": ["bom", "สูตรการผลิต", "ส่วนผสม", "ขออนุมัติ", "bill of materials", "เวอร์ชันสูตร"],
  "bom": ["สูตร", "สูตรการผลิต", "ส่วนผสม", "ขออนุมัติ", "bill of materials"],
  "วางแผน": ["planning", "master plan", "sub-plan", "ใบเบิก", "preview", "erp"],
  "แผนผลิต": ["planning", "master plan", "sub-plan", "ใบเบิก", "control center"],
  "คลัง": ["warehouse", "lot", "สต็อก", "min/max", "วัตถุดิบ", "คงเหลือ"],
  "วัตถุดิบ": ["raw materials", "lot", "คลัง", "สต็อก", "min/max"],
  "ตั้งค่า": ["settings", "admin", "สิทธิ์", "rbac", "hardware", "พอร์ต"],
};

/**
 * Tokenize and expand query with factory synonyms
 */
function extractSearchTokens(keyword) {
  const raw = String(keyword || "").trim().toLowerCase();
  const tokens = new Set();
  if (!raw) return tokens;

  tokens.add(raw);
  const parts = raw.split(/[\s,/:()_+.-]+/).filter((p) => p.length >= 2);
  for (const part of parts) {
    tokens.add(part);
  }

  // Check substrings & synonyms for Thai compound words
  for (const [key, synList] of Object.entries(THAI_FACTORY_SYNONYMS)) {
    if (raw.includes(key)) {
      tokens.add(key);
      for (const s of synList) tokens.add(s);
    }
  }

  return tokens;
}

/**
 * Search user guides, SOPs, and system specification files inside knowledge-base/ and docs/
 * Enforces strict Role-Based Access Control (RBAC) via frontmatter metadata
 * Uses Hybrid Semantic & Keyword Relevance scoring
 */
export function searchDocumentationFiles(keyword, maxResults = 3, userContext = null) {
  const kLower = String(keyword || "").trim().toLowerCase();
  if (!kLower) return [];

  const kbDir = path.resolve(process.cwd(), "knowledge-base");
  const docsDir = path.resolve(process.cwd(), "docs");

  function collectMd(dir, list = []) {
    if (!fs.existsSync(dir)) return list;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          collectMd(full, list);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          list.push(full);
        }
      }
    } catch {}
    return list;
  }

  // Prioritize knowledge-base/ files first, then docs/
  const kbFiles = collectMd(kbDir);
  const docsFiles = collectMd(docsDir);
  const allFiles = [...kbFiles, ...docsFiles];

  const hits = [];
  const queryTokens = extractSearchTokens(kLower);

  for (const file of allFiles) {
    try {
      const rawContent = fs.readFileSync(file, "utf8");
      const { meta, body } = parseFrontmatter(rawContent);

      // Check RBAC permission for this document
      if (!isDocAllowedForUser(meta, userContext)) {
        continue; // Strictly skip unauthorized document
      }

      const cLower = rawContent.toLowerCase();
      const fileNameLower = path.basename(file).toLowerCase();
      const docTitle = meta.title || body.split("\n")[0]?.replace(/^#+\s*/, "") || path.basename(file, ".md");
      const titleLower = String(docTitle).toLowerCase();
      const categoryLower = String(meta.category || "").toLowerCase();

      // Exact substring match
      const exactIdx = cLower.indexOf(kLower);
      const fileNameMatch = fileNameLower.includes(kLower);
      const titleMatch = titleLower.includes(kLower);

      let score = 0;
      if (exactIdx !== -1) score += 50;
      if (fileNameMatch) score += 100;
      if (titleMatch) score += 80;

      // Token & Synonym hits
      let tokenMatches = 0;
      for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (titleLower.includes(token)) score += 30;
        if (fileNameLower.includes(token)) score += 30;
        if (categoryLower.includes(token)) score += 15;
        if (cLower.includes(token)) {
          score += 10;
          tokenMatches += 1;
        }
      }

      // Add frequency weight
      if (exactIdx !== -1) {
        const occurrences = (cLower.match(new RegExp(kLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
        score += occurrences * 5;
      }

      // Recency & Temporal Governance: Check file last modified time to prioritize active manuals
      try {
        const stats = fs.statSync(file);
        const daysOld = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (daysOld < 30) score += 15; // Updated within the last month
      } catch {}

      // Hard Refusal Gate / Minimum Confidence Threshold (Score >= 25)
      // Filters out weak, coincidental token noise to prevent hallucination
      if (score >= 25 || exactIdx !== -1 || fileNameMatch) {
        const start = exactIdx !== -1 ? Math.max(0, rawContent.lastIndexOf("\n#", exactIdx)) : 0;
        const snippet = exactIdx !== -1
          ? rawContent.slice(start > 0 ? start : Math.max(0, exactIdx - 100), Math.min(rawContent.length, exactIdx + 800)).trim()
          : body.slice(0, 500).trim();

        const relPath = path.relative(process.cwd(), file).replace(/\\/g, "/");

        hits.push({
          file: relPath,
          title: docTitle,
          category: meta.category || "Documentation",
          route: meta.route || meta.routes?.issue || null,
          excerpt: snippet,
          relevanceScore: score,
        });
      }
    } catch {}
  }

  return hits
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, maxResults)
    .map(({ relevanceScore, ...hit }) => hit);
}

/**
 * Tool specifications for Gemini Tool Calling
 */
export const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: "search_system_knowledge",
        description: "ค้นหาข้อมูลคู่มือการใช้งาน, ความหมายของรหัสคำย่อ (เช่น WKB-, B03-, LOT, MP), โครงสร้างแผนก หรือขั้นตอนการทำงานในโรงงาน",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: {
              type: "STRING",
              description: "หัวข้อหรือรหัสคำที่ต้องการค้นหา เช่น 'WKB', 'LOT', 'ขั้นตอนการคืนวัตถุดิบ', 'BOM approval'",
            },
          },
          required: ["topic"],
        },
      },
      {
        name: "read_factory_documentation",
        description: "ค้นหาและอ่านคู่มือการใช้งานระบบโรงงาน, ขั้นตอน SOP ทุกหน้า (ชั่งน้ำหนัก, บันทึกเนื้อขนมป้ายแยม, สแกนคิดค่าแรง, เช็คชื่อเข้าออก, บันทึกผลผลิต WIP, สูตรการผลิต BOM, วางแผนการผลิต, คลังวัตถุดิบ, ตั้งค่าระบบ) จากคลังคู่มือมาตรฐาน knowledge-base/ โดยระบบจะกรองเนื้อหาตามสิทธิ์ RBAC ของผู้ใช้โดยอัตโนมัติ",
        parameters: {
          type: "OBJECT",
          properties: {
            keyword: {
              type: "STRING",
              description: "หัวข้อหรือคำค้นหา เช่น 'ป้ายแยม', 'ชั่งน้ำหนัก', 'ค่าแรงชิ้นงาน', 'เช็คชื่อ', 'BOM', 'วางแผนผลิต', 'ตั้งค่าระบบ'",
            },
          },
          required: ["keyword"],
        },
      },
      {
        name: "lookup_product_info",
        description: "ค้นหาข้อมูลสินค้า, วัตถุดิบ (Raw Materials), แผ่น/เนื้อขนม WIP, บิสกิตสำเร็จรูป จากรหัสสินค้า (เช่น WKB-0053, M01-0004, B03-0003) หรือค้นหาด้วยชื่อภาษาไทย (เช่น 'น้ำตาลทราย', 'แป้งสาลี', 'แผนคุกกี้นม', 'เนย', 'กลิ่น') เพื่อดูรหัสทางการ หมวดหมู่ ยอดคงเหลือ และหน่วยนับ (ผู้ใช้งานทุกคนเรียกดูได้)",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "รหัสสินค้าหรือชื่อสินค้า/วัตถุดิบ เช่น 'น้ำตาลทราย', 'WKB-0053', 'แป้งสาลี', 'M01-0004'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "check_stock_balance",
        description: "ตรวจสอบยอดคงเหลือสต็อกสินค้าหรือวัตถุดิบ ทั้งคลังวัตถุดิบ ERP และคลังการผลิต ค้นหาได้ทั้งรหัสสินค้า (เช่น 'M01-0004', 'WKB-0053') หรือชื่อภาษาไทย (เช่น 'น้ำตาลทราย', 'แป้งสาลี', 'เนย') (ต้องมีสิทธิ์คลังสินค้า/สต็อก หรือฝ่ายวางแผน/Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            code: {
              type: "STRING",
              description: "รหัสสินค้า หรือชื่อวัตถุดิบภาษาไทย เช่น 'น้ำตาลทราย', 'M01-0004', 'WKB-0053', 'แป้งสาลี'",
            },
            lot: {
              type: "STRING",
              description: "เลขอ้างอิงล็อตสินค้า (ถ้ามี)",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "get_production_plan_status",
        description: "ตรวจสอบสถานะแผนผลิตแบบภาพรวมทุกแผนก (สงวนสิทธิ์เฉพาะ Admin, ผู้มี production-line-planning-manage หรือ plan.view_all); หากถามเฉพาะแผนกให้ใช้ query_department_production_planning",
        parameters: {
          type: "OBJECT",
          properties: {
            date: {
              type: "STRING",
              description: "วันที่ต้องการตรวจสอบ ในรูปแบบ YYYY-MM-DD เช่น '2026-09-29'",
            },
            departmentCode: {
              type: "STRING",
              description: "รหัสหรือชื่อแผนก เช่น 'mixing', 'baking', 'packing', 'บิสกิต'",
            },
          },
        },
      },
      {
        name: "query_department_production_planning",
        description: "ค้นหาข้อมูลจากเมนูวางแผนการผลิตเฉพาะแผนกที่ผู้ใช้มีสิทธิ์: สถานะแผนหลัก, งานแผนก หรือยอดเบิกจริงใน ERP ซึ่งแสดงใน Preview ใบเบิก ห้ามสรุปข้อมูลข้ามแผนก เว้นแต่ผู้ใช้มีสิทธิ์ดูแผนทุกแผนก",
        parameters: {
          type: "OBJECT",
          properties: {
            view: {
              type: "STRING",
              description: "แหล่งข้อมูลที่ต้องการ: 'master_plan' (สถานะแผนหลัก), 'department_work' (งานแผนก), หรือ 'requisition_actual' (ยอดเบิกจริงจาก ERP ใน Preview)",
            },
            date: {
              type: "STRING",
              description: "วันที่ทำงาน เช่น 2026-10-08 หรือ 8/10/69 (วัน/เดือน/ปี พ.ศ.)",
            },
            department: {
              type: "STRING",
              description: "ชื่อหรือรหัสแผนก เช่น 'ขาไก่', 'แผนกขาไก่', 'KP41', 'บิสกิต', 'KP13'",
            },
            productCode: {
              type: "STRING",
              description: "รหัสสินค้า/วัตถุดิบสำหรับ view=requisition_actual เช่น WK-22020",
            },
          },
          required: ["view", "date", "department"],
        },
      },
      {
        name: "lookup_piece_rate_or_wage",
        description: "ตรวจสอบข้อมูลการสแกนชิ้นงานและบันทึกค่าแรง (Piece-rate) (จำกัดสิทธิ์เฉพาะ HR, บัญชี, Admin หรือดูเฉพาะข้อมูลงานของตนเอง)",
        parameters: {
          type: "OBJECT",
          properties: {
            employeeCode: {
              type: "STRING",
              description: "รหัสพนักงาน เช่น 'KPF-01710'",
            },
            date: {
              type: "STRING",
              description: "วันที่ต้องการตรวจสอบ ในรูปแบบ YYYY-MM-DD",
            },
          },
        },
      },
      {
        name: "lookup_employee_info",
        description: "ค้นหาข้อมูลทะเบียนพนักงาน (จำกัดสิทธิ์เฉพาะ HR และ Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "รหัสพนักงานหรือชื่อพนักงาน",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "lookup_bom_formula",
        description: "ค้นหาข้อมูลโครงสร้างสูตรการผลิต (BOM) ของผลิตภัณฑ์ (ต้องมีสิทธิ์ BOM, QA หรือ Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            productCode: {
              type: "STRING",
              description: "รหัสผลิตภัณฑ์ เช่น 'BL0-5001', 'B03-0003'",
            },
          },
          required: ["productCode"],
        },
      },
      {
        name: "audit_stock_card_and_diff",
        description: "ตรวจสอบประวัติความเคลื่อนไหวสต็อก (Stock Card) แสดงยอดรับเข้า-เบิกจ่าย-ชั่งคืน-ปรับปรุง พร้อมคำนวณยอดคงเหลือสะสม (Running Balance) และวิเคราะห์หาสาเหตุยอดดิฟ (Stock Diff Discrepancy) ของสินค้าหรือวัตถุดิบ (ต้องมีสิทธิ์คลังสินค้า, บัญชีต้นทุน หรือ Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            productCode: {
              type: "STRING",
              description: "รหัสสินค้าหรือวัตถุดิบ เช่น 'WKB-0048', 'WKB-0053', 'B03-0003'",
            },
            lotNo: {
              type: "STRING",
              description: "เลขอ้างอิงล็อตสินค้า เช่น '0409260048-1', '2408260053-1' (ถ้ามี)",
            },
            startDate: {
              type: "STRING",
              description: "วันที่เริ่มต้น ในรูปแบบ YYYY-MM-DD เช่น '2026-09-01'",
            },
            endDate: {
              type: "STRING",
              description: "วันที่สิ้นสุด ในรูปแบบ YYYY-MM-DD เช่น '2026-09-30'",
            },
          },
          required: ["productCode"],
        },
      },
      {
        name: "query_factory_data",
        description: "เครื่องมืออ่านข้อมูลโรงงานจากฐานข้อมูลแบบอ่านอย่างเดียว (Strictly Read-Only Query): ค้นหาข้อมูลจากตารางที่ได้รับอนุญาต เช่น ความเคลื่อนไหวสต็อก, บันทึกการผลิต, แผนผลิต หรือทะเบียนวัตถุดิบ (ห้ามแก้ไขหรือลบข้อมูลเด็ดขาด)",
        parameters: {
          type: "OBJECT",
          properties: {
            table: {
              type: "STRING",
              description: "ชื่อตารางที่ต้องการค้นหา: 'production_stock_movements', 'production_stock_balances_v', 'production_piece_rate_logs', 'production_plans', 'materials'",
            },
            columns: {
              type: "STRING",
              description: "คอลัมน์ที่ต้องการเลือก คั่นด้วยจุลภาค เช่น 'movement_date, product_code, weight_in_kg, weight_out_kg' (ค่าเริ่มต้น '*')",
            },
            filters: {
              type: "OBJECT",
              description: "เงื่อนไขการกรองข้อมูลแบบ key-value เช่น { \"product_code\": \"WKB-0053\", \"lot_no\": \"2408260053-1\" }",
            },
            orderBy: {
              type: "STRING",
              description: "ชื่อคอลัมน์ที่ต้องการเรียงลำดับ เช่น 'created_at', 'movement_date'",
            },
            orderDirection: {
              type: "STRING",
              description: "ทิศทางการเรียงลำดับ: 'asc' (น้อยไปมาก) หรือ 'desc' (มากไปน้อย)",
            },
            limit: {
              type: "INTEGER",
              description: "จำนวนแถวสูงสุด (1-50, ค่าเริ่มต้น 20)",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "get_daily_production_summary",
        description: "สรุปยอดเบิกใช้วัตถุดิบและผลผลิตประจำวันข้ามแผนก (สงวนสิทธิ์เฉพาะ Admin, ผู้มี production-line-planning-manage หรือ plan.view_all)",
        parameters: {
          type: "OBJECT",
          properties: {
            date: {
              type: "STRING",
              description: "วันที่ที่ต้องการดูข้อมูล ในรูปแบบ YYYY-MM-DD เช่น '2026-10-03' (หากถามว่า 'เมื่อวาน' ให้คำนวณเป็นวันที่ของเมื่อวาน หรือระบุ 'yesterday' หรือ 'today')",
            },
            department: {
              type: "STRING",
              description: "แผนก เช่น 'biscuit', 'บิสกิต' (ค่าเริ่มต้นทุกลุ่มงาน)",
            },
          },
          required: ["date"],
        },
      },
      {
        name: "check_production_plan_vs_actual",
        description: "เปรียบเทียบแผนการผลิตกับยอดผลผลิตจริงประจำวันข้ามแผนก (สงวนสิทธิ์เฉพาะ Admin, ผู้มี production-line-planning-manage หรือ plan.view_all); คำถามเฉพาะแผนกให้ใช้ query_department_production_planning",
        parameters: {
          type: "OBJECT",
          properties: {
            date: {
              type: "STRING",
              description: "วันที่ที่ต้องการตรวจสอบ ในรูปแบบ YYYY-MM-DD เช่น '2026-10-03' (หากถามว่า 'เมื่อวาน' ให้ระบุเป็นวันที่ หรือ 'yesterday' หรือ 'today')",
            },
            department: {
              type: "STRING",
              description: "แผนก เช่น 'biscuit', 'บิสกิต'",
            },
          },
          required: ["date"],
        },
      },
      {
        name: "check_material_sufficiency_for_production",
        description: "ตรวจสอบความพอเพียงของวัตถุดิบและพยากรณ์สต็อก (Material Sufficiency & Shortage Check): คำนวณความต้องการวัตถุดิบ (แผ่นเปลือก, แยม, บรรจุภัณฑ์) ตามโครงสร้าง BOM เทียบกับสต็อกคงเหลือจริงในคลัง พร้อมแจ้งเตือนหากวัตถุดิบไม่พอผลิต (ต้องมีสิทธิ์ฝ่ายวางแผน, หัวหน้าแผนก หรือ Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            productCode: {
              type: "STRING",
              description: "รหัสสินค้าสำเร็จรูปที่ต้องการผลิต เช่น 'B01-1009', 'BL0-5001'",
            },
            targetQuantity: {
              type: "NUMBER",
              description: "จำนวนที่ต้องการผลิต เช่น 200, 500 (ปี๊บ หรือ ชิ้น)",
            },
            targetUnit: {
              type: "STRING",
              description: "หน่วย เช่น 'ปี๊บ', 'กล่อง', 'ลัง'",
            },
          },
          required: ["productCode", "targetQuantity"],
        },
      },
      {
        name: "detect_production_anomalies",
        description: "ตรวจจับความผิดปกติหน้างานและการเบิกรั่วไหล (Smart Audit & Anomaly Detection): ตรวจสอบการสแกนเบิ้ล (Double-Scan ในเวลาใกล้เคียงกัน), น้ำหนักที่ผิดปกติวิสัย, ยอดสต็อกติดลบ, และตรวจจับ Ghost Worker (พนักงานที่มีบันทึกค่าแรงแต่ไม่มีเวลาสแกนเข้างาน) ประจำวันที่กำหนด (ต้องมีสิทธิ์หัวหน้าแผนก, HR, บัญชี หรือ Admin)",
        parameters: {
          type: "OBJECT",
          properties: {
            date: {
              type: "STRING",
              description: "วันที่ที่ต้องการตรวจสอบ ในรูปแบบ YYYY-MM-DD เช่น '2026-10-03' (หากถามว่า 'เมื่อวาน' ให้ระบุเป็นวันที่ หรือ 'yesterday' หรือ 'today')",
            },
            department: {
              type: "STRING",
              description: "แผนก เช่น 'biscuit', 'บิสกิต'",
            },
          },
          required: ["date"],
        },
      },
      {
        name: "diagnose_hardware_or_barcode",
        description: "ตรวจสอบบาร์โค้ดและแก้ไขปัญหาอุปกรณ์หน้างาน (Barcode & Hardware Diagnostics): ถอดรหัสบาร์โค้ดสินค้า (EAN-13, Code 128, เลขที่เอกสาร) หรือให้คำแนะนำการแก้ปัญหาอุปกรณ์หน้างาน (เครื่องชั่ง RS232 ค่านิ่งไม่ขึ้น, เครื่องพิมพ์สติกเกอร์ไม่ออก, สแกนเนอร์ไม่ยิง)",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "รหัสบาร์โค้ดที่ต้องการตรวจสอบ (เช่น '8852681021209') หรืออาการเสียของอุปกรณ์ (เช่น 'เครื่องชั่งค่านิ่งไม่ขึ้น', 'เครื่องพิมพ์ไม่ออก')",
            },
            deviceType: {
              type: "STRING",
              description: "ประเภทอุปกรณ์ เช่น 'scale', 'printer', 'scanner', 'barcode'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_system_navigation_guide",
        description: "แนะนำเส้นทาง เมนูหน้าจอ ขั้นตอนการกดปุ่ม (Action Flow) และตรวจสิทธิ์การเข้าถึงของหน้าจอต่างๆ ในโปรแกรม Quickplan เช่น หน้าระบบชั่งเบิกจ่าย, หน้าชั่งคืน, หน้าสแกนป้ายแยม, หน้ารายงาน Input-Output, หน้าสูตร BOM, ศูนย์ควบคุมแผนผลิต",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "ชื่อหน้าจอ หรือสิ่งที่ต้องการทำ เช่น 'ชั่งคืน', 'ป้ายแยม', 'ใบเบิก', 'สูตร BOM', 'ต้นทุน', 'สแกนนิ้ว'",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

const PUBLIC_TOOLS = new Set([
  "search_system_knowledge",
  "read_factory_documentation",
  "lookup_product_info",
  "diagnose_hardware_or_barcode",
  "get_system_navigation_guide",
]);

/**
 * Determine if user is authorized to invoke this specific tool (Pre-invocation Pruning)
 */
export function isToolAuthorizedForUser(toolName, userContext) {
  if (!userContext) return false;
  if (userContext.isAdmin) return true;
  if (PUBLIC_TOOLS.has(toolName)) return true;

  const permissionSet = new Set(userContext.permissions || []);
  const roleSet = new Set((userContext.roles || []).map((r) => String(r).toLowerCase()));
  const isSupervisorOrMgr = isProductionSupervisorOrManager(userContext);

  switch (toolName) {
    case "check_stock_balance":
      return (
        permissionSet.has("stock-inventory") ||
        permissionSet.has("raw-materials-summary") ||
        permissionSet.has("raw-materials-lot") ||
        isSupervisorOrMgr
      );

    case "audit_stock_card_and_diff":
      return (
        permissionSet.has("stock-inventory") ||
        roleSet.has("role-1779435727767") ||
        roleSet.has("คลังวัตถุดิบ") ||
        isSupervisorOrMgr
      );

    case "get_production_plan_status":
      return (
        permissionSet.has("production-line-planning-manage") ||
        permissionSet.has("plan.view_all") ||
        isSupervisorOrMgr
      );

    case "query_department_production_planning":
      return (
        permissionSet.has("production-line-planning-manage") ||
        permissionSet.has("production-line-planning-view") ||
        permissionSet.has("plan.view_all") ||
        permissionSet.has("plan.calculate_own_dept") ||
        permissionSet.has("plan.edit_own_dept")
      );

    case "lookup_piece_rate_or_wage":
    case "lookup_employee_info":
      return (
        roleSet.has("hr") ||
        roleSet.has("admin") ||
        permissionSet.has("admin-employees")
      );

    case "lookup_bom_formula":
      return (
        roleSet.has("qa") ||
        roleSet.has("qa-biscuit") ||
        roleSet.has("costing") ||
        permissionSet.has("production-bom-view") ||
        permissionSet.has("production-bom-manage") ||
        isSupervisorOrMgr
      );

    case "query_factory_data":
      return (
        roleSet.has("role-1779435727767") ||
        roleSet.has("คลังวัตถุดิบ") ||
        isSupervisorOrMgr
      );

    case "get_daily_production_summary":
      return isSupervisorOrMgr;

    case "check_production_plan_vs_actual":
      return hasGlobalPlanningAccess(userContext) || isSupervisorOrMgr;

    case "check_material_sufficiency_for_production":
      return (
        permissionSet.has("stock-inventory") ||
        permissionSet.has("raw-materials-summary") ||
        isSupervisorOrMgr ||
        hasGlobalPlanningAccess(userContext)
      );

    case "detect_production_anomalies":
      return (
        roleSet.has("hr") ||
        roleSet.has("qa") ||
        roleSet.has("qa-biscuit") ||
        isSupervisorOrMgr
      );

    default:
      return false;
  }
}

/**
 * Filter tool declarations so Gemini is only presented tools the logged-in user is authorized to use.
 * Drastically reduces prompt tokens, prevents hallucinations, and enforces security before call generation.
 */
export function getAuthorizedToolDeclarations(userContext) {
  const allDeclarations = TOOL_DECLARATIONS[0]?.functionDeclarations || [];
  if (userContext?.isAdmin) {
    return TOOL_DECLARATIONS;
  }
  const filtered = allDeclarations.filter((tool) => isToolAuthorizedForUser(tool.name, userContext));
  return [{ functionDeclarations: filtered }];
}

/**
 * Execute tool call with strict Role-Based Access Control (RBAC)
 */
export async function executeToolCall({
  name,
  args,
  userContext,
  supabaseAdmin = null,
  request = null,
}) {
  const { userId, username, isAdmin, permissions = [], roles = [] } = userContext;
  const permissionSet = new Set(permissions);
  const roleSet = new Set(roles.map((r) => String(r).toLowerCase()));

  // 1. System Knowledge & Factory Documentation (Public to all logged-in users)
  if (name === "search_system_knowledge" || name === "read_factory_documentation") {
    const topic = String(args?.topic || args?.keyword || "").trim();
    const tLower = topic.toLowerCase();
    let matchedTerm = Object.entries(SYSTEM_TERMINOLOGY).find(
      ([k]) => k.toLowerCase() === tLower
    );
    if (!matchedTerm) {
      const sortedTerms = Object.entries(SYSTEM_TERMINOLOGY).sort((a, b) => b[0].length - a[0].length);
      matchedTerm = sortedTerms.find(
        ([k]) => topic.includes(k.toLowerCase()) || k.toLowerCase().includes(tLower)
      );
    }
    const matchedWorkflow = Object.entries(SYSTEM_WORKFLOWS).find(
      ([k, v]) => tLower.includes(k) || v.title.toLowerCase().includes(tLower)
    );

    // Search knowledge-base/ and docs/ folder with strict userContext RBAC filtering
    const docMatches = searchDocumentationFiles(topic, 3, userContext);

    return {
      success: true,
      searched: topic,
      termMatch: matchedTerm ? { term: matchedTerm[0], description: matchedTerm[1] } : null,
      workflowMatch: matchedWorkflow ? matchedWorkflow[1] : null,
      docMatches: docMatches.length > 0 ? docMatches : null,
      generalHelp: "หากต้องการสอบถามเรื่องการเบิกจ่าย, การขออนุมัติ BOM, ค่าแรงชิ้นงาน, คู่มือป้ายแยม หรือตรวจเช็คสต็อก สามารถระบุคำถามเจาะจงได้ครับ",
    };
  }

  // 1.0 System Navigation & Route Guide (Public to all logged-in users, filtered by role access)
  if (name === "get_system_navigation_guide") {
    const query = String(args?.query || "").trim();
    const matchedRoute = findRouteByIntent(query, userContext);
    if (!matchedRoute) {
      const authorizedList = getAuthorizedRoutes(userContext).map((r) => ({
        title: r.title,
        path: r.path,
        category: r.category,
      }));
      return {
        success: true,
        found: false,
        message: `ไม่พบหน้าจอหรือฟังก์ชันที่ตรงกับ "${query}" หรือบัญชีของคุณอาจไม่มีสิทธิ์เข้าถึงส่วนนี้ครับ`,
        availableRoutes: authorizedList,
      };
    }

    return {
      success: true,
      found: true,
      path: matchedRoute.path,
      title: matchedRoute.title,
      category: matchedRoute.category,
      description: matchedRoute.description,
      primaryActions: matchedRoute.primaryActions,
      troubleshooting: matchedRoute.troubleshooting,
      publicAccess: matchedRoute.publicAccess,
    };
  }

  // 1.1 Product Info Lookup (Public to all logged-in users)
  if (name === "lookup_product_info") {
    const query = String(args?.query || "").trim();
    if (!query) {
      return { success: false, error: "MISSING_QUERY", message: "กรุณาระบุรหัสสินค้าหรือชื่อสินค้าที่ต้องการค้นหา" };
    }

    const qLower = query.toLowerCase();
    const sortedTerms = Object.entries(SYSTEM_TERMINOLOGY).sort((a, b) => b[0].length - a[0].length);
    const staticMatch = sortedTerms.find(
      ([k]) => k.toLowerCase() === qLower || (k.includes("-") && qLower.includes(k.toLowerCase()))
    );

    const matches = [];
    if (staticMatch) {
      matches.push({
        product_code: staticMatch[0],
        product_name: staticMatch[1],
        source: "system_catalog",
      });
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (adminClient) {
        // Search production_stock_balances_v (WIP sheets, WKB, finished goods)
        const { data: stockItems } = await adminClient
          .from("production_stock_balances_v")
          .select("product_code, product_name_snapshot, category_code, department_code")
          .or(`product_code.ilike.%${query}%,product_name_snapshot.ilike.%${query}%`)
          .limit(5);

        if (stockItems && stockItems.length > 0) {
          for (const item of stockItems) {
            if (!matches.some((m) => m.product_code === item.product_code)) {
              matches.push({
                product_code: item.product_code,
                product_name: item.product_name_snapshot,
                category_code: item.category_code,
                department_code: item.department_code,
                source: "production_stock_balances_v",
              });
            }
          }
        }

        // Search production_piece_rate_logs (Piece rate products)
        if (matches.length === 0) {
          const { data: pieceRateLogs } = await adminClient
            .from("production_piece_rate_logs")
            .select("product_code_snapshot, product_name_snapshot")
            .or(`product_code_snapshot.ilike.%${query}%,product_name_snapshot.ilike.%${query}%`)
            .limit(5);

          if (pieceRateLogs && pieceRateLogs.length > 0) {
            for (const log of pieceRateLogs) {
              if (log.product_code_snapshot && !matches.some((m) => m.product_code === log.product_code_snapshot)) {
                matches.push({
                  product_code: log.product_code_snapshot,
                  product_name: log.product_name_snapshot,
                  source: "production_piece_rate_logs",
                });
              }
            }
          }
        }

        // Search production_boms & production_bom_items (WIP doughs & BOM materials like WKB-0041 แป้งหมัก)
        if (matches.length === 0) {
          const { data: bomList } = await adminClient
            .from("production_boms")
            .select("sku_code, status")
            .or(`sku_code.ilike.%${query}%`)
            .limit(5);

          if (bomList && bomList.length > 0) {
            for (const b of bomList) {
              if (!matches.some((m) => m.product_code === b.sku_code)) {
                matches.push({
                  product_code: b.sku_code,
                  product_name: b.sku_code === "WKB-0041" ? "แป้งหมัก (สูตร BOM)" : `สูตรการผลิต ${b.sku_code}`,
                  category_code: "WIP",
                  source: "production_boms",
                });
              }
            }
          }

          const { data: bomItems } = await adminClient
            .from("production_bom_items")
            .select("material_sku_code, material_name, uom_name")
            .or(`material_sku_code.ilike.%${query}%,material_name.ilike.%${query}%`)
            .limit(5);

          if (bomItems && bomItems.length > 0) {
            for (const item of bomItems) {
              const code = item.material_sku_code;
              if (code && !matches.some((m) => m.product_code === code)) {
                matches.push({
                  product_code: code,
                  product_name: item.material_name || (code === "WKB-0041" ? "แป้งหมัก" : code),
                  unit: item.uom_name || "",
                  source: "production_bom_items",
                });
              }
            }
          }
        }

        // Search ERP raw materials (Gateway)
        if (matches.length === 0) {
          const erpMaterials = await queryGatewayRawMaterials(query);
          for (const mat of erpMaterials) {
            matches.push({
              product_code: mat.product_code,
              product_name: mat.product_name,
              category_name: mat.category_name,
              unit: mat.unit,
              current_quantity: mat.current_quantity,
              current_weight_kg: mat.current_weight_kg,
              source: "erp_gateway",
            });
          }
        }
      }

      if (matches.length === 0) {
        return {
          success: true,
          found: false,
          searched: query,
          message: `ไม่พบข้อมูลสินค้าหรือวัตถุดิบสำหรับ '${query}' ในระบบของโรงงาน`,
        };
      }

      return {
        success: true,
        found: true,
        searched: query,
        items: matches,
      };
    } catch {
      if (matches.length > 0) {
        return {
          success: true,
          found: true,
          searched: query,
          items: matches,
        };
      }
      return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถค้นหาข้อมูลสินค้าได้ในขณะนี้" };
    }
  }

  // 2. Stock Balance (Requires stock/inventory permission, Supervisor/Manager or Admin)
  if (name === "check_stock_balance") {
    const hasStockAccess = isProductionSupervisorOrManager(userContext);

    if (!hasStockAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลคลังสินค้า/สต็อก (จำเป็นต้องมีสิทธิ์ stock-inventory หรือสังกัดหัวหน้าแผนก/คลังสินค้า)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }
      const code = String(args?.code || "").trim();

      // 2.1 Query production_stock_balances_v (for WIP sheets, WKB, finished goods, and lot balances)
      const stockQuery = adminClient
        .from("production_stock_balances_v")
        .select("product_code, product_name_snapshot, lot_no, current_quantity, current_weight_kg, category_code, department_code")
        .ilike("product_code", `%${code}%`);

      if (args?.lot) {
        stockQuery.ilike("lot_no", `%${args.lot}%`);
      }

      const { data: stockBalances } = await stockQuery.limit(10);

      if (stockBalances && stockBalances.length > 0) {
        return {
          success: true,
          found: true,
          type: "production_stock",
          searchedCode: code,
          items: stockBalances,
        };
      }

      // 2.2 Query ERP Gateway for raw materials (such as น้ำตาลทราย, แป้งสาลี, M01-0004)
      const erpMaterials = await queryGatewayRawMaterials(code);
      if (erpMaterials && erpMaterials.length > 0) {
        return {
          success: true,
          found: true,
          type: "raw_materials_erp",
          searchedCode: code,
          items: erpMaterials,
        };
      }

      return {
        success: true,
        found: false,
        searchedCode: code,
        message: `ไม่พบข้อมูลสต็อกสำหรับรหัส '${code}' ในระบบ`,
      };
    } catch {
      return {
        success: false,
        error: "QUERY_FAILED",
        message: "ไม่สามารถเชื่อมต่อฐานข้อมูลสต็อกได้ในขณะนี้",
      };
    }
  }

  if (name === "query_department_production_planning") {
    const view = String(args?.view || "").trim().toLowerCase();
    if (!["master_plan", "department_work", "requisition_actual"].includes(view)) {
      return {
        success: false,
        error: "INVALID_VIEW",
        message: "กรุณาระบุข้อมูลที่ต้องการดูให้ชัดเจนว่าเป็นแผนหลัก งานแผนก หรือยอดเบิกจริง",
      };
    }

    const workDate = normalizePlanningDate(args?.date);
    if (!workDate) {
      return {
        success: false,
        error: "INVALID_DATE",
        message: "กรุณาระบุวันที่ให้ชัดเจน เช่น 8/10/69 หรือ 2026-10-08",
      };
    }

    const requestedDepartment = String(args?.department || "").trim();
    if (!requestedDepartment) {
      return {
        success: false,
        error: "MISSING_DEPARTMENT",
        message: "กรุณาระบุแผนกที่ต้องการตรวจสอบ",
      };
    }
    if (!request || !userId) {
      return planningAccessError("ACCESS_DENIED");
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }
      const planningScope = await loadAssistantPlanningScope({
        request,
        userContext,
        supabaseAdmin: adminClient,
      });
      if (planningScope.error) return planningAccessError(planningScope.error);

      const { data: departments, error: departmentsError } = await adminClient
        .from("production_departments")
        .select("id, code, name, is_active")
        .is("deleted_at", null);
      if (departmentsError) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถตรวจสอบแผนกได้ในขณะนี้" };
      }

      const rawDeptKey = requestedDepartment.trim().toLocaleLowerCase();
      const cleanDeptKey = rawDeptKey.replace(/^แผนก\s*/, "");

      const DEPARTMENT_ALIASES = {
        "ขาก่": "KP41",
        "ขาไก่": "KP41",
        "แผนกขาก่": "KP41",
        "แผนกขาไก่": "KP41",
        "บิสกิต": "KP13",
        "บิสกิด": "KP13",
        "แผนกบิสกิต": "KP13",
        "บดน้ำตาล": "KP17",
        "ข้าวเกรียบ": "KP32",
        "เวเฟอร์สติ๊ก": "KP40",
        "เวเฟอร์สติก": "KP40",
        "เวเฟอร์เพลท": "KP06",
        "นมแท่ง": "KP07",
        "บรรจุ": "KP16",
        "บรรจุปี๊บเล็ก": "KP16",
        "ชั่งสูตร": "KP04",
        "ผสมสูตร": "KP36",
        "mic dos": "KP36",
        "ร่อนแป้ง": "KP51",
        "pld": "KP51",
      };

      const aliasCode = DEPARTMENT_ALIASES[rawDeptKey] || DEPARTMENT_ALIASES[cleanDeptKey];

      let matchingDepartments = (departments || []).filter((department) => {
        if (department?.is_active === false) return false;
        const dName = String(department?.name || "").trim().toLocaleLowerCase();
        const dCode = String(department?.code || "").trim().toLocaleLowerCase();
        const dCleanName = dName.replace(/^แผนก\s*/, "");

        // 1. Alias match
        if (aliasCode && dCode === aliasCode.toLowerCase()) return true;

        // 2. Exact match (with or without 'แผนก' prefix)
        if (dName === rawDeptKey || dCode === rawDeptKey) return true;
        if (dCleanName === cleanDeptKey) return true;

        return false;
      });

      // 3. Substring fallback if single match
      if (matchingDepartments.length === 0 && cleanDeptKey.length >= 3) {
        matchingDepartments = (departments || []).filter((department) => {
          if (department?.is_active === false) return false;
          const dCleanName = String(department?.name || "").trim().toLocaleLowerCase().replace(/^แผนก\s*/, "");
          return dCleanName.includes(cleanDeptKey) || cleanDeptKey.includes(dCleanName);
        });
      }

      if (matchingDepartments.length !== 1) {
        return matchingDepartments.length > 1
          ? {
              success: false,
              error: "AMBIGUOUS_DEPARTMENT",
              message: "พบชื่อแผนกซ้ำ กรุณาระบุรหัสแผนกให้ชัดเจน",
            }
          : {
              success: false,
              error: "DEPARTMENT_NOT_FOUND",
              message: "ไม่พบแผนกตามที่ระบุในระบบ",
            };
      }

      const department = matchingDepartments[0];
      if (!planningScope.canAccessRequisitionDepartment(
        planningScope.accessScope,
        department.id
      )) {
        return planningAccessError("ACCESS_DENIED");
      }

      if (view === "requisition_actual") {
        const goodsCode = String(args?.productCode || "").trim().toUpperCase();
        if (!goodsCode) {
          return {
            success: false,
            error: "MISSING_PRODUCT_CODE",
            message: "กรุณาระบุรหัสสินค้า/วัตถุดิบที่ต้องการตรวจสอบ",
          };
        }
        const departmentCode = String(department.code || "").trim();
        if (!departmentCode) {
          return {
            success: false,
            error: "QUERY_FAILED",
            message: "ไม่พบรหัส ERP ของแผนก จึงไม่สามารถยืนยันรายการเบิกได้",
          };
        }

        const result = await fetchRequisitionActualRows({
          goodsCode,
          departmentCode,
          workDate,
        });
        if (result.error) {
          return { success: false, error: "QUERY_FAILED", message: result.error };
        }
        if (result.truncated) {
          return {
            success: false,
            error: "RESULT_SET_INCOMPLETE",
            message: "ข้อมูลมีจำนวนมากเกินขอบเขตที่ตรวจสอบได้ กรุณาจำกัดเงื่อนไขก่อนสรุปยอด",
          };
        }

        const exactRows = result.rows.filter((row) =>
          String(row?.TRD_SH_CODE || "").trim().toUpperCase() === goodsCode
          && String(row?.DEPT_CODE || "").trim().toUpperCase() === departmentCode.toUpperCase()
        );
        const totalsByUnit = new Map();
        exactRows.forEach((row) => {
          const unit = String(row?.TRD_UTQNAME || "").trim() || "ไม่ระบุหน่วย";
          const qty = Number(row?.TRD_QTY);
          if (!Number.isFinite(qty)) return;
          const key = unit.toLocaleLowerCase();
          const current = totalsByUnit.get(key) || { unit, quantity: 0, lines: 0, documents: new Map() };
          current.quantity += qty;
          current.lines += 1;
          const documentNo = String(row?.DI_REF || "").trim();
          if (documentNo) current.documents.set(documentNo, true);
          totalsByUnit.set(key, current);
        });

        return {
          success: true,
          source: "erp_actual_requisition",
          date: workDate,
          department: { code: department.code, name: department.name },
          productCode: goodsCode,
          found: exactRows.length > 0,
          totals: Array.from(totalsByUnit.values()).map((item) => ({
            unit: item.unit,
            quantity: Number(item.quantity.toFixed(3)),
            lineCount: item.lines,
            documentCount: item.documents.size,
            documentNos: Array.from(item.documents.keys()).slice(0, 20),
          })),
        };
      }

      let masterPlan = null;
      if (view === "master_plan" && planningScope.accessScope.canManageGlobal) {
        const { data: masterPlans, error: masterPlanError } = await adminClient
          .from("production_master_plans")
          .select("master_plan_no, period_start, period_end, status, published_at")
          .lte("period_start", workDate)
          .gte("period_end", workDate)
          .order("master_plan_no", { ascending: false })
          .limit(20);
        if (masterPlanError) {
          return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถอ่านสถานะแผนหลักได้" };
        }
        masterPlan = masterPlans || [];
      }

      let planQuery = adminClient
        .from("production_plan_status")
        .select("plan_id, plan_kind, master_plan_no, sub_plan_no, sku_code, sku_name, planned_qty, unit, status, period_start, period_end, entry_date, schedule_section_name, shift_name")
        .eq("owner_department_id", department.id)
        .or(`period_start.eq.${workDate},entry_date.eq.${workDate}`)
        .order("sku_code", { ascending: true })
        .limit(200);
      if (view === "department_work") {
        planQuery = planQuery.eq("plan_kind", "sub");
      } else {
        planQuery = planQuery.eq("plan_kind", "main");
      }

      const { data: plans, error: planError } = await planQuery;
      if (planError) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถอ่านรายการแผนการผลิตได้" };
      }
      return {
        success: true,
        source: view === "master_plan" ? "master_plan_and_department_scope" : "department_subplan",
        scope: "authorized_department_only",
        view,
        date: workDate,
        department: { code: department.code, name: department.name },
        masterPlans: masterPlan,
        plans: plans || [],
        count: plans?.length || 0,
      };
    } catch (error) {
      console.warn("AI department planning query failed:", error?.message || error);
      return {
        success: false,
        error: "QUERY_FAILED",
        message: "เกิดข้อผิดพลาดในการค้นหาข้อมูลวางแผนการผลิต",
      };
    }
  }

  // 3. Production Plan Status (legacy cross-department table; global planners only)
  if (name === "get_production_plan_status") {
    const hasPlanningAccess =
      hasGlobalPlanningAccess(userContext);

    if (!hasPlanningAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์เข้าถึงแผนการผลิตของโรงงาน (จำเป็นต้องมีสิทธิ์ฝ่ายวางแผนหรือ QA)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเข้าถึงฐานข้อมูลได้" };
      }
      const targetDate = args?.date || new Date().toISOString().slice(0, 10);

      const { data: plans, error } = await adminClient
        .from("production_plans")
        .select("id, plan_no, plan_date, status, notes")
        .eq("plan_date", targetDate)
        .limit(5);

      if (error) {
        return {
          success: false,
          error: "QUERY_ERROR",
          message: "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการผลิต",
        };
      }

      return {
        success: true,
        date: targetDate,
        plans: plans || [],
        count: plans?.length || 0,
      };
    } catch (err) {
      return {
        success: false,
        error: "QUERY_FAILED",
        message: "ไม่สามารถเข้าถึงตารางแผนการผลิตได้",
      };
    }
  }

  // 4. Piece Rate or Wage (Strict HR / Accounting / Admin OR self-only)
  if (name === "lookup_piece_rate_or_wage") {
    const hasWageManageAccess =
      isAdmin ||
      roleSet.has("acc") ||
      roleSet.has("hr") ||
      roleSet.has("role-1782447318026") || // บัญชีต้นทุน
      roleSet.has("role-1786435380724");   // หัวหน้าบัญชีต้นทุน

    const requestedEmp = String(args?.employeeCode || "").trim().toUpperCase();

    // If user is a regular operator and tries to inspect someone else or general company wages:
    if (!hasWageManageAccess) {
      // Check if this matches user's own registered username / employee code
      const isSelf = requestedEmp && username.toUpperCase().includes(requestedEmp);
      if (!isSelf) {
        return {
          success: false,
          error: "ACCESS_DENIED",
          message: "ไม่อนุญาตให้เข้าถึงข้อมูลค่าแรงและผลงานของพนักงานท่านอื่น (ข้อมูลนี้สงวนเฉพาะฝ่ายบัญชีและ HR)",
        };
      }
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเข้าถึงฐานข้อมูลได้" };
      }
      let query = adminClient
        .from("production_piece_rate_logs")
        .select("id, doc_no, employee_code, report_date, quantity, weight, status")
        .order("created_at", { ascending: false })
        .limit(10);

      if (requestedEmp) {
        query = query.eq("employee_code", requestedEmp);
      }
      if (args?.date) {
        query = query.eq("report_date", args.date);
      }

      const { data, error } = await query;
      if (error) {
        return {
          success: false,
          error: "QUERY_ERROR",
          message: "ไม่สามารถค้นหาข้อมูลชิ้นงานได้",
        };
      }

      // Security filter: If user does not have accounting role, mask monetary rates/amounts
      const safeData = (data || []).map((row) => {
        if (!hasWageManageAccess) {
          const { wage, total_amount, ...safeRest } = row;
          return { ...safeRest, wage_confidential: true };
        }
        return row;
      });

      return {
        success: true,
        records: safeData,
        count: safeData.length,
      };
    } catch (err) {
      return {
        success: false,
        error: "QUERY_FAILED",
        message: "ระบบขัดข้องในการดึงข้อมูลค่าแรง",
      };
    }
  }

  // 5. Employee Directory (HR or Admin only)
  if (name === "lookup_employee_info") {
    const hasHrAccess =
      isAdmin ||
      roleSet.has("hr") ||
      permissionSet.has("admin-employees");

    if (!hasHrAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์เข้าถึงทะเบียนประวัติพนักงาน (สงวนสิทธิ์เฉพาะฝ่าย HR และผู้ดูแลระบบ)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเข้าถึงฐานข้อมูลได้" };
      }
      const q = String(args?.query || "").trim();
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, username, full_name, is_active, created_at")
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(5);

      if (error) {
        return { success: false, error: "QUERY_ERROR", message: "ค้นหาข้อมูลพนักงานไม่สำเร็จ" };
      }

      return {
        success: true,
        employees: data || [],
      };
    } catch {
      return { success: false, error: "QUERY_FAILED", message: "ระบบค้นหาพนักงานไม่ตอบสนอง" };
    }
  }

  // 6. BOM Formula (BOM, QA or Admin only)
  if (name === "lookup_bom_formula") {
    const hasBomAccess =
      isAdmin ||
      permissionSet.has("production-line-bom-view") ||
      roleSet.has("qa") ||
      roleSet.has("qa-biscuit");

    if (!hasBomAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์ดูโครงสร้างสูตร BOM (ต้องมีสิทธิ์ฝ่ายพัฒนาผลิตภัณฑ์, QA หรือ Admin)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเข้าถึงฐานข้อมูลได้" };
      }
      const productCode = String(args?.productCode || "").trim();

      const { data: boms, error: bomErr } = await adminClient
        .from("production_boms")
        .select("id, sku_code, status, updated_at")
        .ilike("sku_code", `%${productCode}%`)
        .limit(3);

      if (bomErr || !boms || boms.length === 0) {
        return {
          success: true,
          found: false,
          message: `ไม่พบสูตร BOM สำหรับรหัส '${productCode}' ในระบบ`,
        };
      }

      const results = [];
      for (const bom of boms) {
        const { data: versions } = await adminClient
          .from("production_bom_versions")
          .select("id, version_no, formula_code, formula_name, status, base_batch, base_output_boxes")
          .eq("bom_id", bom.id)
          .eq("status", "approved")
          .is("deleted_at", null)
          .order("version_no", { ascending: false })
          .limit(1);

        const latestVersion = versions?.[0];
        let items = [];
        if (latestVersion) {
          const nameMap = new Map();
          if (Array.isArray(latestVersion.changes)) {
            for (const ch of latestVersion.changes) {
              const m = String(ch).match(/^(?:เพิ่ม|ปรับ|ลบ)\s*([A-Za-z0-9._-]+)\s*-\s*(.+)$/);
              if (m) {
                nameMap.set(m[1].trim(), m[2].trim());
              }
            }
          }

          const { data: bomItems } = await adminClient
            .from("production_bom_items")
            .select("material_sku_code, material_goods_code, qty, uom_name, notes")
            .eq("version_id", latestVersion.id);

          items = (bomItems || []).map((it) => {
            const parsedName = nameMap.get(it.material_sku_code);
            const knownName = SYSTEM_TERMINOLOGY[it.material_sku_code];
            const cleanName = parsedName || (knownName ? knownName.split(" - ")[0].split(" (")[0] : null);
            return {
              ...it,
              material_name: cleanName || it.material_sku_code,
            };
          });
        }

        results.push({
          sku_code: bom.sku_code,
          status: bom.status,
          latestVersion: latestVersion ? {
            version_no: latestVersion.version_no,
            formula_name: latestVersion.formula_name,
            base_output_boxes: latestVersion.base_output_boxes,
          } : null,
          items,
        });
      }

      return {
        success: true,
        found: true,
        boms: results,
      };
    } catch {
      return { success: false, error: "QUERY_FAILED", message: "เกิดข้อผิดพลาดในการดึงข้อมูล BOM" };
    }
  }

  // 7. Stock Card & Diff Discrepancy Audit
  if (name === "audit_stock_card_and_diff") {
    const hasAuditAccess = isProductionSupervisorOrManager(userContext);

    if (!hasAuditAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์ตรวจสอบสต็อกการ์ดหรือวิเคราะห์ยอดดิฟ (ต้องมีสิทธิ์หัวหน้าแผนก, คลังสินค้า, บัญชีต้นทุน หรือ Admin)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      const productCode = String(args?.productCode || "").trim();
      const lotNo = args?.lotNo ? String(args.lotNo).trim() : null;

      // 7.1 Fetch balance summary from view
      let balanceQuery = adminClient
        .from("production_stock_balances_v")
        .select("product_code, product_name_snapshot, lot_no, opening_weight_kg, receipt_weight_kg, issue_weight_kg, return_weight_kg, actual_use_weight_kg, adjustment_in_weight_kg, adjustment_out_weight_kg, current_weight_kg, current_quantity")
        .ilike("product_code", `%${productCode}%`);

      if (lotNo) {
        balanceQuery = balanceQuery.ilike("lot_no", `%${lotNo}%`);
      }

      const { data: balanceData } = await balanceQuery.limit(5);

      // 7.2 Fetch individual transactions from production_stock_movements
      let movementQuery = adminClient
        .from("production_stock_movements")
        .select("id, movement_no, movement_type, movement_date, movement_at, product_code, product_name_snapshot, lot_no, uom_name, quantity_in, quantity_out, weight_in_kg, weight_out_kg, source_document_type, source_document_no, reference_no, remark")
        .ilike("product_code", `%${productCode}%`)
        .order("movement_date", { ascending: true })
        .order("movement_at", { ascending: true });

      if (lotNo) {
        movementQuery = movementQuery.ilike("lot_no", `%${lotNo}%`);
      }
      if (args?.startDate) {
        movementQuery = movementQuery.gte("movement_date", args.startDate);
      }
      if (args?.endDate) {
        movementQuery = movementQuery.lte("movement_date", args.endDate);
      }

      const { data: rawMovements, error: movErr } = await movementQuery.limit(50);

      if (movErr) {
        console.warn("movementQuery error:", movErr);
        return { success: false, error: "QUERY_ERROR", message: `ไม่สามารถดึงข้อมูลความเคลื่อนไหวสต็อกได้: ${movErr.message}` };
      }

      const movements = rawMovements || [];
      const primaryBalance = balanceData?.[0] || null;

      // 7.3 Compute running balance & audit discrepancies
      let runningWeight = primaryBalance ? Number(primaryBalance.opening_weight_kg || 0) : 0;
      let totalReceiptWeight = 0;
      let totalIssueWeight = 0;
      let totalReturnWeight = 0;
      let totalActualUseWeight = 0;

      const ledger = [];
      const anomalies = [];
      const seenDocs = new Map();

      for (const m of movements) {
        const wIn = Number(m.weight_in_kg || 0);
        const wOut = Number(m.weight_out_kg || 0);
        const type = String(m.movement_type || "").toUpperCase();

        if (type.includes("RECEIPT") || type.includes("IN")) {
          totalReceiptWeight += wIn;
          runningWeight += wIn;
        } else if (type.includes("RETURN")) {
          totalReturnWeight += wIn;
          runningWeight += wIn;
        } else if (type.includes("ACTUAL")) {
          totalActualUseWeight += wOut;
          runningWeight -= wOut;
        } else if (type.includes("ISSUE") || type.includes("OUT")) {
          totalIssueWeight += wOut;
          runningWeight -= wOut;
        } else {
          runningWeight += (wIn - wOut);
        }

        // Anomaly: Negative stock dip
        if (runningWeight < -0.005) {
          anomalies.push({
            type: "NEGATIVE_STOCK",
            date: m.movement_date,
            docNo: m.source_document_no || m.movement_no,
            runningBalance: Number(runningWeight.toFixed(3)),
            description: `ยอดสต็อกติดลบ (${runningWeight.toFixed(3)} กก.) หลังจากทำรายการเอกสาร ${m.source_document_no || m.movement_no}`,
          });
        }

        // Anomaly: Duplicate source document issue/receipt
        const docKey = `${m.source_document_type}_${m.source_document_no}`;
        if (m.source_document_no && seenDocs.has(docKey)) {
          anomalies.push({
            type: "POTENTIAL_DUPLICATE",
            date: m.movement_date,
            docNo: m.source_document_no,
            description: `พบเลขที่เอกสารซ้ำ (${m.source_document_no}) ถูกบันทึกมากกว่า 1 ครั้งในระบบ`,
          });
        } else if (m.source_document_no) {
          seenDocs.set(docKey, true);
        }

        ledger.push({
          date: m.movement_date,
          time: m.movement_at ? new Date(m.movement_at).toISOString().slice(11, 16) : "-",
          type: m.movement_type,
          lotNo: m.lot_no,
          docNo: m.source_document_no || m.movement_no,
          refNo: m.reference_no || "-",
          weightIn: wIn > 0 ? Number(wIn.toFixed(3)) : 0,
          weightOut: wOut > 0 ? Number(wOut.toFixed(3)) : 0,
          runningBalanceKg: Number(runningWeight.toFixed(3)),
          remark: m.remark || "",
        });
      }

      // Check diff between reported view and calculated ledger
      const reportedCurrentWeight = primaryBalance ? Number(primaryBalance.current_weight_kg || 0) : null;
      const calculatedClosingWeight = Number(runningWeight.toFixed(3));
      const diffWeight = reportedCurrentWeight !== null ? Number((reportedCurrentWeight - calculatedClosingWeight).toFixed(3)) : 0;

      return {
        success: true,
        productCode,
        productName: primaryBalance?.product_name_snapshot || movements[0]?.product_name_snapshot || SYSTEM_TERMINOLOGY[productCode] || productCode,
        lotNo: lotNo || primaryBalance?.lot_no || "ทุกล็อต",
        summary: {
          openingWeightKg: primaryBalance ? Number(primaryBalance.opening_weight_kg || 0) : 0,
          totalReceiptWeightKg: Number(totalReceiptWeight.toFixed(3)),
          totalIssueWeightKg: Number(totalIssueWeight.toFixed(3)),
          totalReturnWeightKg: Number(totalReturnWeight.toFixed(3)),
          calculatedClosingWeightKg: calculatedClosingWeight,
          reportedCurrentWeightKg: reportedCurrentWeight,
          diffWeightKg: diffWeight,
          transactionCount: movements.length,
        },
        stockCard: ledger,
        anomalies,
        hasAnomalies: anomalies.length > 0 || Math.abs(diffWeight) > 0.005,
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `เกิดข้อผิดพลาดในการตรวจสอบสต็อกการ์ด: ${err.message}` };
    }
  }

  // 8. Universal Factory Data Query
  if (name === "query_factory_data") {
    const table = String(args?.table || "").trim().toLowerCase();
    const allowedTables = [
      "production_stock_movements",
      "production_stock_balances_v",
      "production_piece_rate_logs",
      "production_piece_rate_waste_logs",
      "production_master_plans",
      "production_sub_plans",
      "materials",
    ];

    if (!allowedTables.includes(table)) {
      return {
        success: false,
        error: "FORBIDDEN_TABLE",
        message: `ตาราง '${table}' ไม่อยู่ในรายชื่อตารางที่อนุญาตให้เรียกดูผ่าน AI Assistant`,
      };
    }

    // Role checks per table
    if (table.includes("stock")) {
      const hasStockAccess = isProductionSupervisorOrManager(userContext);
      if (!hasStockAccess) {
        return { success: false, error: "ACCESS_DENIED", message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลสต็อกในตารางนี้" };
      }
    } else if (table.includes("plan")) {
      const hasPlanAccess = hasGlobalPlanningAccess(userContext);
      if (!hasPlanAccess) {
        return { success: false, error: "ACCESS_DENIED", message: "ตารางแผนรวมสงวนไว้สำหรับผู้มีสิทธิ์ดูแผนทุกแผนก กรุณาระบุแผนกเพื่อค้นหาข้อมูลในขอบเขตสิทธิ์ของคุณ" };
      }
    } else if (table.includes("piece_rate") || table.includes("waste")) {
      const hasPieceRateAccess =
        isAdmin ||
        roleSet.has("acc") ||
        roleSet.has("hr") ||
        isProductionSupervisorOrManager(userContext);
      if (!hasPieceRateAccess) {
        return { success: false, error: "ACCESS_DENIED", message: "คุณไม่มีสิทธิ์เข้าถึงตารางบันทึกค่าแรงชิ้นงานหรือของเสีย" };
      }
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      const selectCols = typeof args?.columns === "string" && args.columns.trim() ? args.columns.trim() : "*";
      let q = adminClient.from(table).select(selectCols);
      const filters = args?.filters || {};
      for (const [col, val] of Object.entries(filters)) {
        if (val !== undefined && val !== null && val !== "") {
          q = q.eq(col, val);
        }
      }

      if (args?.orderBy && typeof args.orderBy === "string") {
        q = q.order(args.orderBy, { ascending: args?.orderDirection !== "desc" });
      }

      const limit = Math.min(Math.max(Number(args?.limit || 20), 1), 50);
      const { data, error } = await q.limit(limit);

      if (error) {
        return { success: false, error: "QUERY_ERROR", message: error.message };
      }

      return {
        success: true,
        table,
        count: data?.length || 0,
        records: data || [],
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `ค้นหาตารางล้มเหลว: ${err.message}` };
    }
  }

  // 9. Daily Production & Usage Summary (Shells, Meat WIP, Jams, FG)
  if (name === "get_daily_production_summary") {
    if (!hasGlobalPlanningAccess(userContext)) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "รายงานสรุปข้ามแผนกสงวนไว้สำหรับผู้มีสิทธิ์ดูแผนทุกแผนก",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      let reqDate = String(args?.date || "").trim();
      const now = new Date();
      // GMT+7 Bangkok time
      const bkkNow = new Date(now.getTime() + 7 * 3600000);
      const todayStr = bkkNow.toISOString().slice(0, 10);
      const yDate = new Date(bkkNow.getTime() - 86400000);
      const yesterdayStr = yDate.toISOString().slice(0, 10);

      if (!reqDate || reqDate.toLowerCase() === "today" || reqDate.includes("วันนี้")) {
        reqDate = todayStr;
      } else if (reqDate.toLowerCase() === "yesterday" || reqDate.includes("เมื่อวาน")) {
        reqDate = yesterdayStr;
      }

      // 1. Fetch movements for this date
      const { data: movements, error: movErr } = await adminClient
        .from("production_stock_movements")
        .select("product_code, product_name_snapshot, movement_type, weight_in_kg, weight_out_kg, uom_name, quantity_in, quantity_out, remark")
        .eq("movement_date", reqDate);

      if (movErr) {
        return { success: false, error: "QUERY_ERROR", message: movErr.message };
      }

      // 2. Fetch jam usage entries (app manual logs)
      const { data: jamEntries } = await adminClient
        .from("production_jam_usage_entries")
        .select("goods_code, goods_name_snapshot, lot_no, weight_kg")
        .eq("usage_date", reqDate);

      // 3. Fetch piece rate logs for FG counts & packing output
      const { data: pieceRateLogs } = await adminClient
        .from("production_piece_rate_logs")
        .select("product_code_snapshot, product_name_snapshot, machine_code, input_mode_snapshot, input_value, count_value_snapshot, normalized_kg_amount_snapshot, weight_kg_snapshot, kg_per_pail_snapshot, wage_amount_snapshot, pay_rate_per_kg_snapshot, doc_status")
        .gte("actual_weighed_at", `${reqDate}T00:00:00+07:00`)
        .lte("actual_weighed_at", `${reqDate}T23:59:59.999+07:00`)
        .or("doc_status.eq.active,doc_status.is.null");

      // Categorize products with strict factory taxonomy
      const shells = {}; // แผ่นก่อนป้ายแยมจากเตาอบ
      const meatAssemblies = {}; // ชิ้นงานป้ายแยมเสร็จ (Meat WIP)
      const jams = {}; // วัตถุดิบแยม (Raw Materials)
      const finishedGoods = {}; // สินค้าสำเร็จรูป (FG - ปี๊บ/กล่อง)
      const others = {};

      const KNOWN_SHELL_CODES = new Set([
        "WKB-0002", "WKB-0048", "WKB-0050", "WKB-0052", "WKB-0053", "WKB-0054", "WKB-0068", "WKB-0069"
      ]);
      const KNOWN_MEAT_CODES = new Set([
        "WKB-0002-2", "WKB-0064", "WKB-0065", "WKB-0066", "WKB-0067", "WKB-0070"
      ]);
      const KNOWN_JAM_CODES = new Set([
        "M04-0088", "M04-0126-1", "M04-0127-1", "B03-0003"
      ]);

      for (const m of (movements || [])) {
        const code = String(m.product_code || "").trim();
        const name = m.product_name_snapshot || SYSTEM_TERMINOLOGY[code] || code;
        const wIn = Number(m.weight_in_kg || 0);
        const wOut = Number(m.weight_out_kg || 0);
        const qtyIn = Number(m.quantity_in || 0);
        const qtyOut = Number(m.quantity_out || 0);
        const type = String(m.movement_type || "").toLowerCase();

        // 1. Finished Goods (FG) - HIGHEST PRIORITY: Never classify FG as Jam even if remark mentions 'แยม'
        const isFG = code.startsWith("B01-") || code.startsWith("BL0-") || code.startsWith("FG-") || code.startsWith("F-");

        // 2. Meat WIP / Assemblies (เนื้อขนมป้ายแยม)
        const isMeat = KNOWN_MEAT_CODES.has(code) || name.includes("ป้ายแยม") || name.includes("เนื้อขนม");

        // 3. Shells (แผ่นเปลือกขนมจากเตาอบ)
        const isShell = KNOWN_SHELL_CODES.has(code) || (name.includes("แผ่น") && !isMeat);

        // 4. Jams (วัตถุดิบแยมจริง)
        const isJam = KNOWN_JAM_CODES.has(code) || code.startsWith("M04-") || (name.includes("แยม") && !isMeat && !isFG && !isShell);

        let targetMap = others;
        if (isFG) targetMap = finishedGoods;
        else if (isMeat) targetMap = meatAssemblies;
        else if (isShell) targetMap = shells;
        else if (isJam) targetMap = jams;

        if (!targetMap[code]) {
          targetMap[code] = {
            product_code: code,
            product_name: name,
            uom_name: m.uom_name || "กก.",
            produced_receipt_kg: 0,
            issued_kg: 0,
            returned_kg: 0,
            quantity_in: 0,
            quantity_out: 0,
            transaction_count: 0,
          };
        }

        const item = targetMap[code];
        item.transaction_count++;
        item.quantity_in += qtyIn;
        item.quantity_out += qtyOut;

        if (type === "receipt_in") {
          item.produced_receipt_kg = Number((item.produced_receipt_kg + wIn).toFixed(3));
        } else if (type === "issue_out") {
          item.issued_kg = Number((item.issued_kg + wOut).toFixed(3));
        } else if (type === "return_in") {
          item.returned_kg = Number((item.returned_kg + wIn).toFixed(3));
        } else {
          if (wIn > 0) item.produced_receipt_kg = Number((item.produced_receipt_kg + wIn).toFixed(3));
          if (wOut > 0) item.issued_kg = Number((item.issued_kg + wOut).toFixed(3));
        }
      }

      // Merge direct jam usage entries (App manual jam logs)
      for (const j of (jamEntries || [])) {
        const code = j.goods_code || "JAM";
        const name = j.goods_name_snapshot || SYSTEM_TERMINOLOGY[code] || "แยม";
        const w = Number(j.weight_kg || 0);
        if (!jams[code]) {
          jams[code] = {
            product_code: code,
            product_name: name,
            produced_receipt_kg: 0,
            issued_kg: w,
            returned_kg: 0,
            transaction_count: 1,
          };
        } else {
          jams[code].issued_kg = Number((jams[code].issued_kg + w).toFixed(3));
          jams[code].transaction_count = (jams[code].transaction_count || 0) + 1;
        }
      }

      // Merge piece-rate logs for Finished Goods
      for (const pl of (pieceRateLogs || [])) {
        const code = pl.product_code_snapshot || "";
        const isFgLog = code.startsWith("B01-") || code.startsWith("BL0-") || code.startsWith("FG-");
        if (isFgLog) {
          const name = pl.product_name_snapshot || SYSTEM_TERMINOLOGY[code] || code;
          const isPail = String(pl.input_mode_snapshot || "").toLowerCase() === "pail";
          const count = isPail ? Number(pl.input_value || 0) : Number(pl.count_value_snapshot || 0);
          const kg = Number(pl.normalized_kg_amount_snapshot || pl.weight_kg_snapshot || 0);
          if (!finishedGoods[code]) {
            finishedGoods[code] = {
              product_code: code,
              product_name: name,
              produced_receipt_kg: kg,
              total_pails_or_boxes: count,
              uom_name: "ปี๊บ",
            };
          } else {
            finishedGoods[code].total_pails_or_boxes = (finishedGoods[code].total_pails_or_boxes || 0) + count;
            if (finishedGoods[code].produced_receipt_kg === 0) {
              finishedGoods[code].produced_receipt_kg = kg;
            }
          }
        }
      }

      // 4. Fetch waste / scrap logs
      const { data: wasteLogs } = await adminClient
        .from("production_piece_rate_waste_logs")
        .select("product_code_snapshot, product_name_snapshot, waste_category, waste_weight_kg, status")
        .gte("actual_weighed_at", `${reqDate}T00:00:00+07:00`)
        .lte("actual_weighed_at", `${reqDate}T23:59:59.999+07:00`)
        .eq("status", "confirmed");

      // Formatting responses clearly per group
      const formatShells = (map) =>
        Object.values(map).map((item) => {
          const actualUseKg = Math.max(0, Number((item.issued_kg - item.returned_kg).toFixed(3)));
          return {
            product_code: item.product_code,
            product_name: item.product_name,
            oven_produced_kg: item.produced_receipt_kg,
            issued_kg: item.issued_kg,
            returned_kg: item.returned_kg,
            actual_use_kg: actualUseKg,
            status_summary: item.produced_receipt_kg > 0 && item.issued_kg > 0
              ? `เตาอบผลิตได้ ${item.produced_receipt_kg.toLocaleString()} กก., เบิกใช้จริง ${actualUseKg.toLocaleString()} กก.`
              : item.produced_receipt_kg > 0
              ? `เตาอบผลิตได้ ${item.produced_receipt_kg.toLocaleString()} กก. (รับเข้าคลัง)`
              : `เบิกไปผลิต ${item.issued_kg.toLocaleString()} กก.` + (item.returned_kg > 0 ? ` (คืน ${item.returned_kg} กก., ใช้จริง ${actualUseKg} กก.)` : ""),
          };
        });

      const formatMeat = (map) =>
        Object.values(map).map((item) => {
          const actualIssuedKg = Math.max(0, Number((item.issued_kg - item.returned_kg).toFixed(3)));
          return {
            product_code: item.product_code,
            product_name: item.product_name,
            jam_assembled_produced_kg: item.produced_receipt_kg,
            issued_to_packing_kg: actualIssuedKg,
            status_summary: item.produced_receipt_kg > 0 && actualIssuedKg > 0
              ? `ป้ายแยมเสร็จ ${item.produced_receipt_kg.toLocaleString()} กก., เบิกไปบรรจุ ${actualIssuedKg.toLocaleString()} กก.`
              : item.produced_receipt_kg > 0
              ? `ป้ายแยมเสร็จรับเข้า ${item.produced_receipt_kg.toLocaleString()} กก.`
              : `เบิกไปบรรจุ ${actualIssuedKg.toLocaleString()} กก.`,
          };
        });

      const formatJams = (map) =>
        Object.values(map).map((item) => ({
          product_code: item.product_code,
          product_name: item.product_name,
          issued_kg: item.issued_kg,
          returned_kg: item.returned_kg,
          actual_use_kg: Math.max(0, Number((item.issued_kg - item.returned_kg).toFixed(3))),
        }));

      const formatFG = (map) =>
        Object.values(map).map((item) => {
          const pails = item.total_pails_or_boxes || (item.produced_receipt_kg > 0 ? Math.round(item.produced_receipt_kg / 5) : 0);
          return {
            product_code: item.product_code,
            product_name: item.product_name,
            total_produced_kg: item.produced_receipt_kg,
            pails_or_boxes: pails,
            uom: item.uom_name || "ปี๊บ",
            status_summary: `ผลิตสำเร็จรูป ${pails.toLocaleString()} ${item.uom_name || "ปี๊บ"} (${item.produced_receipt_kg.toLocaleString()} กก.)`,
          };
        });

      // Format Waste / Scrap
      const wasteSummary = {};
      let totalWasteKg = 0;
      for (const w of (wasteLogs || [])) {
        const cat = w.waste_category || "เศษทั่วไป";
        const catLabel = cat === "broken_scrap" ? "เศษแตกหัก" : (cat === "burnt_scrap" ? "เศษไหม้" : (cat === "label_scrap" ? "เศษขอบ/สติกเกอร์" : cat));
        const kg = Number(w.waste_weight_kg || 0);
        totalWasteKg = Number((totalWasteKg + kg).toFixed(3));
        wasteSummary[catLabel] = Number(((wasteSummary[catLabel] || 0) + kg).toFixed(3));
      }

      // Operational Insights & Yield Calculation
      const operationalInsights = [];
      const shellArr = formatShells(shells);
      const fgArr = formatFG(finishedGoods);

      // Correlation 1: WKB-0048 -> B01-1009
      const wkb0048 = shellArr.find((s) => s.product_code === "WKB-0048");
      const b011009 = fgArr.find((f) => f.product_code === "B01-1009");
      if (wkb0048 && b011009 && wkb0048.actual_use_kg > 0 && b011009.total_produced_kg > 0) {
        const yieldPct = Number(((b011009.total_produced_kg / wkb0048.actual_use_kg) * 100).toFixed(2));
        const lossKg = Number((wkb0048.actual_use_kg - b011009.total_produced_kg).toFixed(2));
        operationalInsights.push({
          type: "YIELD_ANALYSIS",
          title: "วิเคราะห์อัตราผลผลิต (Packing Yield Analysis)",
          description: `แผ่นแครกเกอร์งาหอม (${wkb0048.product_code}) เบิกใช้จริง ${wkb0048.actual_use_kg.toLocaleString()} กก. นำไปบรรจุได้แม่มะลิ งาหอม (${b011009.product_code}) ${b011009.pails_or_boxes.toLocaleString()} ปี๊บ (${b011009.total_produced_kg.toLocaleString()} กก.) อัตรา Yield = ${yieldPct}% (Loss ส่วนต่าง = ${lossKg} กก. หรือ ${(100 - yieldPct).toFixed(2)}%) ซึ่งเป็นเกณฑ์มาตรฐานการบรรจุที่ดีเยี่ยม`,
        });
      }

      // Staging Insight: Shells issued without FG on same date
      const stagedShells = shellArr.filter((s) => s.actual_use_kg > 0 && s.product_code !== "WKB-0048");
      if (stagedShells.length > 0) {
        const stagedNames = stagedShells.map((s) => `${s.product_name} (${s.actual_use_kg} กก.)`).join(", ");
        operationalInsights.push({
          type: "WIP_STAGING",
          title: "งานระหว่างผลิตรอการบรรจุ (WIP Staging In-Progress)",
          description: `มีการเบิกแผ่นเปลือกขนม ${stagedNames} รวม ${stagedShells.reduce((sum, s) => sum + s.actual_use_kg, 0).toFixed(2)} กก. เพื่อเตรียมเข้าไลน์บรรจุ/ผลิตต่อเนื่องในกะถัดไป (ไม่ได้สูญหาย)`,
        });
      }

      // Oven Output Insight
      const ovenItems = shellArr.filter((s) => s.oven_produced_kg > 0);
      if (ovenItems.length > 0) {
        const totalOvenKg = ovenItems.reduce((sum, s) => sum + s.oven_produced_kg, 0).toFixed(2);
        operationalInsights.push({
          type: "OVEN_OUTPUT",
          title: "ผลผลิตใหม่จากเตาอบ (New Oven Output)",
          description: `เตาอบส่งมอบแผ่นขนมใหม่เข้าคลังรวม ${totalOvenKg} กก. (ได้แก่ ${ovenItems.map((o) => `${o.product_name} ${o.oven_produced_kg} กก.`).join(", ")})`,
        });
      }

      // Machine & Shift Breakdown
      const machineBreakdown = {};
      for (const pl of (pieceRateLogs || [])) {
        const mCode = pl.machine_code || "P01/ไลน์ทั่วไป";
        if (!machineBreakdown[mCode]) {
          machineBreakdown[mCode] = {
            machine_code: mCode,
            total_count: 0,
            total_weight_kg: 0,
            products: {},
          };
        }
        const isPail = String(pl.input_mode_snapshot || "").toLowerCase() === "pail";
        const count = isPail ? Number(pl.input_value || 0) : Number(pl.count_value_snapshot || 0);
        const kg = Number(pl.normalized_kg_amount_snapshot || pl.weight_kg_snapshot || 0);
        machineBreakdown[mCode].total_count += count;
        machineBreakdown[mCode].total_weight_kg = Number((machineBreakdown[mCode].total_weight_kg + kg).toFixed(3));
        const pCode = pl.product_code_snapshot || "";
        if (!machineBreakdown[mCode].products[pCode]) {
          machineBreakdown[mCode].products[pCode] = {
            product_code: pCode,
            product_name: pl.product_name_snapshot || pCode,
            count: 0,
            weight_kg: 0,
          };
        }
        machineBreakdown[mCode].products[pCode].count += count;
        machineBreakdown[mCode].products[pCode].weight_kg = Number((machineBreakdown[mCode].products[pCode].weight_kg + kg).toFixed(3));
      }

      // Labor Cost & Wage Efficiency (Protected by hasWageManageAccess)
      const hasWageAccess =
        isAdmin ||
        roleSet.has("acc") ||
        roleSet.has("hr") ||
        roleSet.has("role-1782447318026") || // บัญชีต้นทุน
        roleSet.has("role-1786435380724") || // Costing
        permissionSet.has("production-line-attendance-report-manage") ||
        permissionSet.has("production-line-piece-rate-manage");

      let laborCostEfficiency = null;
      if (hasWageAccess) {
        let totalWage = 0;
        const productWages = [];
        for (const [code, item] of Object.entries(finishedGoods)) {
          const logsForProd = (pieceRateLogs || []).filter((l) => l.product_code_snapshot === code);
          const prodWage = logsForProd.reduce((sum, l) => sum + Number(l.wage_amount_snapshot || 0), 0);
          totalWage += prodWage;
          const pails = item.total_pails_or_boxes || (item.produced_receipt_kg > 0 ? Math.round(item.produced_receipt_kg / 5) : 0);
          const kg = item.produced_receipt_kg;
          productWages.push({
            product_code: code,
            product_name: item.product_name,
            total_produced_pails: pails,
            total_produced_kg: kg,
            total_piece_rate_wage_baht: Number(prodWage.toFixed(2)),
            avg_wage_per_pail: pails > 0 ? Number((prodWage / pails).toFixed(2)) : 0,
            avg_wage_per_kg: kg > 0 ? Number((prodWage / kg).toFixed(2)) : 0,
            uom: item.uom_name || "ปี๊บ",
          });
        }
        laborCostEfficiency = {
          authorized: true,
          totalPieceRateWageBaht: Number(totalWage.toFixed(2)),
          productBreakdown: productWages,
          note: "ข้อมูลค่าแรงชิ้นงานและต้นทุนต่อหน่วยสำหรับฝ่ายบริหารและบัญชีต้นทุน (Costing & Admin)",
        };
      } else {
        laborCostEfficiency = {
          authorized: false,
          wageConfidential: true,
          message: "ข้อมูลค่าแรงชิ้นงานและต้นทุนเฉลี่ยต่อหน่วยสงวนสิทธิ์เฉพาะฝ่ายบริหารและบัญชีต้นทุน",
        };
      }

      return {
        success: true,
        reportDate: reqDate,
        summary: {
          shellItems: shellArr,
          meatAssemblyItems: formatMeat(meatAssemblies),
          jamItems: formatJams(jams),
          finishedGoodsItems: fgArr,
          wasteItems: Object.entries(wasteSummary).map(([cat, kg]) => ({ category: cat, weight_kg: kg })),
          totalWasteKg,
          machineBreakdown: Object.values(machineBreakdown).map((m) => ({
            ...m,
            products: Object.values(m.products),
          })),
          laborCostEfficiency,
          operationalInsights,
          totalMovementsCount: movements?.length || 0,
        },
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `เกิดข้อผิดพลาดในการดึงสรุปยอดผลิต: ${err.message}` };
    }
  }

  // 10. Plan vs Actual Tracking
  if (name === "check_production_plan_vs_actual") {
    const hasPlanAccess = hasGlobalPlanningAccess(userContext);

    if (!hasPlanAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "รายงานเปรียบเทียบแผนรวมสงวนไว้สำหรับผู้มีสิทธิ์ดูแผนทุกแผนก กรุณาระบุแผนกเพื่อค้นหาข้อมูลในขอบเขตสิทธิ์ของคุณ",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      let reqDate = String(args?.date || "").trim();
      const now = new Date();
      const bkkNow = new Date(now.getTime() + 7 * 3600000);
      const todayStr = bkkNow.toISOString().slice(0, 10);
      const yDate = new Date(bkkNow.getTime() - 86400000);
      const yesterdayStr = yDate.toISOString().slice(0, 10);

      if (!reqDate || reqDate.toLowerCase() === "today" || reqDate.includes("วันนี้")) {
        reqDate = todayStr;
      } else if (reqDate.toLowerCase() === "yesterday" || reqDate.includes("เมื่อวาน")) {
        reqDate = yesterdayStr;
      }

      // 1. Fetch plans for this date from production_plan_status
      const { data: planRows, error: planErr } = await adminClient
        .from("production_plan_status")
        .select("plan_id, sku_code, sku_name, category_name, planned_qty, unit, period_start, period_end, entry_date, master_plan_no, sub_plan_no, schedule_section_name, shift_name, line_machine_no, status")
        .or(`period_start.eq.${reqDate},entry_date.eq.${reqDate}`);

      if (planErr) {
        return { success: false, error: "QUERY_ERROR", message: `ดึงข้อมูลแผนการผลิตไม่สำเร็จ: ${planErr.message}` };
      }

      // 2. Fetch actual movements for this date
      const { data: movements } = await adminClient
        .from("production_stock_movements")
        .select("product_code, product_name_snapshot, movement_type, weight_in_kg, weight_out_kg, quantity_in, quantity_out")
        .eq("movement_date", reqDate);

      // 3. Fetch piece rate logs for FG counts & packing output
      const { data: pieceRateLogs } = await adminClient
        .from("production_piece_rate_logs")
        .select("product_code_snapshot, product_name_snapshot, input_mode_snapshot, input_value, count_value_snapshot, normalized_kg_amount_snapshot, weight_kg_snapshot")
        .gte("actual_weighed_at", `${reqDate}T00:00:00+07:00`)
        .lte("actual_weighed_at", `${reqDate}T23:59:59.999+07:00`)
        .or("doc_status.eq.active,doc_status.is.null");

      // Build actual produced map
      const actualProduced = new Map();
      for (const m of (movements || [])) {
        const code = String(m.product_code || "").trim();
        const type = String(m.movement_type || "").toLowerCase();
        const wIn = Number(m.weight_in_kg || 0);
        if (type === "receipt_in" && wIn > 0) {
          if (!actualProduced.has(code)) {
            actualProduced.set(code, {
              code,
              name: m.product_name_snapshot || code,
              produced_kg: 0,
              pails: 0,
            });
          }
          actualProduced.get(code).produced_kg = Number((actualProduced.get(code).produced_kg + wIn).toFixed(3));
        }
      }

      for (const pl of (pieceRateLogs || [])) {
        const code = String(pl.product_code_snapshot || "").trim();
        const isPail = String(pl.input_mode_snapshot || "").toLowerCase() === "pail";
        const count = isPail ? Number(pl.input_value || 0) : Number(pl.count_value_snapshot || 0);
        const kg = Number(pl.normalized_kg_amount_snapshot || pl.weight_kg_snapshot || 0);
        if (!actualProduced.has(code)) {
          actualProduced.set(code, {
            code,
            name: pl.product_name_snapshot || code,
            produced_kg: kg,
            pails: count,
          });
        } else {
          actualProduced.get(code).pails += count;
          if (actualProduced.get(code).produced_kg === 0) {
            actualProduced.get(code).produced_kg = kg;
          }
        }
      }

      // Correlate plan vs actual
      const matchedPlans = [];
      const accountedCodes = new Set();

      for (const p of (planRows || [])) {
        const code = p.sku_code;
        accountedCodes.add(code);
        const actual = actualProduced.get(code) || actualProduced.get(`${code}-2`) || null;
        if (actual) accountedCodes.add(actual.code);

        const plannedQty = Number(p.planned_qty || 0);
        const actualProducedKg = actual ? actual.produced_kg : 0;
        const actualPails = actual ? (actual.pails || (actualProducedKg > 0 ? Math.round(actualProducedKg / 5) : 0)) : 0;

        let achievementStatus = "NOT_STARTED";
        let achievementPct = 0;
        if (actualProducedKg > 0 || actualPails > 0) {
          achievementStatus = "PRODUCED";
          achievementPct = plannedQty > 0 ? Number(((actualPails > 0 ? actualPails : actualProducedKg) / plannedQty * 100).toFixed(1)) : 100;
        }

        matchedPlans.push({
          plan_id: p.plan_id,
          master_plan_no: p.master_plan_no,
          sku_code: code,
          sku_name: p.sku_name,
          category_name: p.category_name,
          shift_name: p.shift_name || "กะ 1",
          schedule_section: p.schedule_section_name || "-",
          planned_qty: plannedQty,
          planned_unit: p.unit || "batch",
          actual_produced_kg: actualProducedKg,
          actual_pails_or_boxes: actualPails,
          status: achievementStatus,
          status_summary: actualProducedKg > 0
            ? `เป้าหมาย ${plannedQty} ${p.unit || "batch"} ➔ ผลิตจริงได้ ${actualPails > 0 ? `${actualPails.toLocaleString()} ปี๊บ (` : ""}${actualProducedKg.toLocaleString()} กก.${actualPails > 0 ? ")" : ""}`
            : `เป้าหมาย ${plannedQty} ${p.unit || "batch"} ➔ ยังไม่มียอดผลิตในระบบ`,
        });
      }

      // Unplanned Actual Outputs (ยอดที่ผลิตได้แต่ไม่ได้ระบุในแผนของวันนั้น)
      const unplannedOutputs = [];
      for (const [code, act] of actualProduced.entries()) {
        if (!accountedCodes.has(code) && !accountedCodes.has(code.replace(/-2$/, ""))) {
          unplannedOutputs.push({
            sku_code: code,
            sku_name: act.name,
            actual_produced_kg: act.produced_kg,
            actual_pails_or_boxes: act.pails,
            note: "ผลผลิตที่บันทึกเข้าระบบนอกเหนือจากรายการที่ระบุในแผน",
          });
        }
      }

      return {
        success: true,
        reportDate: reqDate,
        totalPlannedItems: planRows?.length || 0,
        plannedItems: matchedPlans,
        unplannedOutputs,
        advice: matchedPlans.length > 0
          ? `พบแผนการผลิต ${matchedPlans.length} รายการสำหรับวันที่ ${reqDate}`
          : `ไม่พบแผนการผลิตที่ระบุวันที่ ${reqDate} ในระบบ (แต่พบยอดผลิตจริง ${actualProduced.size} รายการ)`,
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `เปรียบเทียบแผนการผลิตล้มเหลว: ${err.message}` };
    }
  }

  // 11. Material Sufficiency & Shortage Check
  if (name === "check_material_sufficiency_for_production") {
    const hasSufficiencyAccess =
      isAdmin ||
      permissionSet.has("production-line-planning-view") ||
      isProductionSupervisorOrManager(userContext);

    if (!hasSufficiencyAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์เข้าถึงระบบพยากรณ์ความพอเพียงของสต็อก (สงวนสิทธิ์เฉพาะฝ่ายวางแผน, หัวหน้าแผนก หรือ Admin)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      const productCode = String(args?.productCode || "").trim().toUpperCase();
      const targetQty = Number(args?.targetQuantity || 0);
      const targetUnit = String(args?.targetUnit || "ปี๊บ").trim();

      if (!productCode || targetQty <= 0) {
        return { success: false, error: "INVALID_ARGS", message: "กรุณาระบุรหัสสินค้าและจำนวนที่ต้องการผลิตที่ถูกต้อง (> 0)" };
      }

      // 1. Find BOM
      const { data: boms } = await adminClient
        .from("production_boms")
        .select("id, sku_code, status")
        .ilike("sku_code", `%${productCode}%`)
        .limit(3);

      const matchedBom = boms?.find((b) => b.sku_code.toUpperCase() === productCode) || boms?.[0];
      if (!matchedBom) {
        return {
          success: true,
          foundBom: false,
          productCode,
          message: `ไม่พบโครงสร้างสูตร BOM สำหรับรหัสสินค้า '${productCode}' ในระบบ`,
        };
      }

      // 2. Find latest approved BOM version
      const { data: versions } = await adminClient
        .from("production_bom_versions")
        .select("id, version_no, formula_code, formula_name, base_batch, base_output_boxes, status")
        .eq("bom_id", matchedBom.id)
        .order("version_no", { ascending: false })
        .limit(1);

      const latestVersion = versions?.[0];
      if (!latestVersion) {
        return {
          success: true,
          foundBom: true,
          productCode,
          message: `สูตร BOM ของ '${productCode}' ยังไม่มีเวอร์ชันที่อนุมัติใช้งาน`,
        };
      }

      // 3. Fetch BOM items
      const { data: bomItems } = await adminClient
        .from("production_bom_items")
        .select("material_sku_code, material_goods_code, qty, uom_name, notes")
        .eq("version_id", latestVersion.id);

      const baseOutput = Number(latestVersion.base_output_boxes || 200);
      const batchMultiplier = targetQty / baseOutput;

      // 4. Check inventory balances for all BOM items
      const { data: stockBalances } = await adminClient
        .from("production_stock_balances_v")
        .select("product_code, product_name_snapshot, current_weight_kg, current_quantity");

      const stockMap = new Map();
      for (const sb of (stockBalances || [])) {
        const c = String(sb.product_code || "").toUpperCase();
        if (!stockMap.has(c)) stockMap.set(c, { weight: 0, qty: 0, name: sb.product_name_snapshot || c });
        stockMap.get(c).weight += Number(sb.current_weight_kg || 0);
        stockMap.get(c).qty += Number(sb.current_quantity || 0);
      }

      const requirements = [];
      let canProduceFull = true;
      let bottleneckMaterial = null;
      let minFeasibleQty = targetQty;

      for (const item of (bomItems || [])) {
        const mCode = item.material_sku_code.toUpperCase();
        const mName = SYSTEM_TERMINOLOGY[mCode] || stockMap.get(mCode)?.name || mCode;
        const isShell = mCode.startsWith("WKB-");

        let requiredQty = 0;
        let unit = item.uom_name || "หน่วย";
        if (isShell) {
          requiredQty = Number((targetQty * 5).toFixed(3));
          unit = "กก.";
        } else {
          requiredQty = Number((item.qty * batchMultiplier).toFixed(3));
        }

        const stockInfo = stockMap.get(mCode) || { weight: 0, qty: 0 };
        const availableStock = isShell || unit.toLowerCase() === "kg" || unit.includes("กก")
          ? Number(stockInfo.weight.toFixed(3))
          : stockInfo.qty;

        const isSufficient = availableStock >= requiredQty;
        const shortfall = Math.max(0, Number((requiredQty - availableStock).toFixed(3)));
        const balanceAfter = Number((availableStock - requiredQty).toFixed(3));

        if (!isSufficient) {
          canProduceFull = false;
          const feasibleForThis = requiredQty > 0 ? Math.floor((availableStock / requiredQty) * targetQty) : 0;
          if (feasibleForThis < minFeasibleQty) {
            minFeasibleQty = feasibleForThis;
            bottleneckMaterial = mName;
          }
        }

        requirements.push({
          material_code: mCode,
          material_name: mName,
          required_qty: requiredQty,
          available_stock: availableStock,
          balance_after: balanceAfter,
          unit,
          is_sufficient: isSufficient,
          shortfall,
          status: isSufficient ? "SUFFICIENT" : "SHORTAGE",
        });
      }

      return {
        success: true,
        productCode: matchedBom.sku_code,
        productName: SYSTEM_TERMINOLOGY[matchedBom.sku_code] || matchedBom.sku_code,
        targetQuantity: targetQty,
        targetUnit,
        canProduceFull,
        maxFeasibleQuantity: canProduceFull ? targetQty : minFeasibleQty,
        bottleneckMaterial,
        materials: requirements,
        actionableAdvice: canProduceFull
          ? `สต็อกวัตถุดิบและแผ่นเปลือกมีเพียงพอสำหรับผลิต ${targetQty.toLocaleString()} ${targetUnit} ทั้งหมด`
          : `สต็อกไม่เพียงพอสำหรับเป้าหมาย ${targetQty.toLocaleString()} ${targetUnit} (สามารถผลิตได้สูงสุดประมาณ ${minFeasibleQty.toLocaleString()} ${targetUnit} เนื่องจากติดปัญหาขาด '${bottleneckMaterial}') แนะนำให้แจ้งเตาอบหรือฝ่ายจัดซื้อเตรียมวัตถุดิบล่วงหน้า`,
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `ตรวจสอบสต็อกพอผลิตล้มเหลว: ${err.message}` };
    }
  }

  // 12. Smart Audit & Anomaly Detection
  if (name === "detect_production_anomalies") {
    const hasAuditAccess =
      isAdmin ||
      roleSet.has("acc") ||
      roleSet.has("hr") ||
      isProductionSupervisorOrManager(userContext);

    if (!hasAuditAccess) {
      return {
        success: false,
        error: "ACCESS_DENIED",
        message: "คุณไม่มีสิทธิ์เข้าถึงระบบตรวจสอบความผิดปกติและทุจริตหน้างาน (สงวนสิทธิ์เฉพาะหัวหน้าแผนก, HR, บัญชี หรือ Admin)",
      };
    }

    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      if (!adminClient) {
        return { success: false, error: "QUERY_FAILED", message: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" };
      }

      let reqDate = String(args?.date || "").trim();
      const now = new Date();
      const bkkNow = new Date(now.getTime() + 7 * 3600000);
      const todayStr = bkkNow.toISOString().slice(0, 10);
      const yDate = new Date(bkkNow.getTime() - 86400000);
      const yesterdayStr = yDate.toISOString().slice(0, 10);

      if (!reqDate || reqDate.toLowerCase() === "today" || reqDate.includes("วันนี้")) {
        reqDate = todayStr;
      } else if (reqDate.toLowerCase() === "yesterday" || reqDate.includes("เมื่อวาน")) {
        reqDate = yesterdayStr;
      }

      // 1. Fetch piece-rate logs
      const { data: logs } = await adminClient
        .from("production_piece_rate_logs")
        .select("id, doc_no, employee_code, employee_name_snapshot, actual_weighed_at, product_code_snapshot, product_name_snapshot, weight_kg_snapshot, input_value, normalized_kg_amount_snapshot, input_mode_snapshot")
        .gte("actual_weighed_at", `${reqDate}T00:00:00+07:00`)
        .lte("actual_weighed_at", `${reqDate}T23:59:59.999+07:00`)
        .order("actual_weighed_at", { ascending: true });

      // 2. Fetch attendance scans for ghost worker check
      const { data: attendance } = await adminClient
        .from("attendance_scan_events")
        .select("employee_code, employee_name_snapshot, status")
        .eq("scan_business_date", reqDate);

      const anomalies = [];
      const sortedLogs = logs || [];

      // Check A: Rapid Double-Scan (< 25s for same employee)
      for (let i = 0; i < sortedLogs.length - 1; i++) {
        const a = sortedLogs[i];
        const b = sortedLogs[i + 1];
        if (a.employee_code && a.employee_code === b.employee_code) {
          const diffSec = Math.abs(new Date(b.actual_weighed_at) - new Date(a.actual_weighed_at)) / 1000;
          if (diffSec < 25) {
            anomalies.push({
              type: "RAPID_DOUBLE_SCAN",
              severity: "WARNING",
              employeeCode: a.employee_code,
              employeeName: a.employee_name_snapshot,
              time: new Date(b.actual_weighed_at).toISOString().slice(11, 19),
              details: `พบการสแกนคิดค่าแรงซ้ำซ้อนภายใน ${diffSec.toFixed(1)} วินาที (เอกสาร ${a.doc_no} และ ${b.doc_no})`,
            });
          }
        }
      }

      // Check B: Ghost Worker (Logged piece rate without HR attendance scan)
      const clockedSet = new Set((attendance || []).map((at) => at.employee_code));
      const seenGhost = new Set();
      for (const l of sortedLogs) {
        if (l.employee_code && !clockedSet.has(l.employee_code) && !seenGhost.has(l.employee_code)) {
          seenGhost.add(l.employee_code);
          anomalies.push({
            type: "GHOST_WORKER_NO_ATTENDANCE",
            severity: "CRITICAL",
            employeeCode: l.employee_code,
            employeeName: l.employee_name_snapshot,
            details: `พนักงาน '${l.employee_code}' มีรายการบันทึกคิดค่าแรง (${l.product_name_snapshot || l.product_code_snapshot}) แต่ไม่พบประวัติสแกนเวลาเข้างานในระบบ HR วันที่ ${reqDate}`,
          });
        }
      }

      // Check C: Weight & Pail Count Out of Bounds
      for (const l of sortedLogs) {
        const w = Number(l.weight_kg_snapshot || l.normalized_kg_amount_snapshot || 0);
        const pails = Number(l.input_value || 0);
        if (w <= 0 && pails <= 0) {
          anomalies.push({
            type: "ZERO_WEIGHT_ENTRY",
            severity: "WARNING",
            employeeCode: l.employee_code,
            docNo: l.doc_no,
            details: `เอกสาร ${l.doc_no} บันทึกน้ำหนักและจำนวนเป็น 0`,
          });
        } else if (pails > 300) {
          anomalies.push({
            type: "EXCESSIVE_PAIL_COUNT",
            severity: "WARNING",
            employeeCode: l.employee_code,
            docNo: l.doc_no,
            details: `เอกสาร ${l.doc_no} บันทึกจำนวนปี๊บสูงผิดปกติ (${pails} ปี๊บในการสแกนครั้งเดียว)`,
          });
        }
      }

      return {
        success: true,
        reportDate: reqDate,
        totalLogsAudited: sortedLogs.length,
        totalAttendanceAudited: attendance?.length || 0,
        anomalyCount: anomalies.length,
        hasAnomalies: anomalies.length > 0,
        anomalies,
        summaryText: anomalies.length === 0
          ? `การตรวจสอบความผิดปกติประจำวันที่ ${reqDate}: ข้อมูลสะอาดเรียบร้อย 100% (ตรวจรายการชั่ง ${sortedLogs.length} รายการ และการเข้างาน ${attendance?.length || 0} รายการ ไม่พบการสแกนเบิ้ล หรือ Ghost Worker)`
          : `พบข้อสังเกตความผิดปกติ ${anomalies.length} จุดประจำวันที่ ${reqDate} กรุณาตรวจสอบรายละเอียดตามเอกสารที่ระบุ`,
      };
    } catch (err) {
      return { success: false, error: "QUERY_FAILED", message: `ตรวจจับความผิดปกติล้มเหลว: ${err.message}` };
    }
  }

  // 13. Barcode & Hardware Diagnostics
  if (name === "diagnose_hardware_or_barcode") {
    const rawQuery = String(args?.query || "").trim();
    if (!rawQuery) {
      return { success: false, error: "MISSING_QUERY", message: "กรุณาระบุรหัสบาร์โค้ดหรืออาการอุปกรณ์ที่ต้องการตรวจสอบ" };
    }

    const qLower = rawQuery.toLowerCase();

    // Hardware issue detection
    if (qLower.includes("ชั่ง") || qLower.includes("scale") || qLower.includes("ค่านิ่ง") || qLower.includes("stable") || qLower.includes("rs232")) {
      return {
        success: true,
        type: "HARDWARE_DIAGNOSTIC",
        device: "RS-232 Industrial Weight Scale (เครื่องชั่งดิจิทัล)",
        issue: "ค่านิ่งไม่ขึ้น / ไม่สามารถกดบันทึกน้ำหนักได้ / น้ำหนักแกว่ง",
        troubleshootingSteps: [
          "1. ตรวจสอบสถานะ STABLE: ไฟค่านิ่ง (STABLE/HOLD) บนจอหัวอ่านเครื่องชั่งต้องติดสว่าง ตัวเลขน้ำหนักต้องนิ่งสนิท จึงจะส่งข้อมูลเข้าคอมพิวเตอร์ได้",
          "2. ตรวจสอบสายเคเบิล RS-232 / USB Serial: ถอดและเสียบสายเชื่อมต่อระหว่างหัวอ่านเครื่องชั่งกับคอมพิวเตอร์ให้แน่นหนา",
          "3. ตรวจสอบพารามิเตอร์ COM Port ใน Device Manager: Baud Rate ต้องตั้งเป็น 9600, Data Bits: 8, Parity: None, Stop Bits: 1, Flow Control: None",
          "4. การเซ็ตศูนย์ (Zero Tare): นำถาดหรือชิ้นงานออกจากแท่นชั่งให้หมด แล้วกดปุ่ม 'ZERO' บนหัวอ่านเพื่อปรับให้เป็น 0.000 กก. ก่อนเริ่มชั่งใหม่",
        ],
        supportLink: "/production-line/weight-scale",
      };
    }

    if (qLower.includes("พิมพ์") || qLower.includes("ปริ้น") || qLower.includes("printer") || qLower.includes("สติกเกอร์") || qLower.includes("สลิป")) {
      return {
        success: true,
        type: "HARDWARE_DIAGNOSTIC",
        device: "Barcode & Receipt Printer (เครื่องพิมพ์สติกเกอร์/สลิป)",
        issue: "พิมพ์ไม่ออก / งานค้างในคิว / สติกเกอร์เลื่อนไม่ตรง Gap",
        troubleshootingSteps: [
          "1. ตรวจสอบ Windows Print Queue: เปิด 'Printers & Scanners' ใน Windows หากมีเอกสารค้าง (Error/Pending) ให้กด 'Cancel all documents'",
          "2. ตรวจสอบ Print Spooler: กดปุ่ม Windows + R พิมพ์ 'services.msc' หาบริการ 'Print Spooler' แล้วคลิกขวาเลือก 'Restart'",
          "3. ตรวจสอบเซ็นเซอร์กระดาษ (Gap Sensor): ปิดเครื่องพิมพ์ กดปุ่ม Feed ค้างไว้แล้วเปิดสวิตช์ เพื่อทำ Auto-Calibration ให้เครื่องจับช่องไฟสติกเกอร์",
          "4. ตรวจสอบการตั้งเป็นเครื่องพิมพ์หลัก (Default Printer): ตรวจสอบชื่อเครื่องพิมพ์ในหน้าการตั้งค่าระบบให้ตรงกับชื่อ Driver ในเครื่อง",
        ],
        supportLink: "/settings",
      };
    }

    if (qLower.includes("สแกน") || qLower.includes("scanner") || qLower.includes("ยิงไม่ติด") || qLower.includes("ไม่ขึ้น")) {
      return {
        success: true,
        type: "HARDWARE_DIAGNOSTIC",
        device: "Barcode Scanner (เครื่องสแกนบาร์โค้ด)",
        issue: "ยิงบาร์โค้ดแล้วไม่ขึ้นข้อมูล / ไม่กด Enter อัตโนมัติ",
        troubleshootingSteps: [
          "1. ตรวจสอบโหมดเชื่อมต่อ: เครื่องสแกนต้องอยู่ในโหมด 'USB HID Keyboard Wedge' ทดสอบโดยเปิดโปรแกรม Notepad แล้วยิงบาร์โค้ด ต้องเห็นตัวเลขปรากฏทันที",
          "2. ตั้งค่าตัวขึ้นบรรทัดใหม่ (Suffix Enter): สแกนเนอร์ต้องยิงบาร์โค้ด 'Add Enter (CR/LF)' จากคู่มือประจำเครื่อง เพื่อให้ระบบบันทึกค่าอัตโนมัติหลังสแกน",
          "3. ทำความสะอาดหน้าเลนส์: เช็ดกระจกหน้าเลนส์เครื่องสแกนให้สะอาด ป้องกันฝุ่นแป้งขนมเกาะบังแสงเลเซอร์",
        ],
        supportLink: "/production-line/attendance/piece-rate-scan",
      };
    }

    // Barcode resolution
    try {
      const adminClient = await resolveSupabaseAdmin(supabaseAdmin);
      const cleanBarcode = rawQuery.replace(/[^A-Za-z0-9._-]/g, "");

      const termMatch = SYSTEM_TERMINOLOGY[cleanBarcode];
      let decodedInfo = null;

      if (adminClient) {
        const { data: logs } = await adminClient
          .from("production_piece_rate_logs")
          .select("doc_no, product_code_snapshot, product_name_snapshot, raw_product_barcode_payload, raw_employee_qr_payload, lot_no, actual_weighed_at")
          .or(`raw_product_barcode_payload.eq.${cleanBarcode},doc_no.eq.${cleanBarcode},product_code_snapshot.eq.${cleanBarcode}`)
          .limit(1);

        if (logs?.[0]) {
          const l = logs[0];
          decodedInfo = {
            barcode: cleanBarcode,
            type: "PIECE_RATE_SLIP_OR_PRODUCT",
            productCode: l.product_code_snapshot,
            productName: l.product_name_snapshot,
            lotNo: l.lot_no,
            docNo: l.doc_no,
            employeeQr: l.raw_employee_qr_payload,
            timestamp: l.actual_weighed_at,
          };
        }
      }

      if (!decodedInfo && termMatch) {
        decodedInfo = {
          barcode: cleanBarcode,
          type: "SYSTEM_PRODUCT_CATALOG",
          productCode: cleanBarcode,
          productName: termMatch,
        };
      }

      return {
        success: true,
        type: "BARCODE_DECODE",
        query: cleanBarcode,
        found: Boolean(decodedInfo),
        details: decodedInfo || { message: `ไม่พบข้อมูลที่ตรงกับบาร์โค้ด '${cleanBarcode}' ในฐานข้อมูลระบบ` },
      };
    } catch {
      return { success: false, error: "LOOKUP_FAILED", message: "ตรวจสอบบาร์โค้ดไม่สำเร็จ" };
    }
  }

  return {
    success: false,
    error: "UNKNOWN_TOOL",
    message: `ไม่รู้จักเครื่องมือ '${name}'`,
  };
}
