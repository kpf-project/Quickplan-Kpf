// Isolated browser fixture: real report workspace/drawer; all API traffic stays on localhost.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadBindings } from "next/dist/build/swc/index.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BarChart3, Boxes, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Clock3, Database, Factory, FileText, Fingerprint, LogOut, Package, PanelLeftClose, Settings, Star, Tag, Warehouse } from "lucide-react";

const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const directory = path.join(root, ".codex-tmp", "erp-drawer-fixture");
export async function createErpDrawerFixture() {
  await fs.mkdir(directory, { recursive: true });
  await loadBindings();
  const write = (name, content) => fs.writeFile(path.join(directory, name), content, "utf8");
  let fontFaces = "";
  // Reuse the app's locally bundled Thai font when a build is available.
  for (const name of await fs.readdir(path.join(root, ".next/static/css")).catch(() => [])) {
    const css = await fs.readFile(path.join(root, ".next/static/css", name), "utf8");
    const faces = css.match(/@font-face\{[^}]*font-family:Noto Sans Thai Looped;[^}]*\}/g);
    if (faces) { fontFaces = faces.join("\n"); break; }
  }
  await write("jsx-loader.cjs", `module.exports=function(source){const callback=this.async();require(${JSON.stringify(require.resolve("next/dist/build/swc/index.js"))}).transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:"ecmascript",jsx:true},transform:{react:{runtime:"automatic"}}},module:{type:"es6"}}).then(result=>callback(null,result.code),callback);};`);
  await write("css-loader.cjs", `module.exports=function(source){const names={};const prefix=require('node:path').basename(this.resourcePath).replace(/[^a-z]/gi,'');const css=source.replace(/\\.([a-zA-Z_][\\w-]*)/g,(_,name)=>'.'+(names[name]=prefix+'_'+name));return 'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.appendChild(style);module.exports='+JSON.stringify(names)+';';};`);
  await write("navigation.js", 'const params=new URLSearchParams("report=scale-inbound&dateFrom=2026-10-14&dateTo=2026-10-14"); export function useRouter(){return {push(){},replace(){}}} export function useSearchParams(){return params;}');
  await write("permissions.js", 'export function usePermissions(){return {permissions:[],isAdmin:true,loaded:true};}');
  await write("profile.js", 'export function useUserProfile(){return {username:"apexchelon"};}');
  await write("image.js", 'import React from "react";export default function Image({priority,unoptimized,...props}){return React.createElement("img",props);}');
  await write("entry.js", `import React from "react"; import {createRoot} from "react-dom/client"; import Workspace from ${JSON.stringify(path.join(root, "src/features/production-line/report-center/ProductionReportWorkspace.js").replaceAll("\\", "/"))};
    const rows=[{groupDate:"2026-10-14",productCode:"WKB-0002",productName:"แผ่นแครกเกอร์ปี๊บต้น",lotNo:"1410260002-1",quantity:20,totalNetWeightKg:260.49},{groupDate:"2026-10-14",productCode:"WKB-0002",productName:"แผ่นแครกเกอร์ปี๊บต้น",lotNo:"1410260002-1",quantity:20,totalNetWeightKg:248.26},{groupDate:"2026-10-14",productCode:"WKB-0002",productName:"แผ่นแครกเกอร์ปี๊บต้น",lotNo:"1410260002-1",quantity:20,totalNetWeightKg:252.71},{groupDate:"2026-10-14",productCode:"WKB-0002",productName:"แผ่นแครกเกอร์ปี๊บต้น",lotNo:"1410260002-1",quantity:9,totalNetWeightKg:111.95},...Array.from({length:12},(_,i)=>({groupDate:"2026-10-14",productCode:"WKB-0068",productName:"แผ่นแครกเกอร์ปี๊บต้นเรือนจำ",lotNo:"1410260068-1",quantity:20,totalNetWeightKg:i===11?241.63:241.67}))];
    const payload={rows,filters:{dateFrom:"2026-10-14",dateTo:"2026-10-14",productCodes:[]},departmentName:"แผนกบิสกิต",summary:{totalQuantity:309,totalNetWeightKg:3773.41}};
    createRoot(document.getElementById("app")).render(React.createElement(Workspace,{initialReport:{reportId:"scale-inbound",payload}}));`);
  const webpack = require("next/dist/compiled/webpack/webpack").webpack;
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, context: root, entry: path.join(directory, "entry.js"),
      output: { path: directory, filename: "bundle.js" },
      resolve: { alias: { "@": path.join(root, "src"), "next/navigation": path.join(directory, "navigation.js"), "next/image": path.join(directory, "image.js"),
        [path.join(root, "src/lib/usePermissions")]: path.join(directory, "permissions.js"), [path.join(root, "src/lib/useUserProfile")]: path.join(directory, "profile.js") } },
      module: { rules: [{ test: /\.js$/, exclude: /node_modules/, use: path.join(directory, "jsx-loader.cjs") }, { test: /\.css$/, use: path.join(directory, "css-loader.cjs") }] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const sampleRows = [
    { documentDate: "2026-10-14", tradeCode: "WKB-0002", productName: "แผ่นแครกเกอร์ปี๊บต้น", lotNo: "1410260002-1", quantity: 873.410, unitWeightKg: 0 },
    { documentDate: "2026-10-14", tradeCode: "WKB-0068", productName: "แผ่นแครกเกอร์ปี๊บต้นเรือนจำ", lotNo: "1410260068-1", quantity: 2900, unitWeightKg: 0 },
  ];
  const history = [{ id: "saved-batch", file_name: "saved.xlsx", row_count: 2, document_count: 1, date_from: "2026-10-13", date_to: "2026-10-13", exported_at: "2026-10-13T09:42:00Z", exported_by: "test-user", exportedByName: "apexchelon", status: "exported", metadata: { totalWeightKg: 920.45 }, production_erp_export_documents: [{ document_no: "IMM6910/0007", document_date: "2026-10-13" }] }];
  const state = { duplicateCount: 0, exportAttempts: [], downloads: [], previewFilters: [], failExportOnce: false, previewDelayMs: 0 };
  const json = (res, value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  const icon = (Icon, size = 21) => renderToStaticMarkup(createElement(Icon, { size, strokeWidth: 1.7, "aria-hidden": true }));
  const leaf = (text, selected = false) => `<p class="leaf${selected ? " selected" : ""}">${icon(FileText)}<span>${text}</span>${selected ? icon(ChevronRight, 16) : ""}</p>`;
  const menu = `<aside class="rail"><div class="railLogo"><img src="/brand/LOGO-KPF1.png" alt="KPF"></div><div class="railItems">${[Fingerprint, Boxes, Factory, Warehouse, Database, Settings].map((Icon, i) => `<div class="railItem${i === 1 ? " railSelected" : ""}">${icon(Icon, 27)}</div>`).join("")}</div><div class="railExit">${icon(LogOut, 25)}</div></aside><aside class="menu"><h2>ศูนย์รายงาน${icon(PanelLeftClose)}</h2><div class="menuSection"><h3 class="goldIcon">${icon(Star)}<span>รายการโปรด</span></h3><small>กดดาวที่รายงานเพื่อบันทึก</small></div><div class="menuSection"><h3 class="goldIcon">${icon(Clock3)}<span>ใช้งานล่าสุด</span></h3><p class="recentLink">${icon(ChevronRight,16)}รายงานชั่ง</p></div><h3>${icon(CalendarDays)}<span>แผนผลิต</span>${icon(ChevronDown,16)}</h3><h3>${icon(BarChart3)}<span>ผลผลิตและของเสีย</span>${icon(ChevronDown,16)}</h3><h3>${icon(Package)}<span>ชั่งและสต็อก</span>${icon(ChevronUp,16)}</h3>${leaf("รายงานเคลื่อนไหว")}${leaf("รายงานชั่ง",true)}${leaf("รายงานเบิก")}${leaf("รายงานคงเหลือราย LOT")}${leaf("รับเข้าเรือนจำ")}${leaf("เบิกออกเรือนจำ")}${leaf("LOT คงค้างเรือนจำ")}${leaf("เคลื่อนไหวเรือนจำ")}<h3>${icon(FileText)}<span>ผลผลิตและวัตถุดิบ</span></h3><h3>${icon(Tag)}<span>ป้ายแยม</span>${icon(ChevronDown,16)}</h3><h3>${icon(Clock3)}<span>เวลาและค่าแรง</span>${icon(ChevronDown,16)}</h3></aside>`;
  const html = `<!doctype html><html lang="th"><meta charset="utf-8"><title>KPF ERP drawer — isolated fixture</title><style>
    ${fontFaces}*{box-sizing:border-box}body{--font-noto-sans-looped:"Noto Sans Thai Looped";margin:0;color:#102c57;font-family:"Noto Sans Thai Looped",Tahoma,sans-serif;background:#f2f6fa}button,input,select,textarea{font:inherit}.rail{position:fixed;inset:0 auto 0 0;width:100px;background:#12365b;display:flex;align-items:center;flex-direction:column;gap:48px;padding:24px 12px}.rail img{width:68px}.rail span{font-size:23px;color:#b5c7da}.menu{position:fixed;left:100px;top:0;bottom:0;width:340px;background:#fff;overflow:auto;border-right:1px solid #dbe6f2}.menu h2{margin:20px 24px;font-size:24px}.menu h3{font-size:16px;padding:16px 24px;margin:0;border-top:1px solid #dbe6f2}.menu p{padding:10px 30px;margin:6px 0}.menu .leaf{padding-left:42px;font-size:15px}.menu .selected{background:#fff8e9;color:#ac7a00;border-left:3px solid #c99412}.menu small{display:block;padding:0 30px 22px;color:#718198}#app{margin-left:444px;min-width:0}body:before{content:"เบราว์เซอร์ทดสอบ · ข้อมูลจำลอง · ไม่เชื่อมฐานข้อมูลบริษัท";position:fixed;bottom:3px;left:110px;font-size:9px;color:#718198;z-index:1}@media(max-width:900px){.menu{display:none}#app{margin-left:64px}.rail{width:64px}.rail img{width:48px}}
    .rail{padding:0;gap:0}.railLogo{height:110px;width:100%;display:grid;place-items:center;background:#0e2848;border-bottom:1px solid #1c4168}.railItems{padding-top:22px;display:flex;flex-direction:column;align-items:center;gap:22px}.railItem{width:64px;height:58px;display:grid;place-items:center;color:#94b0ce}.railSelected{background:#20486e;border-radius:16px;color:#e2b322}.railExit{margin-top:auto;margin-bottom:24px;color:#d6e2f0}.menu h2{display:flex;align-items:center;justify-content:space-between;margin:24px 24px 22px;font-size:25px}.menu h2 svg{color:#6d8db1}.menu h3{display:flex;align-items:center;gap:14px;border:0;padding:18px 26px;font-weight:400;font-size:16px;min-height:62px}.menu h3 span{flex:1}.menu h3>svg:last-child:not(:first-child){color:#8ba5c1}.menu .menuSection{border-top:1px solid #dbe6f2;padding:6px 0 10px}.menu .menuSection h3{font-weight:700}.menu .goldIcon>svg{color:#c99412}.menu .recentLink{display:flex;gap:14px;align-items:center;margin:0;padding:10px 30px 14px;color:#527196}.menu .leaf{display:flex;align-items:center;gap:14px;padding:14px 34px;margin:0;min-height:54px}.menu .leaf span{flex:1}.menu .selected{border-radius:6px;border-left:3px solid #d5a21b;padding-left:31px}.menu small{padding-bottom:18px}@media(max-width:900px){.railLogo{height:90px}.railItem{width:52px}.railItems{gap:16px}}
    </style>${menu}<main id="app"></main><script src="/bundle.js"></script></html>`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/scale/receipts/erp-export/preview") {
      let input = ""; for await (const chunk of req) input += chunk;
      state.previewFilters.push(JSON.parse(input).filters);
      if (state.previewDelayMs) await new Promise(resolve => setTimeout(resolve, state.previewDelayMs));
      if (state.previewError) return json(res, { error: "ไม่สามารถโหลดพรีวิวได้ (จำลอง)" }, 500);
      return json(res, { data: { documentCount: 1, rowCount: 2, totalWeightKg: 3773.41, duplicateCount: state.duplicateCount, canOverride: true, previewToken: "fixture-token", documents: [{ documentDate: "2026-10-14", documentNo: "IMM6910/0008", rowCount: 2 }], rows: sampleRows } });
    }
    if (url.pathname.endsWith("/history")) return json(res, { data: history });
    if (url.pathname === "/api/scale/receipts/erp-export") {
      if (req.method === "POST") {
        let input = ""; for await (const chunk of req) input += chunk;
        state.exportAttempts.push(JSON.parse(input));
        if (state.failExportOnce) { state.failExportOnce = false; return json(res, { error: "เครือข่ายขัดข้อง (จำลอง)" }, 503); }
      } else state.downloads.push(url.searchParams.get("batchId"));
      res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="fixture.xlsx"', "X-Erp-Export-Document-Count": "1", "X-Erp-Export-Row-Count": "2" }); return res.end("fixture-only");
    }
    if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(await fs.readFile(path.join(directory, "bundle.js"))); }
    if (url.pathname === "/brand/LOGO-KPF1.png") { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(await fs.readFile(path.join(root, "public/brand/LOGO-KPF1.png"))); }
    if (/^\/_next\/static\/media\/[\w.-]+\.woff2$/.test(url.pathname)) { res.writeHead(200, { "Content-Type": "font/woff2" }); return res.end(await fs.readFile(path.join(root, ".next/static/media", path.basename(url.pathname)))); }
    if (url.pathname === "/favicon.ico") { res.writeHead(204); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise(resolve => server.close(resolve)), directory };
}

if (process.argv.includes("--serve")) {
  const fixture = await createErpDrawerFixture();
  console.log(fixture.url);
}
