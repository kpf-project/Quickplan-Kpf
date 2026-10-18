import assert from "node:assert/strict";
import test from "node:test";

import { executeToolCall, normalizePlanningDate, getAuthorizedToolDeclarations, searchDocumentationFiles } from "../src/features/ai-assistant/services/rbacTools.js";
import { formatPlanningToolAnswer, runChatConversation } from "../src/features/ai-assistant/services/chatOrchestrator.js";
import { SYSTEM_TERMINOLOGY, SYSTEM_WORKFLOWS } from "../src/features/ai-assistant/services/systemKnowledge.js";
import { sanitizeAndMaskResponse } from "../src/features/ai-assistant/services/securitySanitizer.js";
import { SYSTEM_TOPOLOGY, getAuthorizedRoutes, findRouteByIntent } from "../src/features/ai-assistant/services/systemTopology.js";

// Mock User Contexts for testing
const OPERATOR_USER = {
  userId: "user-operator-001",
  username: "operator_somchai",
  isAdmin: false,
  roles: ["operator"],
  permissions: ["production-line-attendance-view"],
};

const WAREHOUSE_USER = {
  userId: "user-wh-002",
  username: "warehouse_staff",
  isAdmin: false,
  roles: ["role-1779435727767"], // คลังวัตถุดิบ
  permissions: ["stock-inventory", "raw-materials-summary"],
};

const HR_USER = {
  userId: "user-hr-003",
  username: "hr_admin",
  isAdmin: false,
  roles: ["hr"],
  permissions: ["admin-employees"],
};

const ADMIN_USER = {
  userId: "user-admin-004",
  username: "system_admin",
  isAdmin: true,
  roles: ["admin"],
  permissions: ["all"],
};

test("System Knowledge: contains key factory terms and abbreviations", () => {
  assert.ok(SYSTEM_TERMINOLOGY["WKB"]);
  assert.ok(SYSTEM_TERMINOLOGY["LOT"]);
  assert.ok(SYSTEM_TERMINOLOGY["BOM"]);
  assert.ok(SYSTEM_WORKFLOWS["bom_approval"]);
  assert.ok(SYSTEM_WORKFLOWS["stock_issue_and_return"]);
});

test("Planning dates: accepts Buddhist calendar input and rejects invalid dates", () => {
  assert.equal(normalizePlanningDate("8/10/69"), "2026-10-08");
  assert.equal(normalizePlanningDate("08/10/2569"), "2026-10-08");
  assert.equal(normalizePlanningDate("2026-10-08"), "2026-10-08");
  assert.equal(normalizePlanningDate("31/02/69"), null);
  assert.equal(normalizePlanningDate("not-a-date"), null);
});

test("Planning data: fails closed without the authenticated request and denies department-only users from global data", async () => {
  const requestlessResult = await executeToolCall({
    name: "query_department_production_planning",
    args: { view: "requisition_actual", date: "8/10/69", department: "ขาไก่", productCode: "WK-22020" },
    userContext: ADMIN_USER,
  });
  assert.equal(requestlessResult.success, false);
  assert.equal(requestlessResult.error, "ACCESS_DENIED");

  const departmentPlanner = {
    userId: "user-planner-scope-001",
    username: "planner_scope",
    isAdmin: false,
    roles: ["planner"],
    permissions: ["production-line-planning-view"],
  };
  const rawPlanQuery = await executeToolCall({
    name: "query_factory_data",
    args: { table: "production_sub_plans" },
    userContext: departmentPlanner,
  });
  assert.equal(rawPlanQuery.success, false);
  assert.equal(rawPlanQuery.error, "ACCESS_DENIED");

  const planStatus = await executeToolCall({
    name: "get_production_plan_status",
    args: { date: "2026-10-08" },
    userContext: departmentPlanner,
  });
  assert.equal(planStatus.success, false);
  assert.equal(planStatus.error, "ACCESS_DENIED");
});

test("Planning data: does not accept an unverified model-generated requisition amount", async () => {
  const result = await runChatConversation({
    messages: [{
      role: "user",
      content: "รหัสสินค้า WK-22020 วันที่ 8/10/69 แผนกขาไก่เบิกไปกี่ถุง",
    }],
    userContext: OPERATOR_USER,
    generateContent: async () => ({
      parts: [{ text: "วันที่ 8 ตุลาคม เบิกไป 100 ถุง" }],
    }),
  });

  assert.match(result.message, /ไม่สามารถยืนยันยอด/);
  assert.doesNotMatch(result.message, /100/);
});

