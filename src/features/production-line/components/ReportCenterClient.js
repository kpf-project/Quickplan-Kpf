"use client";

import MaterialCostEstimateClient from "@/features/production-costing/components/MaterialCostEstimateClient";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChartColumn, ChevronDown, ChevronRight, Clock3, Database, ExternalLink, FileSpreadsheet, FileText, Landmark, Loader2, Package, PanelLeftClose, PanelLeftOpen, Printer, Search, Tag, X } from "lucide-react";
import { usePermissions } from "@/lib/usePermissions";
import { reportHref, visibleReportGroups, buildReportMenuGroups, PIECE_RATE_REPORT_VIEWS } from "@/features/production-line/reportCenter";
import { attachReportViewport } from "@/features/production-line/reportViewport";
import { ReportHeader } from "@/components/print";
import JamReportWorkspace from "@/features/production-line/report-center/JamReportWorkspace";
import { JAM_REPORTS } from "@/features/production-line/report-center/jamReportDefinitions";
import LaborReportWorkspace from "@/features/production-line/report-center/LaborReportWorkspace";
import { LABOR_REPORTS } from "@/features/production-line/report-center/laborReportDefinitions";
import OutputReportWorkspace from "@/features/production-line/report-center/OutputReportWorkspace";
import { OUTPUT_REPORTS } from "@/features/production-line/report-center/outputReportDefinitions";
import styles from "./ReportCenter.module.css";
import { ReportRequestCacheProvider } from "../report-center/ReportRequestCacheProvider";
import { useUserProfile } from "@/lib/useUserProfile";
import StockReportWorkspace from "../report-center/StockReportWorkspace";
import { navigateReport } from "../report-center/reportNavigation";

const icons = { CalendarDays, ChartColumn, Package, Tag, Landmark, Clock3, Database, FileText };

