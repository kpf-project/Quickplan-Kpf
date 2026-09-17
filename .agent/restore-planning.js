const fs = require("fs");
const hp = ".next/dev/static/webpack/_app-pages-browser_src_features_production-planning_components_ProductionPlanningPageClient_js.8f0985969c236f60.hot-update.js";
const out = "src/features/production-planning/components/ProductionPlanningPageClient.js";
const s = fs.readFileSync(hp, "utf8");
const m = s.match(/sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)/);
if (!m) throw new Error("source map not found");
const map = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
let src = map.sourcesContent?.[0];
if (!src) throw new Error("sourcesContent missing");
src = src.replace(/^\uFEFF/, "");
if (!/^\s*[\"']use client[\"'];/.test(src)) {
  src = "\"use client\";\n\n" + src;
}
fs.writeFileSync(out, src, "utf8");
console.log("restored", out, "len", src.length);