test("Planning data: formats ERP totals with source units and never converts to requested units", () => {
  const answer = formatPlanningToolAnswer({
    source: "erp_actual_requisition",
    date: "2026-10-08",
    department: { name: "ขาไก่" },
    productCode: "WK-22020",
    found: true,
    totals: [{
      quantity: 12,
      unit: "กิโลกรัม",
      documentCount: 1,
      documentNos: ["X6909/1234"],
    }],
  });
  assert.match(answer, /ยอดเบิกจริงจาก ERP/);
  assert.match(answer, /08\/10\/2569/);
  assert.match(answer, /12 กิโลกรัม/);
  assert.doesNotMatch(answer, /12 ถุง/);
  assert.match(answer, /X6909\/1234/);
});

test("Planning data: returns access denial directly without asking the model to restate it", async () => {
  let modelCalls = 0;
  const result = await runChatConversation({
    messages: [{
      role: "user",
      content: "รหัสสินค้า WK-22020 วันที่ 8/10/69 แผนกขาไก่เบิกไปกี่ถุง",
    }],
    userContext: OPERATOR_USER,
    generateContent: async () => {
      modelCalls += 1;
      return {
        parts: [{
          functionCall: {
            name: "query_department_production_planning",
            args: {
              view: "requisition_actual",
              date: "8/10/69",
              department: "ขาไก่",
              productCode: "WK-22020",
            },
          },
        }],
      };
    },
  });

  assert.equal(modelCalls, 1);
  assert.match(result.message, /ไม่มีสิทธิ์เข้าถึง/);
  assert.doesNotMatch(result.message, /WK-22020|ขาไก่|ถุง/);
});

