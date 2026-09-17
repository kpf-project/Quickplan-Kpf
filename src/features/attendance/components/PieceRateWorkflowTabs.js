"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Ban,
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardList,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  Scale,
  Shuffle,
  Undo2,
} from "lucide-react";
import styles from "./PieceRateWorkflowTabs.module.css";

export const PIECE_RATE_WORKFLOW_TABS = Object.freeze([
  { mode: "weigh-in", label: "ชั่งเข้า", icon: Scale, group: "weigh" },
  { mode: "prison-receipt", label: "รับเข้าเรือนจำ", icon: PackagePlus, group: "weigh" },
  { mode: "waste", label: "ชั่งของเสีย", icon: PackageMinus, group: "weigh" },
  { mode: "return", label: "ชั่งคืน", icon: RotateCcw, group: "weigh" },
  { mode: "cancel-weigh", label: "ยกเลิกชั่ง", icon: Ban, group: "weigh" },
  { mode: "issue", label: "เบิก", icon: ArrowDownToLine, group: "issue" },
  { mode: "prison-issue", label: "เบิกเรือนจำ", icon: Boxes, group: "issue" },
  { mode: "cancel-issue", label: "ยกเลิกเบิก", icon: Undo2, group: "issue" },
]);

const REPORT_ITEMS = Object.freeze([
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=inbound",
    label: "รับเข้า WIP",
    description: "รายการชั่งเข้า WIP",
    icon: PackageCheck,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=inbound-fg",
    label: "รับเข้า FG",
    description: "รายงาน FG ผลิตเสร็จ",
    icon: PackageCheck,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=issue",
    label: "เบิก",
    description: "เบิกและชั่งคืน",
    icon: PackageMinus,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=movement",
    label: "เคลื่อนไหว",
    description: "ยกยอด-คงเหลือ",
    icon: Shuffle,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=balance",
    label: "คงเหลือ",
    description: "คงเหลือแยก LOT",
    icon: Boxes,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock?report=prison",
    label: "รายงานเรือนจำ",
    description: "รับเข้า · เบิก · คงเหลือ LOT",
    icon: ClipboardList,
  },
]);

const WORKFLOW_GROUPS = Object.freeze([
  {
    id: "weigh",
    label: "ชั่ง",
    description: "ชั่งเข้า · รับเข้าเรือนจำ · ชั่งของเสีย · ชั่งคืน",
    icon: Scale,
    type: "mode",
  },
  {
    id: "issue",
    label: "เบิก",
    description: "เบิก · เบิกเรือนจำ · ยกเลิกเบิก",
    icon: ArrowDownToLine,
    type: "mode",
  },
  {
    id: "report",
    label: "รายงาน",
    description: "รับเข้า · เบิก · เคลื่อนไหว · คงเหลือ",
    icon: BarChart3,
    type: "report",
  },
]);

export function normalizePieceRateWorkflowMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PIECE_RATE_WORKFLOW_TABS.some((tab) => tab.mode === normalized)
    ? normalized
    : "weigh-in";
}

export default function PieceRateWorkflowTabs({ activeMode, onChange }) {
  const [openGroup, setOpenGroup] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpenGroup(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenGroup(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const activeTab =
    PIECE_RATE_WORKFLOW_TABS.find((tab) => tab.mode === activeMode) ||
    PIECE_RATE_WORKFLOW_TABS[0];

  const selectMode = (mode) => {
    setOpenGroup(null);
    onChange?.(mode);
  };

  return (
    <nav
      ref={rootRef}
      className={styles.tabs}
      aria-label="เมนูจัดการเนื้อขนมป้ายแยม"
    >
      <div className={styles.caption}>
        <span>JAM LABEL WORKFLOW</span>
        <strong>จัดการชั่ง เบิก และรายงาน</strong>
        <small>เมนูกระชับสำหรับเครื่องหน้างาน</small>
      </div>

      <div className={styles.groupList}>
        {WORKFLOW_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const groupTabs = PIECE_RATE_WORKFLOW_TABS.filter(
            (tab) => tab.group === group.id
          );
          const isActive = group.type === "mode" && activeTab.group === group.id;
          const isOpen = openGroup === group.id;

          return (
            <div key={group.id} className={styles.group} data-open={isOpen}>
              <button
                type="button"
                className={styles.groupButton}
                data-active={isActive}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
              >
                <span className={styles.groupIcon}>
                  <GroupIcon aria-hidden="true" />
                </span>
                <span className={styles.groupText}>
                  <strong>{group.label}</strong>
                  <small>{isActive ? `กำลังทำงาน: ${activeTab.label}` : group.description}</small>
                </span>
                <ChevronDown className={styles.chevron} aria-hidden="true" />
              </button>

              <div
                className={styles.menu}
                role="menu"
                aria-label={`เมนู${group.label}`}
                inert={!isOpen}
              >
                {group.type === "report" ? (
                  REPORT_ITEMS.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => setOpenGroup(null)}
                      >
                        <span className={styles.menuIndex}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <Icon aria-hidden="true" />
                        <span className={styles.menuLabel}>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                      </Link>
                    );
                  })
                ) : (
                  groupTabs.map((tab, index) => {
                    const Icon = tab.icon;
                    const itemActive = tab.mode === activeMode;
                    return (
                      <button
                        key={tab.mode}
                        type="button"
                        role="menuitem"
                        tabIndex={isOpen ? 0 : -1}
                        data-active={itemActive}
                        onClick={() => selectMode(tab.mode)}
                      >
                        <span className={styles.menuIndex}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <Icon aria-hidden="true" />
                        <span className={styles.menuLabel}>
                          <strong>{tab.label}</strong>
                          {itemActive ? <small>กำลังใช้งาน</small> : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
