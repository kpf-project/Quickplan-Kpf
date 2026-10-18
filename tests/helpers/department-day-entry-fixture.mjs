// Isolated real-component browser fixture. No company API requests or writes.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadBindings } from "next/dist/build/swc/index.js";
await loadBindings();
const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const directory = path.join(root, ".codex-tmp", "department-day-entry-fixture");
await fs.mkdir(directory, { recursive: true });
const write = (name, content) => fs.writeFile(path.join(directory, name), content, "utf8");
await write("jsx-loader.cjs", `module.exports=function(source){const done=this.async();require(${JSON.stringify(require.resolve("next/dist/build/swc/index.js"))}).transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).then(r=>done(null,r.code),done);};`);
await write("css-loader.cjs", `module.exports=function(source){const names={};const prefix=require('node:path').basename(this.resourcePath).replace(/[^a-z]/gi,'');const css=source.replace(/\\.([a-zA-Z_][\\w-]*)/g,(_,name)=>'.'+(names[name]=prefix+'_'+name));return 'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.appendChild(style);module.exports='+JSON.stringify(names)+';';};`);
await write("entry.js", `import React,{useState,useMemo,useEffect} from 'react';import{createRoot}from'react-dom/client';import PickerDialog from ${JSON.stringify(path.join(root, "src/features/production-planning/components/PlanningSkuPicker.js").replaceAll("\\", "/"))};import Workbench from ${JSON.stringify(path.join(root, "src/features/production-planning/components/WeeklyPlanningWorkbench.js").replaceAll("\\", "/"))};
const products=[{skuCode:'WKB-0050',name:'แป้งคุกกี้นม',displayFactor:211.2},{skuCode:'WKB-0041',name:'แป้งหมัก',displayFactor:195.65},{skuCode:'WKB-0054',name:'แป้งคุกกี้ก้นหอย',displayFactor:350}];
const base={shiftId:'shift1',shiftCode:'1',shiftName:'กะเช้า',planningUnit:'batch',displayUnit:'KG',sourceSectionDefId:'room'};
const seed=[{...base,...products[0],skuName:products[0].name,id:'a',workDate:'2026-10-19',plannedQty:15},{...base,...products[1],skuName:products[1].name,id:'b',workDate:'2026-10-19',plannedQty:14},{...base,...products[2],skuName:products[2].name,id:'c',workDate:'2026-10-20',plannedQty:12}];
function Picker({onSelect,onClose}){return <PickerDialog title="เลือก WIP" description="รายการตัวอย่างแยกจากข้อมูลบริษัท" skuMap={new Map(products.map(p=>[p.skuCode,{...p,itemType:'WIP',unit:'KG',fgSkus:['FG-FIXTURE']}]))} requireBom={false} onSelect={code=>onSelect(products.find(p=>p.skuCode===code))} onClose={onClose}/>}
function Fixture(){const[lines,setLines]=useState(seed),[picker,setPicker]=useState(null),[message,setMessage]=useState(''),[locked,setLocked]=useState(false),[previewPending,setPending]=useState(false),[previewError,setPreviewError]=useState('');
useEffect(()=>{setPending(true);const timer=setTimeout(()=>setPending(false),300);return()=>clearTimeout(timer)},[lines]);
const columns=lines.map(line=>({...line,key:line.id}));
const materials=useMemo(()=>[{code:'M03-00220',name:'แป้งสาลี',unit:'ชุด',factor:12},{code:'M04-00790',name:'มาการีน (กล่อง)',unit:'กล่อง',factor:2},{code:'M04-00270',name:'แบะแซ (ถัง)',unit:'ถัง',factor:.3},{code:'M01-00040',name:'น้ำตาลทราย',unit:'ถุง',factor:.1}].map(m=>({...m,values:Object.fromEntries(lines.map(l=>[l.id,Number(l.plannedQty||0)*m.factor]))})),[lines]);
return <><nav className="fixtureNav"><strong>KPF <span>Quickplan</span></strong><span>แผนหลัก</span><span className="active">งานแผนก</span><span>รายงาน & ปรับแผน</span><span>Preview ใบเบิก</span></nav><Workbench activeMasterPlanNo="MP202610003" selectablePlanOptions={[{planNo:'MP202610003'}]} setMasterPlanNo={()=>{}} departmentTabs={[{id:'dept',name:'แผนกบิสกิต'}]} activeDepartmentId="dept" activeDepartment={{id:'dept',name:'แผนกบิสกิต'}} setSelectedDepartmentId={()=>{}} sectionTabs={[{id:'room',name:'ห้องตีแป้งบิสกิต'}]} selectedSectionId="room" setSelectedSectionId={()=>{}} activeSectionModel={{id:'room',name:'ห้องตีแป้งบิสกิต'}} activeSectionShifts={[{shiftId:'shift1',shiftCode:'1',shiftName:'กะเช้า'},{shiftId:'shift2',shiftCode:'2',shiftName:'กะกลางคืน'}]} previewMeta={{planRange:{start:'2026-10-19',end:'2026-10-25'}}} matrixColumns={columns} materialRows={materials} activeSectionDraftLines={lines} wipSkuNameBySku={new Map()} updateLine={(id,key,value)=>setLines(previous=>previous.map(l=>l.id===id?{...l,[key]:value}:l))} addLine={date=>{const id=crypto.randomUUID();setLines(previous=>[...previous,{...base,id,workDate:date,skuCode:'',plannedQty:''}]);setPicker(id)}} removeLine={id=>setLines(previous=>previous.filter(l=>l.id!==id))} saveDraft={()=>setMessage('บันทึกแบบร่างจำลองแล้ว — ไม่มีการส่งข้อมูล')} confirmSubplan={()=>setMessage('ยืนยันจำลอง — ไม่มีการส่งข้อมูล')} retryPreview={()=>setPreviewError('')} regenerateSectionFromBom={()=>setPreviewError('')} message={message} wipPickerLineId={picker} setWipPickerLineId={setPicker} handleSelectWipFromPicker={p=>{setLines(previous=>previous.map(l=>l.id===picker?{...l,...p,skuName:p.name}:l));setPicker(null)}} WipPicker={Picker} isConfirmedSubplanLocked={locked} previewPending={previewPending} previewError={previewError}/><div className="fixtureControls"><span>ทดสอบแยกจากข้อมูลบริษัท · สูตรตัวอย่าง ไม่ใช่ BOM จริง</span><button onClick={()=>setLocked(v=>!v)}>ทดสอบล็อก</button><button onClick={()=>setPreviewError('การเชื่อมต่อขัดข้อง (จำลอง)')}>ทดสอบคำนวณล้มเหลว</button></div></>}
createRoot(document.getElementById('app')).render(<Fixture/>);`);
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: "development", devtool: false, context: root, resolve: { alias: { "@": path.join(root, "src") } }, entry: path.join(directory, "entry.js"), output: { path: directory, filename: "bundle.js" }, module: { rules: [{ test: /\.js$/, exclude: /node_modules/, use: path.join(directory, "jsx-loader.cjs") }, { test: /\.css$/, use: path.join(directory, "css-loader.cjs") }] } });
  compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