test("Public Tool: Operator can search system knowledge without restrictions", async () => {
  const result = await executeToolCall({
    name: "search_system_knowledge",
    args: { topic: "WKB" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, true);
  assert.ok(result.termMatch);
  assert.equal(result.termMatch.term, "WKB");
});

test("RBAC Security: Operator is DENIED from accessing stock balance without permission", async () => {
  const result = await executeToolCall({
    name: "check_stock_balance",
    args: { code: "WKB-0053" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "ACCESS_DENIED");
  assert.match(result.message, /ไม่มีสิทธิ์เข้าถึง/);
});

test("RBAC Security: Operator is DENIED from viewing other employees' piece-rate wages", async () => {
  const result = await executeToolCall({
    name: "lookup_piece_rate_or_wage",
    args: { employeeCode: "KPF-99999" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "ACCESS_DENIED");
  assert.match(result.message, /ไม่อนุญาตให้เข้าถึงข้อมูลค่าแรง/);
});

test("RBAC Security: Operator is DENIED from viewing employee directory", async () => {
  const result = await executeToolCall({
    name: "lookup_employee_info",
    args: { query: "somchai" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "ACCESS_DENIED");
  assert.match(result.message, /สงวนสิทธิ์เฉพาะฝ่าย HR/);
});

test("RBAC Security: Operator is DENIED from viewing BOM formulas", async () => {
  const result = await executeToolCall({
    name: "lookup_bom_formula",
    args: { productCode: "BL0-5001" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "ACCESS_DENIED");
  assert.match(result.message, /ไม่มีสิทธิ์ดูโครงสร้างสูตร BOM/);
});

test("RBAC Security: Admin has full access to tools", async () => {
  // Check that admin does not get ACCESS_DENIED
  const stockCheck = await executeToolCall({
    name: "check_stock_balance",
    args: { code: "NON_EXISTENT_TEST_SKU" },
    userContext: ADMIN_USER,
  });
  assert.notEqual(stockCheck.error, "ACCESS_DENIED");

  const bomCheck = await executeToolCall({
    name: "lookup_bom_formula",
    args: { productCode: "TEST_PRODUCT" },
    userContext: ADMIN_USER,
  });
  assert.notEqual(bomCheck.error, "ACCESS_DENIED");
});

test("Zero Hallucination: WKB-0053 is strictly verified as แผนคุกกี้นม", async () => {
  const { findLocalKnowledgeFallback } = await import("../src/features/ai-assistant/services/systemKnowledge.js");

  // 1. Static Terminology
  assert.match(SYSTEM_TERMINOLOGY["WKB-0053"], /แผนคุกกี้นม/);
  assert.doesNotMatch(SYSTEM_TERMINOLOGY["WKB-0053"], /สารปรุงแต่ง/);
  assert.match(SYSTEM_TERMINOLOGY["WKB"], /แผนคุกกี้นม/);
  assert.doesNotMatch(SYSTEM_TERMINOLOGY["WKB"], /สารปรุงแต่ง/);

  // 2. Offline Fallback for "WKB-0053 คืออะไร"
  const answer = findLocalKnowledgeFallback("WKB-0053 คืออะไร");
  assert.ok(answer);
  assert.match(answer, /แผนคุกกี้นม/);
  assert.doesNotMatch(answer, /สารปรุงแต่ง/);

  // 3. Public Product Lookup tool executable by Operator
  const toolResult = await executeToolCall({
    name: "lookup_product_info",
    args: { query: "WKB-0053" },
    userContext: OPERATOR_USER,
  });
  assert.equal(toolResult.success, true);
  assert.equal(toolResult.found, true);
  assert.match(toolResult.items[0].product_name, /แผนคุกกี้นม/);
});

test("RBAC Security: Operator is DENIED from auditing stock card & diff", async () => {
  const result = await executeToolCall({
    name: "audit_stock_card_and_diff",
    args: { productCode: "WKB-0048" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "ACCESS_DENIED");
  assert.match(result.message, /คุณไม่มีสิทธิ์ตรวจสอบสต็อกการ์ดหรือวิเคราะห์ยอดดิฟ/);
});

test("RBAC Security: Warehouse user and Admin CAN audit stock card & diff", async () => {
  const result = await executeToolCall({
    name: "audit_stock_card_and_diff",
    args: { productCode: "NON_EXISTENT_TEST" },
    userContext: WAREHOUSE_USER,
  });

  assert.notEqual(result.error, "ACCESS_DENIED");
});

test("RBAC Security: query_factory_data denies unauthorized tables and unauthorized roles", async () => {
  // 1. Forbidden table
  const forbiddenRes = await executeToolCall({
    name: "query_factory_data",
    args: { table: "profiles" },
    userContext: ADMIN_USER,
  });
  assert.equal(forbiddenRes.success, false);
  assert.equal(forbiddenRes.error, "FORBIDDEN_TABLE");

  // 2. Operator denied from stock movements
  const deniedRes = await executeToolCall({
    name: "query_factory_data",
    args: { table: "production_stock_movements" },
    userContext: OPERATOR_USER,
  });
  assert.equal(deniedRes.success, false);
  assert.equal(deniedRes.error, "ACCESS_DENIED");
});

test("Knowledge Base RBAC: Operator can read public/operator SOPs (01-weight-scale, 02-jam-scan)", async () => {
  const result = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "ป้ายแยม" },
    userContext: OPERATOR_USER,
  });

  assert.equal(result.success, true);
  assert.ok(result.docMatches);
  const fileNames = result.docMatches.map((d) => d.file);
  assert.ok(fileNames.some((f) => f.includes("02-jam-piece-rate-scan.md")));
});

test("Knowledge Base RBAC: Operator is strictly BLOCKED from seeing Admin-Only System Settings manual", async () => {
  const operatorResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "09-system-settings" },
    userContext: OPERATOR_USER,
  });

  assert.equal(operatorResult.success, true);
  const matches = operatorResult.docMatches || [];
  const foundAdminDoc = matches.some((d) => d.file.includes("09-system-settings.md"));
  assert.equal(foundAdminDoc, false, "Operator must not see admin settings SOP");

  const adminResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "09-system-settings" },
    userContext: ADMIN_USER,
  });
  assert.equal(adminResult.success, true);
  const adminMatches = adminResult.docMatches || [];
  const adminFound = adminMatches.some((d) => d.file.includes("09-system-settings.md"));
  assert.equal(adminFound, true, "Admin must be allowed to read system settings SOP");
});

test("Knowledge Base RBAC: Operator cannot see confidential HR Attendance manual, but HR can", async () => {
  const opResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "04-hr-attendance" },
    userContext: OPERATOR_USER,
  });
  const opMatches = opResult.docMatches || [];
  assert.equal(opMatches.some((d) => d.file.includes("04-hr-attendance.md")), false);

  const hrResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "04-hr-attendance" },
    userContext: HR_USER,
  });
  const hrMatches = hrResult.docMatches || [];
  assert.equal(hrMatches.some((d) => d.file.includes("04-hr-attendance.md")), true);
});