export default function ReportCenterClient({ initialReport }) {
  const params = useSearchParams();
  const router = useRouter();
  const { permissions, isAdmin, loaded } = usePermissions();
  const profile = useUserProfile();
  const groups = visibleReportGroups(permissions, isAdmin);
  const reports = groups.flatMap((group) => group.reports.flatMap((report) => JAM_REPORTS[`${report.id}-detail`] ? [report, { ...report, id: `${report.id}-detail`, label: `${report.label} แบบละเอียด`, menuHidden: true }] : [report]));
  const selected = reports.find((report) => report.id === params.get("report")) || reports.find((report) => report.id === "stock-issue") || reports[0];
  const group = groups.find((entry) => entry.reports.some((report) => report.id === selected?.id || `${report.id}-detail` === selected?.id));
  const applied = { dateFrom: params.get("dateFrom") || "", dateTo: params.get("dateTo") || "" };
  const detail = params.get("view") === "detail";
  const [collapsed, setCollapsed] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const menuGroups = buildReportMenuGroups(groups, menuQuery);
  const [manuallyExpandedGroup, setManuallyExpandedGroup] = useState(null);
  const expandedGroup = manuallyExpandedGroup ?? group?.id;
  let src = "";
  let invalidDates = "";
  try { if (selected && !selected.centerMode && !JAM_REPORTS[selected.id] && !LABOR_REPORTS[selected.id] && !OUTPUT_REPORTS[selected.id]) src = reportHref(selected, applied, detail); } catch (issue) { invalidDates = issue.message; }
  const [error, setError] = useState("");
  const [cachedSrcs, setCachedSrcs] = useState(() => (src ? [src] : []));
  if (src && !cachedSrcs.includes(src)) {
    setCachedSrcs([...cachedSrcs, src]);
  }
  const [readySrcs, setReadySrcs] = useState({});
  const [actionsBySrc, setActionsBySrc] = useState({});
  const [pendingBySrc, setPendingBySrc] = useState({});
  const frameRefs = useRef({});
  const scrollbar = useRef(null);
  const detachViewport = useRef(null);
  const menu = useRef(null);

  const isCurrentReady = Boolean(readySrcs[src]);
  const isBusy = Boolean(src && !invalidDates && !isCurrentReady);

  useEffect(() => {
    if (!src || !readySrcs[src]) return;
    const currentFrame = frameRefs.current[src];
    if (!currentFrame) return;

    detachViewport.current?.();
    try {
      detachViewport.current = attachReportViewport(currentFrame, scrollbar.current);
      currentFrame.contentWindow?.postMessage({ type: "kpf-report-connect" }, window.location.origin);
    } catch {
      // Ignore if document not accessible yet
    }
  }, [src, readySrcs]);

  useEffect(() => {
    const receive = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "kpf-report-search-state") {
        for (const [frameSrc, frameEl] of Object.entries(frameRefs.current)) {
          if (frameEl?.contentWindow === event.source) {
            setPendingBySrc((previous) => ({ ...previous, [frameSrc]: event.data.loading === true }));
            break;
          }
        }
      }
      if (event.data?.type === "kpf-report-ready") {
        for (const [frameSrc, frameEl] of Object.entries(frameRefs.current)) {
          if (frameEl?.contentWindow === event.source) {
            setActionsBySrc((prev) => ({ ...prev, [frameSrc]: event.data.actions === "stock-summary" }));
            break;
          }
        }
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      detachViewport.current?.();
    };
  }, []);

  function navigate(report, nextDetail = false) {
    try {
      const query = new URLSearchParams();
      query.set("report", report.id);
      if (nextDetail && report.detail) query.set("view", "detail");
      if (report.dates && applied.dateFrom && applied.dateTo) {
        query.set("dateFrom", applied.dateFrom);
        query.set("dateTo", applied.dateTo);
      }
      navigateReport(router, `/production-line/reports?${query.toString()}`);
      setManuallyExpandedGroup(null);
      setError("");
    } catch (issue) { setError(issue.message); }
  }

  function toggleGroup(groupId) {
    if (collapsed) {
      setCollapsed(false);
      setManuallyExpandedGroup(groupId);
      return;
    }
    setManuallyExpandedGroup(expandedGroup === groupId ? "" : groupId);
  }

  function frameLoaded(frameSrc) {
    const currentFrame = frameRefs.current[frameSrc];
    try {
      if (currentFrame?.contentWindow?.location.pathname === "/login") {
        setError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
        return;
      }
    } catch { /* Ignore */ }
    setReadySrcs((prev) => ({ ...prev, [frameSrc]: true }));
  }

  const reportMeta = [
    { label: "หมวดรายงาน", value: group?.label || "สายการผลิต" },
    { label: "มุมมอง", value: detail ? "แบบละเอียด" : "แบบสรุป" },
    { label: "สถานะเชื่อมโยง", value: "ระบบฐานข้อมูลสด (Real-time)" },
  ];

  return (
    <ReportRequestCacheProvider scope={JSON.stringify([profile.username, permissions, isAdmin])}>
    <div className={styles.center} data-report-center>
      <aside ref={menu} className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} aria-label="หมวดรายงาน">
        <div className={styles.sideHeading}>
          {!collapsed && <strong>ศูนย์รายงาน</strong>}
          <button
            type="button"
            title={collapsed ? "ขยายหมวดรายงาน" : "ยุบหมวดรายงาน"}
            aria-label={collapsed ? "ขยายหมวดรายงาน" : "ยุบหมวดรายงาน"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {!collapsed && <label className={styles.menuSearch}><Search size={17} aria-hidden="true" /><input aria-label="ค้นหารายงาน" placeholder="ค้นหารายงาน…" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} />{menuQuery && <button type="button" aria-label="ล้างคำค้นหารายงาน" onClick={() => setMenuQuery("")}><X size={14} /></button>}</label>}
        {!loaded && <p className={styles.small}>กำลังตรวจสอบสิทธิ์…</p>}
        {menuGroups.map((entry) => {
          const Icon = icons[entry.icon];
          const isExpanded = Boolean(menuQuery.trim()) || expandedGroup === entry.id;
          const isCurrentGroup = group?.id === entry.id;

          return (
            <div key={entry.id} className={styles.category}>
              <button
                type="button"
                className={`${styles.categoryButton} ${isCurrentGroup || isExpanded ? styles.currentCategory : ""}`}
                aria-label={entry.label}
                aria-expanded={entry.standalone ? undefined : isExpanded}
                aria-controls={entry.standalone ? undefined : `reports-${entry.id}`}
                aria-current={entry.standalone && isCurrentGroup ? "page" : undefined}
                onClick={() => entry.standalone ? navigate(entry.reports[0]) : toggleGroup(entry.id)}
                title={collapsed ? entry.label : undefined}
              >
                <Icon size={18} className={styles.categoryIcon} />
                {!collapsed && (
                  <>
                    <span>{entry.label}</span>
                    {!entry.standalone && <ChevronDown
                      size={14}
                      className={`${styles.categoryChevron} ${isExpanded ? styles.chevronOpen : ""}`}
                    />}
                  </>
                )}
              </button>

              {!entry.standalone && !collapsed && isExpanded && (
                <div id={`reports-${entry.id}`} className={styles.subList} role="region" aria-label={`รายงานหมวด${entry.label}`}>
                  {entry.sections.map((section) => <div className={styles.menuSection} key={section.label}>
                    {section.label && <div className={styles.sectionLabel}>{section.label}</div>}
                    <div className={styles.sectionItems}>{section.reports.map((report) => {
                    const isSelected = selected?.id === report.id || (report.id === "wages" && PIECE_RATE_REPORT_VIEWS.some((view) => view.value === selected?.id)) || (selected?.id === `${report.id}-detail` && !section.reports.some((item) => item.id === selected.id));
                    return (
                      <button
                        key={report.id}
                        type="button"
                        className={`${styles.subItem} ${isSelected ? styles.selectedSubItem : ""}`}
                        onClick={() => navigate(report)}
                        title={report.label}
                        aria-current={isSelected ? "page" : undefined}
                      >
                        <span className={styles.subItemText}>{report.label}</span>
                        {isSelected && <ChevronRight size={13} className={styles.subItemActiveArrow} />}
                      </button>
                    );
                  })}</div></div>)}
                </div>
              )}
            </div>
          );
        })}
        {loaded && !menuGroups.length && !collapsed && <p role="status" className={styles.emptyMenu}>ไม่พบรายงานที่ตรงกับคำค้นหา</p>}
      </aside>
      <div className={styles.content}>
        {selected?.id === "cost-estimate" ? <MaterialCostEstimateClient /> : OUTPUT_REPORTS[selected?.id] ? <OutputReportWorkspace reportId={selected.id} /> : LABOR_REPORTS[selected?.id] ? <LaborReportWorkspace reportId={selected.id} /> : JAM_REPORTS[selected?.id] ? <JamReportWorkspace reportId={selected.id} /> : selected?.centerMode ? (
          <StockReportWorkspace initialReport={initialReport} reportId={selected.id} />
        ) : (
          <div className={styles.legacyContent}>
        <div className={styles.titleRow}>
          <h1>ศูนย์รายงานไลน์ผลิต</h1>
          <span className={styles.realData}><Database size={14} />ข้อมูลระบบจริง</span>
          <time className={styles.today}>วันที่ {new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok" }).format(new Date())}</time>
        </div>
        {(error || invalidDates) && <div role="alert" className={styles.error}>{error || invalidDates}</div>}
        <div className={styles.workspace}>
          <section className={styles.report} aria-label="พื้นที่รายงาน">
            <div className={styles.standardHeaderWrapper}>
              <ReportHeader
                title={selected?.label || "รายงานมาตรฐานไลน์ผลิต"}
                subtitle={`PRODUCTION LINE REPORT · ${group?.label?.toUpperCase() || "MONITORING"}`}
                docNo={selected?.id ? `REP-${selected.id.toUpperCase()}` : null}
                meta={reportMeta}
              />
            </div>
            <div className={styles.reportHeading}>
              <div>
                <p>{group?.label || "รายงานไลน์ผลิต"}</p>
                <h2>{selected?.label || (loaded ? "ไม่มีรายงานตามสิทธิ์" : "กำลังโหลดรายงาน…")}</h2>
              </div>
              {selected && <div className={styles.actions}>
                {selected.detail && <div className={styles.views}><button type="button" className={!detail ? styles.primary : ""} onClick={() => navigate(selected, false)}>สรุป</button><button type="button" className={detail ? styles.primary : ""} onClick={() => navigate(selected, true)}>ละเอียด</button></div>}
                {actionsBySrc[src] && <><button type="button" disabled={isBusy || pendingBySrc[src]} className={styles.primary} onClick={() => frameRefs.current[src]?.contentWindow?.postMessage({ type: "kpf-report-action", action: "print" }, window.location.origin)}><Printer size={16} />พิมพ์ A4</button><button type="button" disabled={isBusy || pendingBySrc[src]} onClick={() => frameRefs.current[src]?.contentWindow?.postMessage({ type: "kpf-report-action", action: "excel" }, window.location.origin)}><FileSpreadsheet size={16} />Excel</button></>}
                <Link href={reportHref(selected, invalidDates ? {} : applied, detail, false)} target="_blank" rel="noopener noreferrer" title="เปิดหน้ารายงานเดิม" aria-label="เปิดหน้ารายงานเดิม"><ExternalLink size={17} /></Link>
              </div>}
            </div>
            <div className={styles.preview}>
              {isBusy && <div className={styles.loading} role="status"><Loader2 size={20} className="animate-spin" />กำลังโหลดข้อมูลจริง…</div>}
              {cachedSrcs.map((cachedSrc) => {
                const isActive = cachedSrc === src;
                const isReady = readySrcs[cachedSrc];
                return (
                  <iframe
                    key={cachedSrc}
                    ref={(el) => {
                      if (el) frameRefs.current[cachedSrc] = el;
                      else delete frameRefs.current[cachedSrc];
                    }}
                    src={cachedSrc}
                    title={isActive ? `รายงาน${selected?.label || ""}` : "รายงานไลน์ผลิต"}
                    onLoad={() => frameLoaded(cachedSrc)}
                    className={`${styles.frame} ${isActive && isReady ? styles.activeFrame : styles.hiddenFrame}`}
                    tabIndex={isActive ? 0 : -1}
                    aria-hidden={!isActive}
                  />
                );
              })}
              {loaded && !selected && <div className={styles.empty}>ไม่พบรายงานที่คุณมีสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ</div>}
            </div>
            <div ref={scrollbar} className={styles.horizontalScroll} tabIndex={0} role="region" aria-label="เลื่อนรายงานซ้าย–ขวา" hidden><div /></div>
          </section>
        </div>
        <footer className={styles.footer}>
          <div className={styles.footerContent}>
            <div className={styles.footerBrand}>
              <Database size={15} />
              <span>ระบบศูนย์รายงานกลาง Quickplan KPF · ฝ่ายผลิต</span>
            </div>
            <div className={styles.footerAudit}>
              <span>ISO 32000-2 & W3C CSS Paged Media Standard Compliant</span>
              <span>•</span>
              <span>ข้อมูลระบบจริง (Live Database)</span>
            </div>
          </div>
        </footer>
          </div>
        )}
      </div>
    </div>
    </ReportRequestCacheProvider>
  );
}
