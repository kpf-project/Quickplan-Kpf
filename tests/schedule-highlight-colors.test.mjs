import test from "node:test";
import assert from "node:assert/strict";

test("highlight colors keep legacy values, accept HEX and reject arbitrary CSS", async () => {
  const colors = await import("../src/features/production-planning/services/scheduleHighlightColors.js");
  assert.equal(colors.normalizeHighlightColor("teal"), "teal");
  assert.equal(colors.normalizeHighlightColor("#abc"), "#AABBCC");
  assert.equal(colors.normalizeHighlightColor("#eaf0f7"), "#EAF0F7");
  for (const invalid of ["red", "url(x)", "#12345678", {}, "var(--x)"]) assert.equal(colors.normalizeHighlightColor(invalid), null);
  assert.equal(colors.highlightStyle("#FFFFFF").color, "#111111");
  assert.equal(colors.highlightStyle("#000000").color, "#FFFFFF");
  assert.deepEqual(colors.highlightStyle("teal"), undefined);
  assert.equal(colors.highlightStyle("#EAF0F7").backgroundColor, "#EAF0F7");
});