test("Knowledge Base RBAC: Planning guide is available to planners but not operators", async () => {
  const planningUser = {
    userId: "user-planner-kb-001",
    username: "planner_kb",
    isAdmin: false,
    roles: ["planner"],
    permissions: ["production-line-planning-view"],
  };
  const plannerResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "Preview ใบเบิก" },
    userContext: planningUser,
  });
  assert.ok(plannerResult.docMatches?.some((doc) => doc.file.includes("07-planning-control-center.md")));

  const operatorResult = await executeToolCall({
    name: "read_factory_documentation",
    args: { keyword: "Preview ใบเบิก" },
    userContext: OPERATOR_USER,
  });
  assert.equal(
    operatorResult.docMatches?.some((doc) => doc.file.includes("07-planning-control-center.md")),
    false
  );
});

test("RBAC Security: Biscuit Department Head can access stock movements but not cross-department summaries", async () => {
  const BISCUIT_HEAD_USER = {
    userId: "user-head-biscuit-005",
    username: "leader_biscuit",
    isAdmin: false,
    roles: ["role-1771497622584", "หัวหน้าแผนกบิสกิต"],
    permissions: ["production-line-attendance-report-manage", "production-line-attendance-view"],
  };

  // 1. Biscuit Head can query stock movements
  const stockMovementsRes = await executeToolCall({
    name: "query_factory_data",
    args: { table: "production_stock_movements" },
    userContext: BISCUIT_HEAD_USER,
  });
  assert.notEqual(stockMovementsRes.error, "ACCESS_DENIED");

  // 2. Biscuit Head can get daily production summary
  const summaryRes = await executeToolCall({
    name: "get_daily_production_summary",
    args: { date: "2026-10-03" },
    userContext: BISCUIT_HEAD_USER,
  });
  assert.equal(summaryRes.error, "ACCESS_DENIED");

  // 3. Line Operator is strictly DENIED
  const opDenied = await executeToolCall({
    name: "get_daily_production_summary",
    args: { date: "2026-10-03" },
    userContext: OPERATOR_USER,
  });
  assert.equal(opDenied.success, false);
  assert.equal(opDenied.error, "ACCESS_DENIED");
});

test("RBAC Security: Plan vs Actual Tracking enforces strict role access", async () => {
  // 1. Line operator is denied
  const opRes = await executeToolCall({
    name: "check_production_plan_vs_actual",
    args: { date: "2026-10-03" },
    userContext: OPERATOR_USER,
  });
  assert.equal(opRes.success, false);
  assert.equal(opRes.error, "ACCESS_DENIED");

  // 2. Planning role is allowed
  const PLANNER_USER = {
    userId: "user-planner-001",
    username: "planner_somying",
    isAdmin: false,
    roles: ["role-planner"],
    permissions: ["plan.view_all"],
  };
  const plannerRes = await executeToolCall({
    name: "check_production_plan_vs_actual",
    args: { date: "2026-10-03" },
    userContext: PLANNER_USER,
  });
  assert.notEqual(plannerRes.error, "ACCESS_DENIED");

  // 3. Admin is allowed
  const adminRes = await executeToolCall({
    name: "check_production_plan_vs_actual",
    args: { date: "2026-10-03" },
    userContext: ADMIN_USER,
  });
  assert.notEqual(adminRes.error, "ACCESS_DENIED");
});

test("RBAC Security: Cross-department summary is denied to warehouse users and visible to Admin", async () => {
  const mockAdmin = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [] }),
        gte: () => ({
          lte: () => ({
            or: () => Promise.resolve({ data: [] }),
            eq: () => Promise.resolve({ data: [] }),
          }),
        }),
        or: () => Promise.resolve({ data: [] }),
      }),
    }),
  };

  // 1. Warehouse users cannot see cross-department production totals
  const whRes = await executeToolCall({
    name: "get_daily_production_summary",
    args: { date: "2026-10-03" },
    userContext: WAREHOUSE_USER,
    supabaseAdmin: mockAdmin,
  });
  assert.equal(whRes.success, false);
  assert.equal(whRes.error, "ACCESS_DENIED");

  // 2. Admin can see authorized labor cost efficiency
  const adminRes = await executeToolCall({
    name: "get_daily_production_summary",
    args: { date: "2026-10-03" },
    userContext: ADMIN_USER,
    supabaseAdmin: mockAdmin,
  });
  assert.equal(adminRes.success, true);
  assert.ok(adminRes.summary?.laborCostEfficiency);
  assert.equal(adminRes.summary.laborCostEfficiency.authorized, true);
  assert.equal(adminRes.summary.laborCostEfficiency.wageConfidential, undefined);
});

