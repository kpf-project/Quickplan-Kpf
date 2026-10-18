import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("navy surfaces use a shared blue token without changing text or print colors", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const sidebar = readFileSync("src/components/Sidebar.js", "utf8");
  assert.match(css, /--surface-navy:\s*#10345D/i);
  assert.match(css, /@media print\s*\{\s*:root\s*\{\s*--surface-navy:\s*initial/);
  assert.match(sidebar, /bg-\[var\(--surface-navy,#102C57\)\]/);
  assert.match(sidebar, /text-\[#102C57\]/);
});
