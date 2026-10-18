"use client";

import styles from "./RequisitionPreviewPresentation.module.css";

export default function RequisitionPaper({ id, documentKey, active = false, department, masterPlanNo, creator, shift, room, period, dateAction, actions, children }) {
  return <article id={id} data-requisition-document={documentKey} data-active={active} className={styles.paper}>
    <header className={styles.paperHeader}>
      <div className={styles.paperIdentity}>
        <h2>ใบสั่งงาน / ใบขอเบิกวัตถุดิบ</h2>
        <div className={styles.metadata}>
          <span>{department || "-"}</span><span>เลขที่แผน {masterPlanNo || "-"}</span>
          {creator && <span title="ผู้จัดทำ">ผู้จัดทำ {creator}</span>}
          {shift && <span>{shift}</span>}
        </div>
      </div>
      <h3 className={styles.roomTitle}>{room}</h3>
      <div className={styles.paperHeaderTools}>
        <div className={styles.paperDate}><span>วันที่ {period}</span>{dateAction}</div>
        {actions}
      </div>
    </header>
    {children}
  </article>;
}

export function RequisitionPaperTable({ id, hidden = false, minWidth, children }) {
  return <div id={id} hidden={hidden} className={styles.paperTableScroll}>
    <table className={styles.documentTable} style={{ minWidth }}>{children}</table>
  </div>;
}

export function RequisitionWorkLabel({ name, code }) {
  return name ? <div className={styles.workLabel}><div>{name}</div>{code && <div className={styles.workCode}>{code}</div>}</div> : <span>-</span>;
}