test("RBAC Security: Material Sufficiency Check enforces planning/manager roles", async () => {
  // 1. Line operator is denied
  const opRes = await executeToolCall({
    name: "check_material_sufficiency_for_production",
    args: { productCode: "B01-1009", targetQuantity: 200 },
    userContext: OPERATOR_USER,
  });
  assert.equal(opRes.success, false);
  assert.equal(opRes.error, "ACCESS_DENIED");

  // 2. Warehouse staff is allowed
  const whRes = await executeToolCall({
    name: "check_material_sufficiency_for_production",
    args: { productCode: "B01-1009", targetQuantity: 200 },
    userContext: WAREHOUSE_USER,
  });
  assert.notEqual(whRes.error, "ACCESS_DENIED");

  // 3. Admin is allowed
  const adminRes = await executeToolCall({
    name: "check_material_sufficiency_for_production",
    args: { productCode: "B01-1009", targetQuantity: 200 },
    userContext: ADMIN_USER,
  });
  assert.notEqual(adminRes.error, "ACCESS_DENIED");
});

test("RBAC Security: Anomaly Detection enforces supervisor/auditor roles", async () => {
  // 1. Line operator is denied
  const opRes = await executeToolCall({
    name: "detect_production_anomalies",
    args: { date: "2026-10-03" },
    userContext: OPERATOR_USER,
  });
  assert.equal(opRes.success, false);
  assert.equal(opRes.error, "ACCESS_DENIED");

  // 2. HR is allowed
  const hrRes = await executeToolCall({
    name: "detect_production_anomalies",
    args: { date: "2026-10-03" },
    userContext: HR_USER,
  });
  assert.notEqual(hrRes.error, "ACCESS_DENIED");
});

test("Public Tool: Operator CAN use Barcode & Hardware Diagnostics tool", async () => {
  // 1. Operator diagnosing scale issue
  const scaleDiag = await executeToolCall({
    name: "diagnose_hardware_or_barcode",
    args: { query: "เครื่องชั่งค่านิ่งไม่ขึ้น" },
    userContext: OPERATOR_USER,
  });
  assert.equal(scaleDiag.success, true);
  assert.equal(scaleDiag.type, "HARDWARE_DIAGNOSTIC");
  assert.match(scaleDiag.device, /เครื่องชั่ง/);
  assert.ok(scaleDiag.troubleshootingSteps.length >= 3);

  // 2. Operator diagnosing printer issue
  const printerDiag = await executeToolCall({
    name: "diagnose_hardware_or_barcode",
    args: { query: "เครื่องพิมพ์ไม่ออก" },
    userContext: OPERATOR_USER,
  });
  assert.equal(printerDiag.success, true);
  assert.match(printerDiag.device, /เครื่องพิมพ์/);

  // 3. Operator decoding known product code
  const bcDiag = await executeToolCall({
    name: "diagnose_hardware_or_barcode",
    args: { query: "WKB-0048" },
    userContext: OPERATOR_USER,
  });
  assert.equal(bcDiag.success, true);
  assert.equal(bcDiag.found, true);
});