let fontFaces = "";
for (const name of await fs.readdir(path.join(root, ".next/static/css")).catch(() => [])) {
  const css = await fs.readFile(path.join(root, ".next/static/css", name), "utf8");
  const faces = css.match(/@font-face\{[^}]*font-family:Noto Sans Thai Looped;[^}]*\}/g);
  if (faces) { fontFaces = faces.join("\n"); break; }
}
const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Department day entry · isolated fixture</title><style>${fontFaces}*{box-sizing:border-box}body{margin:0;background:white;font-family:'Noto Sans Thai Looped',Tahoma,sans-serif;color:#102c57}button,input,select{font:inherit}.fixtureNav{height:54px;display:flex;align-items:center;gap:32px;background:#102c57;color:white;padding:0 24px;font-size:14px}.fixtureNav strong{font-size:23px;margin-right:24px}.fixtureNav strong span{font-weight:400;opacity:.7}.fixtureNav .active{border-bottom:3px solid #d4af37;height:100%;display:flex;align-items:center}.fixtureControls{display:flex;gap:8px;padding:8px 16px;font-size:10px;color:#71839b}.fixtureDialog{position:fixed;inset:0;background:#0006;display:grid;place-items:center;z-index:90}.fixtureDialog section{padding:20px;background:white;border-radius:5px;display:grid;gap:8px}.fixtureDialog button{padding:10px;background:white;border:1px solid #cbd9ea}@media(max-width:760px){.fixtureNav{gap:12px;font-size:11px;padding:0 8px}.fixtureNav strong{font-size:16px;margin-right:0}}</style><div id="app"></div><script src="/bundle.js"></script></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(await fs.readFile(path.join(directory, "bundle.js"))); }
  if (url.pathname.startsWith("/_next/static/media/")) { const file = path.join(root, ".next/static/media", path.basename(url.pathname)); res.writeHead(200); return res.end(await fs.readFile(file).catch(() => "")); }
  if (url.pathname.startsWith("/api/")) { res.writeHead(403); return res.end("Company APIs are unavailable in fixture"); }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
console.log(`http://localhost:${server.address().port}`);
