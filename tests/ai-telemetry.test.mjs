import test from "node:test";
import assert from "node:assert/strict";
import { detectQueryOutcome } from "../src/features/ai-assistant/services/aiTelemetryService.js";

test("AI Telemetry: detectQueryOutcome correctly flags tool errors as gaps", () => {
  const result = detectQueryOutcome({
    query: "ขอดูสต็อกหน่อย",
    responseMessage: "ขออภัยครับ เกิดข้อผิดพลาด",
    executedTools: [{ tool: "check_stock_balance", success: false, error: "ACCESS_DENIED" }],
  });

  assert.equal(result.isGap, true);
  assert.equal(result.outcome, "tool_error");
  assert.equal(result.reason, "ACCESS_DENIED");
});

test("AI Telemetry: detectQueryOutcome identifies missing department phrase", () => {
  const result = detectQueryOutcome({
    query: "เมื่อวานแผนกขาก่เบิกอะไร",
    responseMessage: "ไม่พบแผนกตามที่ระบุในระบบครับ กรุณาตรวจสอบชื่อแผนกอีกครั้ง",
    executedTools: [{ tool: "query_department_production_planning", success: false }],
  });

  assert.equal(result.isGap, true);
});

test("AI Telemetry: detectQueryOutcome identifies zero-hallucination guard refusal", () => {
  const result = detectQueryOutcome({
    query: "เบิกไปเท่าไหร่ 8/10/69",
    responseMessage: "ขออภัยครับ ยังไม่สามารถยืนยันยอดแผนหรือยอดเบิกจริงจากข้อมูลระบบได้ จึงไม่ขอเดาตัวเลขครับ",
    executedTools: [],
  });

  assert.equal(result.isGap, true);
  assert.equal(result.outcome, "unanswered");
  assert.equal(result.reason, "ZERO_HALLUCINATION_GUARD_TRIGGERED");
});

test("AI Telemetry: detectQueryOutcome marks normal successful response as not a gap", () => {
  const result = detectQueryOutcome({
    query: "WKB-0053 คืออะไร",
    responseMessage: "WKB-0053 ในระบบ KPF คือ แผนคุกกี้นม (Milk Cookie Sheet) ครับ",
    executedTools: [{ tool: "lookup_product_info", success: true }],
  });

  assert.equal(result.isGap, false);
  assert.equal(result.outcome, "success");
  assert.equal(result.reason, "NORMAL_RESOLUTION");
});