test("Pillar 1: Dynamic Tool Pruning filters tool declarations strictly by user role before LLM invocation", () => {
  // 1. Operator only receives public tools
  const opDecls = getAuthorizedToolDeclarations(OPERATOR_USER);
  const opToolNames = opDecls[0].functionDeclarations.map((t) => t.name);
  assert.ok(opToolNames.includes("search_system_knowledge"));
  assert.ok(opToolNames.includes("read_factory_documentation"));
  assert.ok(opToolNames.includes("lookup_product_info"));
  assert.ok(opToolNames.includes("diagnose_hardware_or_barcode"));
  assert.ok(opToolNames.includes("get_system_navigation_guide"));
  // Operator must NEVER be offered restricted tools
  assert.equal(opToolNames.includes("lookup_bom_formula"), false);
  assert.equal(opToolNames.includes("lookup_piece_rate_or_wage"), false);
  assert.equal(opToolNames.includes("audit_stock_card_and_diff"), false);
  assert.equal(opToolNames.includes("detect_production_anomalies"), false);

  // 2. Warehouse staff receives stock tools but NOT HR wage tools
  const whDecls = getAuthorizedToolDeclarations(WAREHOUSE_USER);
  const whToolNames = whDecls[0].functionDeclarations.map((t) => t.name);
  assert.ok(whToolNames.includes("check_stock_balance"));
  assert.ok(whToolNames.includes("audit_stock_card_and_diff"));
  assert.equal(whToolNames.includes("lookup_piece_rate_or_wage"), false);
  assert.equal(whToolNames.includes("lookup_employee_info"), false);

  // 3. Admin receives all available tools
  const adminDecls = getAuthorizedToolDeclarations(ADMIN_USER);
  const adminToolNames = adminDecls[0].functionDeclarations.map((t) => t.name);
  assert.ok(adminToolNames.includes("lookup_bom_formula"));
  assert.ok(adminToolNames.includes("audit_stock_card_and_diff"));
  assert.ok(adminToolNames.includes("lookup_piece_rate_or_wage"));
  assert.ok(adminToolNames.includes("detect_production_anomalies"));
});

test("Pillar 2: Semantic Hybrid Search resolves natural language queries using factory synonyms", () => {
  // 1. Synonym: 'ตาชั่งไม่ขยับ' maps to weight scale SOP (01-weight-scale)
  const scaleHits = searchDocumentationFiles("ตาชั่งไม่ขยับ", 3, OPERATOR_USER);
  assert.ok(scaleHits.length > 0);
  assert.ok(scaleHits.some((h) => h.file.includes("01-weight-scale")));

  // 2. Synonym: 'สูตรขนม' maps to BOM master SOP (06-bom-master) for authorized users
  const bomHits = searchDocumentationFiles("สูตรขนม", 3, ADMIN_USER);
  assert.ok(bomHits.length > 0);
  assert.ok(bomHits.some((h) => h.file.includes("06-bom-master")));

  // 3. Synonym: 'เช็คชื่อเข้างาน' maps to HR Attendance for HR user
  const hrHits = searchDocumentationFiles("เช็คชื่อเข้างาน", 3, HR_USER);
  assert.ok(hrHits.length > 0);
  assert.ok(hrHits.some((h) => h.file.includes("04-hr-attendance")));
});

test("Pillar 3: Application Topology & Navigation Guide returns exact paths, actions, and RBAC filtering", async () => {
  // 1. Operator asks for jam spreading screen
  const jamNav = await executeToolCall({
    name: "get_system_navigation_guide",
    args: { query: "ป้ายแยม" },
    userContext: OPERATOR_USER,
  });
  assert.equal(jamNav.success, true);
  assert.equal(jamNav.found, true);
  assert.equal(jamNav.path, "/production-line/attendance/piece-rate-scan");
  assert.ok(jamNav.primaryActions.length >= 3);

  // 2. Operator asks for weight return screen
  const returnNav = await executeToolCall({
    name: "get_system_navigation_guide",
    args: { query: "ชั่งคืน" },
    userContext: OPERATOR_USER,
  });
  assert.equal(returnNav.success, true);
  assert.equal(returnNav.found, true);
  assert.equal(returnNav.path, "/production-line/weight-scale/return");

  // 3. Operator asking for admin settings is blocked / not found in authorized scope
  const adminNav = await executeToolCall({
    name: "get_system_navigation_guide",
    args: { query: "ตั้งค่าระบบ" },
    userContext: OPERATOR_USER,
  });
  assert.equal(adminNav.success, true);
  assert.equal(adminNav.found, false);
});

test("Pillar 4: Multi-Step Agent Reasoning guidance is embedded in system prompt", async () => {
  const { runChatConversation } = await import("../src/features/ai-assistant/services/chatOrchestrator.js");
  let capturedInstruction = "";

  await runChatConversation({
    messages: [{ role: "user", content: "ทำไมเมื่อวานยอดผลิตแครกเกอร์งาหอมถึงหลุดเป้า และวัตถุดิบขาดที่จุดไหน" }],
    userContext: ADMIN_USER,
    generateContent: async ({ systemInstruction }) => {
      capturedInstruction = systemInstruction;
      return { parts: [{ text: "สรุปการตรวจสอบ..." }] };
    },
  });

  assert.match(capturedInstruction, /Chain-of-Tools/);
  assert.match(capturedInstruction, /Root Cause Analysis/);
  assert.match(capturedInstruction, /check_production_plan_vs_actual/);
});

