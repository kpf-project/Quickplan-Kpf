"use client";
import { useState } from "react";
import PlanningCatalogDialog, { PlanningCatalogTable, PlanningCatalogRowNumber } from "@/features/production-planning/components/PlanningCatalogDialog";
import WeightScalePaginationBar from "./WeightScalePaginationBar";
import styles from "@/features/production-planning/components/RequisitionMaterialPicker.module.css";
import formStyles from "./BomEditorPageClient.module.css";

export default function BomCloneDialog({ state, setState, onConfirm, onClose }) {
  const [page,setPage]=useState(1),[limit,setLimit]=useState(15);
  const term=state.searchTerm.trim().toLowerCase();
  const items=state.products.filter(item=>`${item.code} ${item.name}`.toLowerCase().includes(term));
  const pages=Math.max(1,Math.ceil(items.length/limit)),current=Math.min(page,pages);
  const source=state.products.find(item=>item.code===state.selectedProductCode);
  const update=patch=>setState(previous=>({...previous,...patch,error:""}));
  return <PlanningCatalogDialog title="คัดลอก BOM จากสินค้าอื่น" description="เลือกสินค้าและสูตรต้นทาง เพื่อสร้างสูตรใหม่" onClose={onClose}>
    <div className={styles.body}><div className={styles.catalog}>
      <label className={styles.search}><input type="search" aria-label="ค้นหาสินค้าต้นทาง" placeholder="ค้นหารหัส / ชื่อสินค้าต้นทาง" value={state.searchTerm} onChange={event=>{update({searchTerm:event.target.value});setPage(1)}} /></label>
      <PlanningCatalogTable busy={state.isLoading}><thead><tr><th aria-label="เลือก" /><th>#</th><th>รหัส</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th></tr></thead>
        <tbody>{items.slice((current-1)*limit,current*limit).map((item,index)=><tr key={item.code} data-selected={state.selectedProductCode===item.code} onClick={()=>update({selectedProductCode:item.code,selectedFormulaCode:item.formulaOptions?.[0]?.formula_code||"DEFAULT"})}>
          <td><input type="radio" name="bom-clone-source" aria-label={`เลือกต้นทาง ${item.code}`} checked={state.selectedProductCode===item.code} onChange={()=>update({selectedProductCode:item.code,selectedFormulaCode:item.formulaOptions?.[0]?.formula_code||"DEFAULT"})} /></td>
          <PlanningCatalogRowNumber page={current} limit={limit} index={index}/><td className={styles.code}>{item.code}</td><td>{item.name}</td><td>{item.categoryName||item.category}</td>
        </tr>)}{!items.length&&<tr><td colSpan={5}>{state.isLoading?"กำลังโหลด…":"ไม่พบสินค้า"}</td></tr>}</tbody>
      </PlanningCatalogTable>
      <div className={styles.pagination}><WeightScalePaginationBar page={current} totalPages={pages} totalCount={items.length} limit={limit} limitOptions={[15,25,50]} onPageChange={setPage} onLimitChange={value=>{setLimit(value);setPage(1)}} isLoading={state.isLoading}/></div>
    </div><aside className={styles.selection}><div className={formStyles.formFields}>
      <strong>รายละเอียดสูตรใหม่</strong>
      <label>รหัสสูตรใหม่<input value={state.formulaCode} onChange={event=>update({formulaCode:event.target.value.toUpperCase()})}/></label>
      <label>ชื่อสูตรใหม่<input value={state.formulaName} onChange={event=>update({formulaName:event.target.value})}/></label>
      <p>ต้นทาง: {source?.code||"ยังไม่เลือก"} · {source?.name||""}</p>
      <label>สูตรต้นทาง<select value={state.selectedFormulaCode} disabled={!source} onChange={event=>update({selectedFormulaCode:event.target.value})}>{(source?.formulaOptions?.length?source.formulaOptions:[{formula_code:"DEFAULT",formula_name:"สูตรหลัก"}]).map(formula=><option key={formula.formula_code} value={formula.formula_code}>{formula.formula_name} ({formula.formula_code})</option>)}</select></label>
      {state.error&&<p role="alert">{state.error}</p>}
    </div></aside></div>
    <footer className={styles.footer}><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className={styles.primary} onClick={onConfirm} disabled={state.isLoading||!source}>ยืนยันการคัดลอก</button></footer>
  </PlanningCatalogDialog>;
}
