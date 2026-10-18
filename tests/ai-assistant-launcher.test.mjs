import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, "../src/components/chat/AiAssistantDrawer.js"),
  "utf8"
);

test("AI assistant uses a compact explicit launcher that does not expand on hover", () => {
  assert.match(source, /aria-label="เปิดผู้ช่วย AI"/);
  assert.match(source, /h-12 w-12/);
  assert.match(source, /onClick=\{\(\) => setIsOpen\(true\)\}/);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave|isHovered/);
  assert.doesNotMatch(source, /kpf_ai_tab_collapsed/);
});