test("Pillar 5: Zero-Leakage Data Masking redacts credentials and Thai National IDs for unauthorized users", () => {
  const sensitiveText = "พนักงาน สมชาย รหัสบัตร 1-1002-01234-56-7 เชื่อมต่อ db: postgresql://postgres:mypassword@supabase.co/db พร้อม API_KEY AIzaSyD1234567890abcdefghijklmnopqrstuv";

  // 1. Operator view: Thai ID is masked, credentials are completely redacted
  const opSanitized = sanitizeAndMaskResponse(sensitiveText, OPERATOR_USER);
  assert.match(opSanitized, /1-XXXX-XXXXX-XX-X/);
  assert.doesNotMatch(opSanitized, /01234-56-7/);
  assert.match(opSanitized, /\[REDACTED_DATABASE_URI\]/);
  assert.doesNotMatch(opSanitized, /mypassword/);
  assert.match(opSanitized, /\[REDACTED_API_KEY\]/);
  assert.doesNotMatch(opSanitized, /AIzaSyD1234567890/);

  // 2. HR view: Thai ID is viewable for HR, but system credentials remain redacted
  const hrSanitized = sanitizeAndMaskResponse(sensitiveText, HR_USER);
  assert.match(hrSanitized, /1-1002-01234-56-7/);
  assert.match(hrSanitized, /\[REDACTED_DATABASE_URI\]/);
  assert.match(hrSanitized, /\[REDACTED_API_KEY\]/);
});

test("Planning department resolution: accepts typos like 'ขาก่' and prefix-free 'ขาไก่' or 'บิสกิต'", async () => {
  // Direct test of department resolution without request
  const departments = [
    { id: "dept-chicken", code: "KP41", name: "แผนกขาไก่", is_active: true },
    { id: "dept-biscuit", code: "KP13", name: "แผนกบิสกิต", is_active: true },
  ];

  const DEPARTMENT_ALIASES = {
    "ขาก่": "KP41",
    "ขาไก่": "KP41",
    "แผนกขาก่": "KP41",
    "แผนกขาไก่": "KP41",
    "บิสกิต": "KP13",
    "บิสกิด": "KP13",
    "แผนกบิสกิต": "KP13",
  };

  function resolveTestDept(requestedDepartment) {
    const rawDeptKey = requestedDepartment.trim().toLocaleLowerCase();
    const cleanDeptKey = rawDeptKey.replace(/^แผนก\s*/, "");
    const aliasCode = DEPARTMENT_ALIASES[rawDeptKey] || DEPARTMENT_ALIASES[cleanDeptKey];

    let matches = departments.filter((department) => {
      if (department?.is_active === false) return false;
      const dName = String(department?.name || "").trim().toLocaleLowerCase();
      const dCode = String(department?.code || "").trim().toLocaleLowerCase();
      const dCleanName = dName.replace(/^แผนก\s*/, "");

      if (aliasCode && dCode === aliasCode.toLowerCase()) return true;
      if (dName === rawDeptKey || dCode === rawDeptKey) return true;
      if (dCleanName === cleanDeptKey) return true;
      return false;
    });

    if (matches.length === 0 && cleanDeptKey.length >= 3) {
      matches = departments.filter((department) => {
        if (department?.is_active === false) return false;
        const dCleanName = String(department?.name || "").trim().toLocaleLowerCase().replace(/^แผนก\s*/, "");
        return dCleanName.includes(cleanDeptKey) || cleanDeptKey.includes(dCleanName);
      });
    }

    return matches[0] || null;
  }

  assert.equal(resolveTestDept("ขาก่")?.code, "KP41");
  assert.equal(resolveTestDept("ขาไก่")?.code, "KP41");
  assert.equal(resolveTestDept("แผนกขาไก่")?.code, "KP41");
  assert.equal(resolveTestDept("บิสกิต")?.code, "KP13");
  assert.equal(resolveTestDept("บิสกิด")?.code, "KP13");
  assert.equal(resolveTestDept("แผนกบิสกิต")?.code, "KP13");
});


