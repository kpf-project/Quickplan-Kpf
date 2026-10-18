import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDateLayout, attachDateLayouts, dateLayoutKey } from "../src/lib/scheduleDateLayout.js";
import { columnColorsKey } from "../src/lib/scheduleColumnColors.js";
test("date formatting settings validate independent colors and retain section isolation", async () => {
  assert.deepEqual(normalizeDateLayout(), { width: 160, headerColor: null, bodyColor: null });
  assert.throws(() => normalizeDateLayout({ width: 0 }));
  assert.throws(() => normalizeDateLayout({ headerColor: "url(x)" }));
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: [{ setting_key: dateLayoutKey("a"), setting_value: { width: 220, headerColor: "#abc", bodyColor: "#fff" } }, { setting_key: columnColorsKey("a"), setting_value: { sku: { headerColor: "#def", bodyColor: "#fff" } } }] }) }) }) };
  const sections = await attachDateLayouts(db, [{ id: "a" }, { id: "b" }]);
  assert.equal(sections[0].date_layout.width, 220);
  assert.equal(sections[0].date_layout.headerColor, "#AABBCC");
  assert.equal(sections[1].date_layout.width, 160);
  assert.equal(sections[0].column_colors.sku.headerColor, "#DDEEFF");
  assert.deepEqual(sections[1].column_colors, {});
});
