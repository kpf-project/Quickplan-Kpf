"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Settings, X } from "lucide-react";
import { normalizeProductHotkey, productHotkeyFromEvent, validateProductHotkey } from "@/lib/productHotkeys";
import { requestDepartmentProductHotkeys } from "@/lib/departmentProductHotkeysClient";
import styles from "./ProductPicker.module.css";

export default function ProductPicker({ products, selectedProduct, onSelectProduct, searchTerm, onSearchChange, onClose, stationName, error, children }) {
  const departments = [...new Map(products.map(product => [product.departmentId, { id: product.departmentId, name: product.departmentName }])).values()];
  const [departmentId, setDepartmentId] = useState(selectedProduct?.departmentId || (departments.length === 1 ? departments[0].id : ""));
  const [editing, setEditing] = useState(false);
  const [bindings, setBindings] = useState({});
  const [draft, setDraft] = useState("");
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef(null);
  const scope = departmentId;
  const activeProduct = selectedProduct?.departmentId === departmentId ? selectedProduct : null;
  const validation = activeProduct ? validateProductHotkey(bindings, activeProduct.code, draft) : "เลือกสินค้าก่อนตั้งค่าปุ่มลัด";
  const departmentProducts = products.filter(product => product.departmentId === departmentId);
  const query = searchTerm.trim().toLocaleLowerCase();
  const visibleProducts = departmentProducts.filter(product => `${product.code} ${product.name}`.toLocaleLowerCase().includes(query));

  useEffect(() => {
    const previousFocus = document.activeElement;
    rootRef.current?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    async function load() {
      if (!scope) { setBindings({}); setCanManage(false); setStorageError(""); return; }
      setLoading(true);
      setCanManage(false);
      try {
        const payload = await requestDepartmentProductHotkeys(scope, null, controller.signal);
        if (!current) return;
        setBindings(payload.bindings);
        setCanManage(payload.canManage);
        setStorageError("");
      } catch (error) {
        if (!current || error.name === "AbortError") return;
        setBindings({});
        setStorageError(error.message || "อ่านปุ่มลัดกลางไม่สำเร็จ");
      } finally {
        if (current) setLoading(false);
      }
    }
    setBindings({});
    load();
    window.addEventListener("focus", load);
    return () => { current = false; controller.abort(); window.removeEventListener("focus", load); };
  }, [scope]);

  function select(product) {
    onSelectProduct(product.code, product.departmentId);
    setDraft(bindings[product.code] || "");
    setNotice("");
  }

  async function saveHotkey() {
    if (!scope || !activeProduct || validation || storageError || !canManage || loading || saving) return;
    setSaving(true);
    try {
      const payload = await requestDepartmentProductHotkeys(scope, { productCode: activeProduct.code, hotkey: draft });
      setBindings(payload.bindings);
      setNotice("บันทึกปุ่มลัดกลางของแผนกแล้ว");
      setEditing(false);
    } catch (error) { setNotice(`บันทึกไม่สำเร็จ: ${error.message || "กรุณาลองใหม่"}`); }
    finally { setSaving(false); }
  }

  function handleKeyDown(event) {
    if (event.key === "Tab") {
      const focusable = [...rootRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']")].filter(node => node.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === "Escape") { event.preventDefault(); if (editing) setEditing(false); else onClose(); return; }
    if (editing || !scope || storageError || loading || saving) return;
    const key = productHotkeyFromEvent(event);
    const product = key && departmentProducts.find(item => bindings[item.code] === key);
    if (product) { event.preventDefault(); select(product); }
  }

  return <div className={styles.overlay}>
    <section className={styles.dialog} ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-picker-title" onKeyDown={handleKeyDown}>
      <header className={styles.header}>
        <h2 id="product-picker-title">เลือกผลิตภัณฑ์</h2>
        <label>แผนก <select value={departmentId} disabled={saving} onChange={event => { setDepartmentId(event.target.value); onSelectProduct("", event.target.value); setEditing(false); setNotice(""); }}><option value="">เลือกแผนกก่อนใช้ปุ่มลัด</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        <span>{stationName || "ยังไม่พบจุดชั่ง"}</span>
        <button type="button" onClick={onClose} aria-label="ปิดตัวเลือกสินค้า"><X size={20} /></button>
      </header>
      <div className={styles.body}>
        <div className={styles.list}>
          <div className={styles.toolbar}><input aria-label="ค้นหาสินค้า" placeholder="ค้นหาชื่อสินค้า หรือรหัสสินค้า" value={searchTerm} onChange={event => onSearchChange(event.target.value)} /><button type="button" aria-pressed={editing} disabled={!departmentId || !canManage || loading || saving} onClick={() => { setEditing(!editing); setDraft(activeProduct ? bindings[activeProduct.code] || "" : ""); setNotice(""); }}><Settings size={16} />ตั้งค่าปุ่มลัด</button></div>
          <div className={styles.tableScroll}><table><thead><tr><th>ปุ่มลัด</th><th>รูปสินค้า</th><th>รหัส</th><th>ชื่อสินค้า</th><th>หน่วย</th><th>จัดการ</th></tr></thead><tbody>
            {visibleProducts.map(product => <tr key={`${product.departmentId}:${product.code}`} data-selected={product.code === activeProduct?.code}>
              <td><kbd>{bindings[product.code] || "—"}</kbd></td>
              <td>{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} width={72} height={42} unoptimized /> : <span className={styles.noImage}>ไม่มีรูป</span>}</td>
              <td className={styles.code}>{product.code}</td><td>{product.name}</td><td>{product.unit || "—"}</td>
              <td><button type="button" disabled={saving} onClick={() => select(product)}>{product.code === activeProduct?.code ? "เลือกแล้ว" : "เลือก"}</button></td>
            </tr>)}
            {!visibleProducts.length ? <tr><td colSpan={6}>{departmentId ? "ไม่พบรายการสินค้า" : "เลือกแผนกเพื่อแสดงสินค้าและปุ่มลัด"}</td></tr> : null}
          </tbody></table></div>
          <p className={styles.help}>กดปุ่มลัดเพื่อเลือก แล้วตรวจ LOT ก่อนยืนยัน · ไม่ทำงานขณะพิมพ์ในช่องกรอกข้อมูล</p>
          {loading ? <p role="status" className={styles.help}>กำลังโหลดปุ่มลัดกลางของแผนก...</p> : departmentId && !storageError && !canManage ? <p className={styles.help}>ดูปุ่มลัดได้ แต่บัญชีนี้ไม่มีสิทธิ์แก้ไขในแผนกนี้</p> : null}
          {error || storageError ? <p role="alert" className={styles.error}>{error || storageError}</p> : null}
        </div>
        <aside className={styles.aside}>
          {editing ? <>
            <h3>ตั้งค่าปุ่มลัด</h3><p className={styles.help}>{departments.find(item => item.id === departmentId)?.name} · {stationName || "ยังไม่พบจุดชั่ง"}</p>
            {activeProduct ? <>
              <div className={styles.summary}>{activeProduct.imageUrl ? <Image src={activeProduct.imageUrl} alt={activeProduct.name} width={64} height={48} unoptimized /> : null}<div><strong>{activeProduct.code}</strong><p>{activeProduct.name}</p></div></div>
              <h4>เปลี่ยนปุ่มลัดสินค้า</h4><div className={styles.keyChange}><div><small>ปุ่มลัดเดิม</small><kbd>{bindings[activeProduct.code] || "—"}</kbd></div><ArrowRight size={20} /><div><small>ปุ่มลัดใหม่</small><kbd>{normalizeProductHotkey(draft) || "—"}</kbd></div></div>
              <label className={styles.keyInput}>กดปุ่มที่ต้องการ<input value={draft} maxLength={1} onChange={event => { setDraft(event.target.value.toUpperCase()); setNotice(""); }} onKeyDown={event => { const key = normalizeProductHotkey(event.key); if (key && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) { event.preventDefault(); setDraft(key); setNotice(""); } }} /></label>
              <p className={styles.help}>ใช้ได้เฉพาะ 1–9 หรือ A–Z</p>
              {draft ? <p role="status" className={validation ? styles.error : styles.success}>{validation || `ปุ่ม ${normalizeProductHotkey(draft)} ใช้งานได้`}</p> : null}
            </> : <p>เลือกสินค้าจากตารางเพื่อตั้งค่าปุ่มลัด</p>}
            <p className={styles.help}>คีย์ห้ามซ้ำทั้งแผนก · แผนกอื่นใช้คีย์ซ้ำได้<br />ใช้ชุดคีย์เดียวกันทุกเครื่องในแผนก<br />ไม่ต้องเชื่อมต่อเครื่องชั่งก่อนตั้งค่า</p>
            <div className={styles.footer}><button type="button" disabled={saving} onClick={() => setEditing(false)}>ยกเลิก</button><button type="button" className={styles.primary} onClick={saveHotkey} disabled={!scope || !activeProduct || !!validation || !!storageError || !canManage || loading || saving}>{saving ? "กำลังบันทึก..." : "บันทึกปุ่มลัด"}</button></div>
          </> : activeProduct ? children : <p>เลือกสินค้าจากตาราง แล้วตรวจ LOT และน้ำหนักภาชนะก่อนใช้งาน</p>}
          {notice ? <p role="status">{notice}</p> : null}
        </aside>
      </div>
    </section>
  </div>;
}
