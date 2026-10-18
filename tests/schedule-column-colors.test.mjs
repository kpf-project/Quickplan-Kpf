import test from "node:test";
import assert from "node:assert/strict";
import { applyColumnColors, normalizeColumnColors, normalizeColorPair } from "../src/lib/scheduleColumnColors.js";

test("shared color pairs retain legacy colors and isolate header/body including explicit clear", () => {
  const columns = [{ id: "sku", highlight_color: "blue" }, { id: "formula:sku", highlight_color: "amber" }];
  assert.deepEqual(normalizeColorPair({ headerColor: "#abc", bodyColor: null }), { headerColor: "#AABBCC", bodyColor: null });
  assert.throws(() => normalizeColorPair({ headerColor: "url(x)" }));
  assert.throws(() => normalizeColumnColors([]));
  const unchanged = applyColumnColors(columns);
  assert.equal(unchanged[0].header_highlight_color, "blue");
  assert.equal(unchanged[0].highlight_color, "blue");
  const configured = normalizeColumnColors({ sku: { headerColor: "#123456", bodyColor: null }, "formula:sku": { bodyColor: "#fff" } });
  const changed = applyColumnColors(columns, configured);
  assert.equal(changed[0].header_highlight_color, "#123456");
  assert.equal(changed[0].highlight_color, null);
  assert.equal(changed[1].header_highlight_color, "amber");
  assert.equal(changed[1].highlight_color, "#FFFFFF");
  assert.deepEqual(applyColumnColors(changed, configured), changed);
  assert.equal(columns[0].highlight_color, "blue");
});
