import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadBindings, transform } from "next/dist/build/swc/index.js";
import { filterBomTreeRows } from "../src/features/production-line/utils/bomTablePresentation.js";
const require = createRequire(import.meta.url);
test("BOM visual filters keep matching nested trade codes with their ancestors and do not change source rows",()=>{
  const rows=[{id:"p",depth:0,materialCode:"W1",itemType:"WIP"},{id:"a",depth:1,materialCode:"M1",materialGoodsCode:"T1",itemType:"RAW"},{id:"b",depth:1,materialCode:"M1",materialGoodsCode:"T2",itemType:"RAW"},{id:"x",depth:0,materialCode:"M2",itemType:"RAW"}];
  const material=row=>({category:"01",isActive:row.id!=="b",itemType:row.itemType,name:"น้ำตาล"});
  const defaults={query:"",type:"all",category:"all",active:"all"};
  assert.deepEqual(filterBomTreeRows(rows,{...defaults,query:"T2"},material).map(row=>row.id),["p","b"]);
  assert.deepEqual(filterBomTreeRows(rows,{...defaults,active:"inactive"},material).map(row=>row.id),["p","b"]);
  assert.deepEqual(filterBomTreeRows(rows,{...defaults,category:"99"},material),[]);
  assert.deepEqual(filterBomTreeRows(rows,defaults,material),rows);
});
async function load(filename, overrides) {
  await loadBindings();
  const { code } = await transform(readFileSync(filename, "utf8"), {filename,jsc:{parser:{syntax:"ecmascript",jsx:true},transform:{react:{runtime:"automatic"}}},module:{type:"commonjs"}});
  const module={exports:{}};
  new Function("require","module","exports",code)(name=>overrides[name]||(name.endsWith(".css")?{__esModule:true,default:{}}:require(name)),module,module.exports);
  return module.exports.default;
}
function hooks() {
  const state=[],refs=[]; let i=0,r=0;
  return { reset(){i=0;r=0},api:{...require("react"),useState(initial){const slot=i++;if(!(slot in state))state[slot]=typeof initial==="function"?initial():initial;return[state[slot],value=>{state[slot]=typeof value==="function"?value(state[slot]):value}]},useRef(initial){return refs[r++] ||= {current:initial}},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){}} };
}
test("inline quantity commits once, Escape cancels, invalid or blank drafts preserve the old value",async()=>{
  const h=hooks(),values=[];
  const Field=await load("src/components/InlineNumberField.js",{react:h.api});
  const render=()=>{h.reset();return Field({value:12,label:"จำนวน",onCommit:value=>values.push(value)})};
  let input=render();input.props.onFocus();input=render();input.props.onChange({target:{value:"14.5"}});input=render();input.props.onBlur();
  assert.deepEqual(values,[14.5]);render().props.onBlur();assert.equal(values.length,1);
  for(const draft of ["", "-2", "Infinity"]) {input=render();input.props.onFocus();input=render();input.props.onChange({target:{value:draft}});render().props.onBlur();}
  assert.deepEqual(values,[14.5]);
  input=render();input.props.onChange({target:{value:"99"}});input=render();
  input.props.onKeyDown({key:"Escape",nativeEvent:{},preventDefault(){},currentTarget:{blur(){input.props.onBlur()}}});
  assert.deepEqual(values,[14.5]);
});
test("BOM uses the real shared table and pickers while retaining read-only child guards and version save",()=>{
  const source=readFileSync("src/features/production-line/components/BomEditorPageClient.js","utf8");
  assert.match(source,/<ReportTable tableClassName=\{styles.treeTable\}/);
  assert.match(source,/<PlanningSkuPicker title="เลือกสินค้า \/ WIP"/);
  assert.match(source,/const isEditableRow = !isChild && !isReadOnly/);
  assert.match(source,/<InlineNumberField[\s\S]*?disabled=\{!isEditableRow\}/);
  assert.match(source,/className=\{styles.saveBar\}/);
  assert.match(source,/onClick=\{handleSaveVersion\}/);
  const picker=readFileSync("src/features/production-line/components/MaterialSelectionDrawer.js","utf8");
  assert.match(picker,/<PlanningCatalogDialog/);assert.match(picker,/<PlanningCatalogTable>/);
  assert.match(picker,/<WeightScalePaginationBar/);
  assert.match(picker,/existingMaterialKeys.has\(materialKey\)/);
});

function nodes(node) { return !node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)]; }
test("BOM material adapter keeps independent trade units, selected quantities and existing-row exclusions",async()=>{
  const h=hooks(),added=[];let closed=0;
  const Stub=()=>null;
  const Picker=await load("src/features/production-line/components/MaterialSelectionDrawer.js",{
    react:h.api,
    "@/features/production-planning/components/PlanningCatalogDialog":{__esModule:true,default:Stub,PlanningCatalogTable:Stub,PlanningCatalogRowNumber:Stub},
    "./WeightScalePaginationBar":{__esModule:true,default:Stub}
  });
  const materials=[{code:"M1",goodsCode:"T1",name:"น้ำตาล",itemType:"RAW",unit:"KG",category:"01"},{code:"M1",goodsCode:"T2",name:"น้ำตาล",itemType:"RAW",unit:"ถุง",category:"01"}];
  const render=()=>{h.reset();return Picker({isOpen:true,onClose:()=>closed++,materials,initialComponentType:"RAW",onConfirm:value=>added.push(value),existingMaterialKeys:new Set(["OTHER::X"])})};
  let tree=render();
  for(const name of ["เลือก T1","เลือก T2"]) {nodes(tree).find(node=>node.props?.["aria-label"]===name).props.onChange();tree=render();}
  for(const [name,value] of [["จำนวน T1","2.5"],["จำนวน T2","1"]]) {nodes(tree).find(node=>node.props?.["aria-label"]===name).props.onChange({target:{value}});tree=render();}
  nodes(tree).find(node=>node.props?.["aria-label"]==="ค้นหาวัตถุดิบ").props.onChange({target:{value:"ไม่พบ"}});
  tree=render();
  assert.equal(nodes(tree).find(node=>node.props?.["aria-label"]==="จำนวน T1").props.value,2.5);
  const confirm=nodes(tree).find(node=>node.type==="button"&&node.props.children?.[0]==="เพิ่ม ");
  assert.equal(confirm.props.disabled,false);confirm.props.onClick();
  assert.equal(closed,1);assert.deepEqual(added[0].map(row=>[row.material.goodsCode,row.qty]),[["T1",2.5],["T2",1]]);
});

test("cell popover remains within viewport and disabled child cells stay read-only",async()=>{
  const h=hooks(),previous=globalThis.window;
  globalThis.window={innerWidth:834,innerHeight:600};
  try {
    const Popover=await load("src/components/InlineCellPopover.js",{react:h.api});
    const render=disabled=>{h.reset();return Popover({label:"ฐานคำนวณ",disabled,children:"fields"})};
    let node=render(false);
    node.props.onToggle({currentTarget:{open:true,querySelector:selector=>({getBoundingClientRect:()=>selector==="summary"?{left:800,bottom:590}:{width:250,height:120}})}});
    node=render(false);
    assert.deepEqual(nodes(node).find(item=>item.props?.["data-cell-panel"]).props.style,{left:576,top:472});
    assert.equal(render(true).type,"span");
  } finally {globalThis.window=previous;}
});
