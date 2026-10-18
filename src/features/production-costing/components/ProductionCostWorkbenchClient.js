"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  Calculator,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  ListChecks,
  Loader2,
  Printer,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { compactIssueUnit, resolveCostTreeUsage } from "@/lib/productionCostingMath";

const STEPS = [
  [1, "เลือกงาน"],
  [2, "ตรวจแผนและ BOM"],
  [3, "จัดสรรวัตถุดิบ"],
  [4, "ค่าแรง / OH"],
  [5, "ตรวจสอบและปิดต้นทุน"],
];

const money = (value) => Number(value || 0).toLocaleString("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const unitMoney = (value) => Number(value || 0).toLocaleString("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const qty = (value) => Number(value || 0).toLocaleString("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});
const inputClass = "h-9 w-full border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#102c57] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200";
const reportInputClass = "h-11 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-[#102c57] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function bangkokDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function materialStatus(item) {
  const pendingLabels = {
    missing_issue: "ไม่พบใบเบิก",
    shared_issue: "รอจัดสรรใบเบิกรวม",
    pending_price: "รอราคาต้นทุน",
    pending_upstream: "รอ Cost Sheet ต้นทาง",
    manual_review: "รอตรวจสอบ",
    pending: "รอตรวจสอบ",
    proposed: "ข้อเสนอจาก BOM",
  };
  if (item.allocation_status && !["matched", "confirmed"].includes(item.allocation_status)) {
    return { ok: false, label: pendingLabels[item.allocation_status] || "รอตรวจสอบ" };
  }
  if (item.item_type === "WIP" && item.linked_cost_sheet?.status !== "closed") {
    return { ok: false, label: "รอปิดต้นทุน WIP" };
  }
  if (["exception_not_used", "exception_not_related", "exception_indirect_oh"].includes(item.source_kind)
    && item.allocation_status === "confirmed") {
    return { ok: true, label: "ยืนยันแล้ว" };
  }
  if (Number(item.qty) <= 0 || Number(item.unit_price) <= 0) {
    return { ok: false, label: "ข้อมูลไม่ครบ" };
  }
  return { ok: true, label: "ตรง" };
}

function validationIssues(sheet, materials, expenses) {
  const issues = [];
  if (!sheet) return ["ยังไม่ได้เลือก Cost Sheet"];
  if (Number(sheet.actual_qty) <= 0) issues.push("ยังไม่มีปริมาณผลผลิตจริง");
  if (!materials.length) issues.push("ยังไม่มีรายการวัตถุดิบหรือ WIP โอนเข้า");
  materials.forEach((item) => {
    const label = `${item.item_code || "ไม่ทราบรหัส"}${item.lot_no ? ` LOT ${item.lot_no}` : ""}`;
    const resolvedWithoutDirectCost = ["exception_not_used", "exception_not_related", "exception_indirect_oh"].includes(item.source_kind)
      && item.allocation_status === "confirmed";
    const allowsNoLot = item.source_kind === "exception_direct_no_lot" && item.allocation_status === "confirmed";
    if (!resolvedWithoutDirectCost && !allowsNoLot && ["RM", "WIP", "MANUAL_WIP"].includes(item.item_type) && !item.lot_no) issues.push(`${label}: ไม่มี LOT`);
    if (!resolvedWithoutDirectCost && Number(item.qty) <= 0) issues.push(`${label}: ปริมาณจัดสรรต้องมากกว่า 0`);
    if (!resolvedWithoutDirectCost && Number(item.unit_price) <= 0) issues.push(`${label}: ยังไม่มีต้นทุนต่อหน่วย`);
    if (item.allocation_status && !["matched", "confirmed"].includes(item.allocation_status)) {
      issues.push(`${label}: ${materialStatus(item).label}`);
    }
    if (item.item_type === "WIP" && item.linked_cost_sheet?.status !== "closed") {
      issues.push(`${label}: Cost Sheet ต้นทางของ WIP ยังไม่ปิดต้นทุน`);
    }
  });
  expenses.forEach((item) => {
    if (!Number.isFinite(Number(item.amount)) || Number(item.amount) < 0) {
      issues.push(`${item.expense_type}: จำนวนเงินไม่ถูกต้อง`);
    }
  });
  return [...new Set(issues)];
}

function costTreeNodeToMaterial(node) {
  const quantity = Number(node.qty || 0);
  const unitPrice = Number(node.unitCost || 0);
  return {
    item_type: ["WIP", "MANUAL_WIP"].includes(node.type) ? "WIP" : node.type === "PACKAGING" ? "PACKING" : "RM",
    item_code: node.code,
    item_name: node.name,
    lot_no: node.lotNo || null,
    qty: quantity,
    uom_name: node.uomName || "kg",
    unit_price: unitPrice,
    total_amount: Number(node.totalCost || quantity * unitPrice || 0),
    source_doc_ref: node.source || null,
    linked_cost_sheet_id: node.costSheetId || null,
    issued_qty: Number(node.grossQty || quantity || 0),
    allocation_status: ["actual", "confirmed"].includes(node.status) ? "confirmed" : "manual_review",
    exception_reason: node.note || null,
    source_kind: node.sourceKind || "actual_cost_tree",
  };
}

function newStageSheet(node, productionDate, masterPlanNo = null) {
  return {
    cost_type: node.type === "FG" ? "FG" : "WIP",
    stage_key: "production_output",
    sku_code: node.code,
    sku_name: node.name,
    lot_no: node.lotNo,
    production_date: node.productionDate || productionDate,
    master_plan_no: node.type === "FG" ? masterPlanNo : null,
    planned_qty: 0,
    actual_qty: Number(node.qty || 0),
    actual_weight_kg: node.uomName === "kg" ? Number(node.qty || 0) : null,
    uom_name: node.uomName || "kg",
    status: "draft",
    materials: (node.children || []).map(costTreeNodeToMaterial),
    expenses: [],
    notes: "สร้างจากรายงานต้นทุนย้อนกลับ",
  };
}

function Stepper({ activeStep, onChange }) {
  return (
    <div className="border-y border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center">
        {STEPS.map(([number, label], index) => {
          const active = number === activeStep;
          const done = number < activeStep;
          return (
            <div key={number} className="contents">
              <button type="button" onClick={() => onChange(number)} className="flex min-w-0 items-center gap-2 text-left">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${active ? "bg-[#075fc4] text-white ring-4 ring-blue-100" : done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {done ? <Check className="h-4 w-4" /> : number}
                </span>
                <span className={`hidden text-xs font-bold lg:block ${active ? "text-[#075fc4]" : "text-slate-500"}`}>{label}</span>
              </button>
              {index < STEPS.length - 1 && <div className={`mx-3 h-px min-w-4 flex-1 ${done ? "bg-emerald-500" : "bg-slate-300"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProductionCostWorkbenchClient({ initialExecutiveReport = false, returnHref = null }) {
  const [sheets, setSheets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [sheet, setSheet] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [masterPlanNo, setMasterPlanNo] = useState("");
  const [department, setDepartment] = useState("");
  const [masterPlans, setMasterPlans] = useState([]);
  const [planOverview, setPlanOverview] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [showCandidatePicker, setShowCandidatePicker] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateDateFrom, setCandidateDateFrom] = useState(() => bangkokDate(-14));
  const [candidateDateTo, setCandidateDateTo] = useState(() => bangkokDate());
  const [allocating, setAllocating] = useState(false);
  const [allocationPreview, setAllocationPreview] = useState(null);
  const [showExecutiveReport, setShowExecutiveReport] = useState(initialExecutiveReport);
  const [executiveReport, setExecutiveReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDate, setReportDate] = useState(() => bangkokDate());
  const [reportSkuCode, setReportSkuCode] = useState("");
  const [reportLotNo, setReportLotNo] = useState("");
  const initialReportLoaded = useRef(false);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "500" });
      const response = await fetch(`/api/production-costing/sheets?${params}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "โหลด Cost Sheet ไม่สำเร็จ");
      const rows = Array.isArray(json.data) ? json.data : [];
      setSheets(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : "");
    } catch (error) {
      setNotice(error.message);
      setSheets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialExecutiveReport) return;
    loadSheets();
  }, [initialExecutiveReport, loadSheets]);

  useEffect(() => {
    if (initialExecutiveReport) return;
    fetch("/api/production-costing/workbench")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "โหลดแผนหลักไม่สำเร็จ");
        setMasterPlans(json.data || []);
      })
      .catch((error) => setNotice(error.message));
  }, [initialExecutiveReport]);

  const selectMasterPlan = async (value) => {
    setMasterPlanNo(value);
    setSelectedId("");
    setSheet(null);
    setMaterials([]);
    setExpenses([]);
    setAllocationPreview(null);
    setActiveStep(1);
    setPlanOverview(null);
    if (!value) return;
    setPlanLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/production-costing/workbench?masterPlanNo=${encodeURIComponent(value)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "โหลดรายละเอียดแผนหลักไม่สำเร็จ");
      setPlanOverview(json.data);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/production-costing/sheets/${selectedId}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "โหลดรายละเอียดต้นทุนไม่สำเร็จ");
        if (!active) return;
        setSheet(json.data);
        setMaterials((json.data?.materials || []).map((item) => ({ ...item })));
        setExpenses((json.data?.expenses || []).map((item) => ({ ...item })));
        setMasterPlanNo(json.data?.master_plan_no || "");
        setDepartment(json.data?.department_code || "");
      })
      .catch((error) => active && setNotice(error.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedId]);

  const visibleSheets = useMemo(() => sheets.filter((row) => {
    if (masterPlanNo && row.master_plan_no !== masterPlanNo) return false;
    if (department && row.department_code !== department) return false;
    return true;
  }), [sheets, masterPlanNo, department]);
  const departmentOptions = useMemo(() => {
    const rows = planOverview?.rows || sheets;
    return [...new Map(rows.filter((row) => row.departmentCode || row.department_code).map((row) => [
      row.departmentCode || row.department_code,
      row.departmentName || row.department_name || row.departmentCode || row.department_code,
    ])).entries()];
  }, [planOverview, sheets]);

  const materialCost = useMemo(() => materials.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), [materials]);
  const wipCost = useMemo(() => materials.filter((item) => item.item_type === "WIP").reduce((sum, item) => sum + Number(item.total_amount || 0), 0), [materials]);
  const rawCost = materialCost - wipCost;
  const dlCost = expenses.filter((item) => item.expense_type === "DL").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const ohCost = expenses.filter((item) => item.expense_type === "OH").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalCost = materialCost + dlCost + ohCost;
  const unitCost = Number(sheet?.actual_qty) > 0 ? totalCost / Number(sheet.actual_qty) : 0;
  const issues = useMemo(() => validationIssues(sheet, materials, expenses), [sheet, materials, expenses]);
  const selectedPlanRow = useMemo(() => {
    if (!sheet || !planOverview?.rows) return null;
    return planOverview.rows.find((row) => row.skuCode === sheet.sku_code
      && row.productionDate === sheet.production_date
      && (!sheet.department_code || row.departmentCode === sheet.department_code)) || null;
  }, [planOverview, sheet]);

  const updateMaterialQty = (index, value) => {
    const nextQty = Math.max(0, Number(value) || 0);
    setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? {
      ...item,
      qty: nextQty,
      total_amount: nextQty * Number(item.unit_price || 0),
    } : item));
  };

  const updateExpense = (type, value) => {
    const amount = Math.max(0, Number(value) || 0);
    setExpenses((current) => {
      const index = current.findIndex((item) => item.expense_type === type);
      if (index < 0) return [...current, { expense_type: type, description: type === "DL" ? "ค่าแรงงานตรง" : "ค่าใช้จ่ายการผลิต", amount }];
      return current.map((item, rowIndex) => rowIndex === index ? { ...item, amount } : item);
    });
  };

  const updateManualMaterial = (index, field, value) => {
    setMaterials((current) => current.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      const next = { ...item, [field]: value };
      if (["qty", "unit_price"].includes(field)) {
        next[field] = Math.max(0, Number(value) || 0);
        next.total_amount = Number(next.qty || 0) * Number(next.unit_price || 0);
      }
      next.allocation_status = Number(next.qty) > 0
        && Number(next.unit_price) > 0
        && next.item_code && next.item_name && next.lot_no && next.source_doc_ref
        ? "confirmed"
        : "manual_review";
      return next;
    }));
  };

  const addManualWip = () => setMaterials((current) => [...current, {
    item_type: "MANUAL_WIP",
    item_code: "",
    item_name: "",
    lot_no: "",
    qty: 0,
    uom_name: "kg",
    unit_price: 0,
    total_amount: 0,
    source_doc_ref: "",
    allocation_status: "manual_review",
    exception_reason: "ข้อมูล WIP ยังไม่มีในระบบ ต้องกรอกและยืนยันจากเอกสารจริง",
    source_kind: "manual_cost_input",
  }]);

  const fetchExecutiveReport = async ({ sheetId, candidate } = {}) => {
    setReportLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams();
      if (sheetId) params.set("sheetId", sheetId);
      else {
        params.set("skuCode", candidate.skuCode);
        params.set("lotNo", candidate.lotNo);
        params.set("productionDate", candidate.productionDate);
      }
      const response = await fetch(`/api/production-costing/executive-report?${params}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "โหลดโครงสร้างต้นทุนไม่สำเร็จ");
      setExecutiveReport(json.data);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setReportLoading(false);
    }
  };

  const loadReportCandidates = useCallback(async (dateValue) => {
    setCandidateLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom: dateValue, dateTo: dateValue });
      const response = await fetch(`/api/production-costing/candidates?${params}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "โหลดผลผลิตจริงไม่สำเร็จ");
      const rows = json.data || [];
      setCandidates(rows);
      return rows;
    } catch (error) {
      setNotice(error.message);
      setCandidates([]);
      return [];
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  const openExecutiveReport = async () => {
    const dateValue = sheet?.production_date || reportDate;
    setShowExecutiveReport(true);
    setReportDate(dateValue);
    setReportSkuCode(sheet?.sku_code || "");
    setReportLotNo(sheet?.lot_no || "");
    await loadReportCandidates(dateValue);
    if (sheet?.id) await fetchExecutiveReport({ sheetId: sheet.id });
  };

  useEffect(() => {
    if (!initialExecutiveReport || initialReportLoaded.current) return;
    initialReportLoaded.current = true;
    loadReportCandidates(reportDate);
  }, [initialExecutiveReport, loadReportCandidates, reportDate]);

  const searchExecutiveReport = async () => {
    const candidate = candidates.find((row) => row.skuCode === reportSkuCode && row.lotNo === reportLotNo);
    if (!candidate) {
      setNotice("กรุณาเลือกสินค้าและ LOT ผลผลิตจริง");
      return;
    }
    await fetchExecutiveReport({ sheetId: candidate.existingSheet?.id, candidate });
  };

  const changeReportDate = async (dateValue) => {
    setReportDate(dateValue);
    setReportSkuCode("");
    setReportLotNo("");
    setExecutiveReport(null);
    await loadReportCandidates(dateValue);
  };

  const saveStageCosts = async (node, dlAmount, ohAmount) => {
    if (node.costSheetStatus === "closed") return;
    setReportLoading(true);
    try {
      let currentSheet;
      if (node.costSheetId) {
        const currentResponse = await fetch(`/api/production-costing/sheets/${node.costSheetId}`);
        const currentJson = await currentResponse.json();
        if (!currentResponse.ok) throw new Error(currentJson.error || "โหลด Cost Sheet ของช่วงผลิตไม่สำเร็จ");
        currentSheet = currentJson.data;
      } else {
        currentSheet = {
          cost_type: node.type === "FG" ? "FG" : "WIP",
          stage_key: "production_output",
          sku_code: node.code,
          sku_name: node.name,
          lot_no: node.lotNo,
          production_date: node.productionDate || executiveReport.sheet.productionDate,
          master_plan_no: null,
          planned_qty: 0,
          actual_qty: node.qty,
          actual_weight_kg: node.uomName === "kg" ? node.qty : null,
          uom_name: node.uomName || "kg",
          status: "draft",
          materials: [],
          expenses: [],
          notes: "สร้างจากรายงานต้นทุนย้อนกลับ เพื่อบันทึก DL/OH ของช่วงผลิต",
        };
      }
      const expenses = (currentSheet.expenses || []).filter((item) => !["DL", "OH"].includes(item.expense_type));
      expenses.push(
        { expense_type: "DL", description: "ค่าแรงงานตรง", amount: Math.max(0, Number(dlAmount) || 0), uom_name: "บาท", is_auto_fetched: false },
        { expense_type: "OH", description: "ค่าใช้จ่ายการผลิต", amount: Math.max(0, Number(ohAmount) || 0), uom_name: "บาท", is_auto_fetched: false },
      );
      const saveResponse = await fetch(node.costSheetId ? `/api/production-costing/sheets/${node.costSheetId}` : "/api/production-costing/sheets", {
        method: node.costSheetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentSheet, expenses }),
      });
      const saveJson = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saveJson.error || "บันทึก DL/OH ไม่สำเร็จ");
      setNotice(`บันทึก DL/OH ของ ${node.code} LOT ${node.lotNo} แล้ว`);
      const rootSheetId = node.code === executiveReport.sheet.skuCode && node.lotNo === executiveReport.sheet.lotNo
        ? saveJson.data.id
        : executiveReport.sheet.costSheetId;
      await fetchExecutiveReport(rootSheetId
        ? { sheetId: rootSheetId }
        : { candidate: { skuCode: executiveReport.sheet.skuCode, lotNo: executiveReport.sheet.lotNo, productionDate: executiveReport.sheet.productionDate } });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setReportLoading(false);
    }
  };

  const loadStageSheet = async (node) => {
    if (!node.costSheetId) return newStageSheet(node, executiveReport.sheet.productionDate, executiveReport.sheet.masterPlanNo);
    const response = await fetch(`/api/production-costing/sheets/${node.costSheetId}`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "โหลด Cost Sheet ของช่วงผลิตไม่สำเร็จ");
    return json.data;
  };

  const refreshExecutiveReport = async (rootSheetId) => fetchExecutiveReport(rootSheetId
    ? { sheetId: rootSheetId }
    : { candidate: {
      skuCode: executiveReport.sheet.skuCode,
      lotNo: executiveReport.sheet.lotNo,
      productionDate: executiveReport.sheet.productionDate,
    } });

  const resolveCostTreeItem = async ({ stageNode, node, resolution, reason, note, quantity, unitPrice, lotNo: resolvedLot, sourceDoc, confirmed }) => {
    setReportLoading(true);
    setNotice("");
    try {
      const currentSheet = await loadStageSheet(stageNode);
      const materials = (currentSheet.materials?.length ? currentSheet.materials : (stageNode.children || []).map(costTreeNodeToMaterial));
      const index = materials.findIndex((item) => item.item_code === node.code
        && String(item.lot_no || "") === String(node.lotNo || ""));
      const original = index >= 0 ? materials[index] : costTreeNodeToMaterial(node);
      const excluded = ["not_used", "not_related", "indirect_oh"].includes(resolution);
      const qtyValue = excluded ? 0 : Math.max(0, Number(quantity) || Number(node.qty) || 0);
      const unitValue = excluded ? 0 : Math.max(0, Number(unitPrice) || Number(node.unitCost) || 0);
      const sourceKinds = {
        not_used: "exception_not_used",
        not_related: "exception_not_related",
        indirect_oh: "exception_indirect_oh",
        direct_no_lot: "exception_direct_no_lot",
        outside_bom: "exception_outside_bom",
        linked_issue: "exception_linked_issue",
        substitute: "exception_substitute",
        manual_actual: "exception_manual_actual",
      };
      const next = {
        ...original,
        lot_no: resolution === "direct_no_lot" ? null : (resolvedLot || node.lotNo || original.lot_no || null),
        qty: qtyValue,
        unit_price: unitValue,
        total_amount: qtyValue * unitValue,
        source_doc_ref: sourceDoc || node.source || original.source_doc_ref || null,
        linked_cost_sheet_id: node.costSheetId || original.linked_cost_sheet_id || null,
        allocation_status: confirmed ? "confirmed" : "manual_review",
        exception_reason: [reason, note].filter(Boolean).join(" · ") || node.note || null,
        source_kind: sourceKinds[resolution] || "exception_manual_actual",
      };
      if (index >= 0) materials[index] = next;
      else materials.push(next);
      const expenses = [...(currentSheet.expenses || [])];
      if (resolution === "indirect_oh") {
        const amount = Math.max(0, Number(node.totalCost) || qtyValue * unitValue || 0);
        const expenseIndex = expenses.findIndex((item) => item.remark === `exception:${node.code}:${node.lotNo || "no-lot"}`);
        const expense = { expense_type: "OH", description: `วัสดุทางอ้อม ${node.code} ${node.name || ""}`.trim(), amount, uom_name: "บาท", is_auto_fetched: false, remark: `exception:${node.code}:${node.lotNo || "no-lot"}` };
        if (expenseIndex >= 0) expenses[expenseIndex] = expense;
        else expenses.push(expense);
      }
      const endpoint = stageNode.costSheetId ? `/api/production-costing/sheets/${stageNode.costSheetId}` : "/api/production-costing/sheets";
      const response = await fetch(endpoint, {
        method: stageNode.costSheetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentSheet, status: "draft", materials, expenses }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "บันทึกการแก้ไขรายการไม่สำเร็จ");
      const isRoot = stageNode.code === executiveReport.sheet.skuCode && stageNode.lotNo === executiveReport.sheet.lotNo;
      await refreshExecutiveReport(isRoot ? json.data.id : executiveReport.sheet.costSheetId);
      setNotice(`${confirmed ? "ยืนยัน" : "บันทึกแบบร่าง"}รายการ ${node.code} แล้ว`);
    } catch (error) {
      setNotice(error.message);
      throw error;
    } finally {
      setReportLoading(false);
    }
  };

  const confirmExecutiveCost = async (rootNode) => {
    setReportLoading(true);
    setNotice("");
    try {
      const currentSheet = await loadStageSheet(rootNode);
      const response = await fetch(rootNode.costSheetId ? `/api/production-costing/sheets/${rootNode.costSheetId}` : "/api/production-costing/sheets", {
        method: rootNode.costSheetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentSheet,
          status: "closed",
          materials: currentSheet.materials?.length ? currentSheet.materials : (rootNode.children || []).map(costTreeNodeToMaterial),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "ยืนยันต้นทุนไม่สำเร็จ");
      await refreshExecutiveReport(json.data.id);
      setNotice(`ปิดต้นทุน ${rootNode.code} LOT ${rootNode.lotNo} แล้ว`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setReportLoading(false);
    }
  };

  const allocateFromBom = async () => {
    setAllocating(true);
    setNotice("");
    try {
      const response = await fetch("/api/production-costing/allocations/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterPlanNo: sheet.master_plan_no, productionDate: sheet.production_date, skuCode: sheet.sku_code }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "คำนวณจัดสรรจาก BOM ไม่สำเร็จ");
      const preview = json.data;
      const targetProduct = preview.products.find((product) => product.productCode === sheet.sku_code);
      setSheet((current) => ({
        ...current,
        master_plan_no: preview.masterPlanNo,
        planned_qty: targetProduct?.plannedQty ?? current.planned_qty,
      }));
      setMasterPlanNo(preview.masterPlanNo);
      const existing = new Map(materials.map((item) => [`${item.item_code}|${item.lot_no || ""}`, item]));
      const targetRows = preview.allocations.filter((row) => row.productCode === sheet.sku_code).map((row) => {
        const old = existing.get(`${row.materialCode}|${row.lotNo || ""}`) || {};
        const upstream = row.linkedCostSheet;
        const unitPrice = Number(row.unitCost ?? old.unit_price ?? 0);
        const costQty = Number(row.costQty ?? row.allocatedQty);
        return {
          ...old,
          item_type: row.itemType || "RM",
          item_code: row.materialCode,
          item_name: row.materialName,
          lot_no: row.lotNo,
          qty: costQty,
          uom_name: row.costUomName || row.uomName,
          unit_price: unitPrice,
          total_amount: costQty * unitPrice,
          source_doc_ref: row.sourceDocRef,
          linked_cost_sheet_id: upstream?.id || null,
          linked_cost_sheet: upstream || null,
          bom_qty: row.bomRequiredQty,
          issued_qty: row.issuedQty,
          allocation_status: "proposed",
          exception_reason: row.unitCost == null
            ? "ระบบจัดสรรจากยอดเบิกสุทธิตาม BOM แล้ว แต่ยังไม่พบต้นทุน LOT ต้นทาง"
            : "ระบบจัดสรรจากยอดเบิกสุทธิตาม BOM และดึงต้นทุน LOT ต้นทางแล้ว; รอผู้ใช้ตรวจและยืนยัน",
          source_kind: "bom_central_allocation",
        };
      });
      setMaterials(targetRows);
      setAllocationPreview(preview);
      setNotice(preview.canConfirm
        ? `คำนวณข้อเสนอแล้ว ${targetRows.length.toLocaleString("th-TH")} LOT รอตรวจยืนยัน`
        : "ยังยืนยันไม่ได้: ยอดเบิก คืน หรือจัดสรรของกลุ่มผลิตยังกระทบยอดไม่ครบ");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAllocating(false);
    }
  };

  const confirmBomAllocation = () => {
    if (!allocationPreview?.canConfirm) {
      setNotice("ยังยืนยันไม่ได้: ต้องแก้ยอดเบิก คืน หรือรายการที่ไม่ตรง BOM ให้กระทบยอดครบก่อน");
      return;
    }
    setMaterials((current) => current.map((item) => {
      if (item.allocation_status !== "proposed") return item;
      if (item.item_type === "WIP" && !item.linked_cost_sheet_id) {
        return { ...item, allocation_status: "pending_upstream", exception_reason: "ยังไม่ได้ผูก Cost Sheet ของ WIP LOT ต้นทาง" };
      }
      if (Number(item.unit_price) <= 0) {
        return { ...item, allocation_status: "pending_price", exception_reason: "ยังไม่มีต้นทุน LOT ต้นทาง" };
      }
      return { ...item, allocation_status: "confirmed", exception_reason: null };
    }));
    setNotice("ยืนยันปริมาณจัดสรรแล้ว ระบบยังไม่ให้ปิดต้นทุนรายการที่ไม่มีราคา LOT ต้นทาง");
  };

  const save = async (status = "draft") => {
    if (!sheet || saving) return;
    if (status === "closed" && issues.length) {
      setNotice(`ยังปิดต้นทุนไม่ได้: ${issues[0]}`);
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(sheet.id ? `/api/production-costing/sheets/${sheet.id}` : "/api/production-costing/sheets", {
        method: sheet.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sheet, status, materials, expenses }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      setSheet(json.data);
      setSelectedId(json.data.id);
      setMaterials(json.data.materials || []);
      setExpenses(json.data.expenses || []);
      setNotice(status === "closed" ? "ปิดต้นทุนเรียบร้อย" : "บันทึกแบบร่างเรียบร้อย");
      await loadSheets();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  };

  const loadCandidates = async () => {
    setCandidateLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ dateFrom: candidateDateFrom, dateTo: candidateDateTo });
      const response = await fetch(`/api/production-costing/candidates?${params}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "โหลดงานผลิตไม่สำเร็จ");
      setCandidates(json.data || []);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCandidateLoading(false);
    }
  };

  const openCandidatePicker = () => {
    setShowCandidatePicker(true);
    if (!candidates.length) loadCandidates();
  };

  const startCandidate = async (candidate, planRow = null) => {
    if (candidate.existingSheet?.id) {
      setSelectedId(candidate.existingSheet.id);
      setShowCandidatePicker(false);
      return;
    }
    if (!candidate.canStart) return;

    setCandidateLoading(true);
    setNotice("");
    try {
      const draft = {
          cost_type: candidate.costType,
          stage_key: planRow?.sectionName || "production_output",
          sku_code: candidate.skuCode,
          sku_name: candidate.skuName,
          lot_no: candidate.lotNo,
          production_date: planRow?.productionDate || candidate.productionDate,
          master_plan_no: planOverview?.masterPlanNo || masterPlanNo || null,
          department_code: planRow?.departmentCode || null,
          department_name: planRow?.departmentName || null,
          planned_qty: planRow?.plannedQty || 0,
          actual_qty: candidate.actualQty,
          actual_weight_kg: candidate.actualWeightKg || null,
          uom_name: candidate.uomName,
          status: "draft",
          materials: [],
          expenses: [
            { expense_type: "OH", description: "ค่าใช้จ่ายการผลิต", amount: 0, uom_name: "บาท", is_auto_fetched: false },
          ],
          notes: planRow
            ? `สร้างจากแผน ${planOverview?.masterPlanNo || masterPlanNo} / ${planRow.subPlanNo || planRow.planId}; ผลผลิตจริงจาก ${candidate.source || "รายงานรับผลผลิต"}`
            : "สร้างจากผลผลิตจริง; รอผูกแผน/BOM และจัดสรรใบเบิก",
          _planned_uom_name: planRow?.plannedUom || candidate.uomName,
          _bom_materials: planRow?.bomMaterials || [],
        };
      setSelectedId("");
      setSheet(draft);
      setMaterials(draft.materials || []);
      setExpenses(draft.expenses || []);
      setMasterPlanNo(draft.master_plan_no || "");
      setDepartment(draft.department_code || "");
      setActiveStep(2);
      setShowCandidatePicker(false);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCandidateLoading(false);
    }
  };

  const openPlanOutput = (planRow, output) => {
    if (output.existingSheet?.id) {
      setSelectedId(output.existingSheet.id);
      setActiveStep(output.existingSheet.status === "closed" ? 5 : 2);
      return;
    }
    startCandidate(output, planRow);
  };

  const filteredCandidates = useMemo(() => {
    const term = candidateSearch.trim().toUpperCase();
    if (!term) return candidates;
    return candidates.filter((candidate) => [candidate.skuCode, candidate.skuName, candidate.lotNo, candidate.productionDate]
      .some((value) => String(value || "").toUpperCase().includes(term)));
  }, [candidates, candidateSearch]);

  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-hidden border border-slate-200 bg-[#f4f7fb] text-[#102c57] shadow-sm">
      {notice && <div role="status" className={`border-b px-4 py-2 text-xs font-semibold ${notice.includes("เรียบร้อย") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{notice}</div>}
      {!showExecutiveReport && <>
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">คำนวณต้นทุนการผลิต</h1>
          <p className="mt-0.5 text-xs text-slate-500">ตรวจแผน BOM ใบเบิกจริง และผลผลิตจริง ก่อนยืนยันต้นทุนต่อ WIP/FG LOT</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/production-line/costing/estimate" className="inline-flex h-8 items-center gap-1.5 bg-[#d7af20] px-3 font-black text-[#102c57]"><Calculator className="h-4 w-4" />ประมาณการจาก BOM</Link>
          <button type="button" onClick={openExecutiveReport} disabled={reportLoading} className="inline-flex h-8 items-center gap-1.5 bg-[var(--surface-navy,#123663)] px-3 font-bold text-white disabled:opacity-50"><BarChart3 className="h-4 w-4" />{reportLoading ? "กำลังสร้างรายงาน..." : "ต้นทุนตาม FG/WIP LOT"}</button>
          {sheet ? <button type="button" onClick={() => selectMasterPlan(sheet.master_plan_no)} className="h-8 border border-[#075fc4] bg-white px-3 font-bold text-[#075fc4]">กลับภาพรวมแผนหลัก</button>
            : <button type="button" onClick={openCandidatePicker} className="h-8 border border-slate-300 bg-white px-3 font-bold text-slate-600">ค้นหาผลผลิตนอกแผน</button>}
          {sheet && <span className={`border px-2.5 py-1 font-bold ${sheet.status === "closed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            {sheet.status === "closed" ? "ปิดต้นทุนแล้ว" : "แบบร่าง"}
          </span>}
          <span className="text-slate-500">Cost Sheet: <strong className="text-[#102c57]">{sheet?.cost_no || "—"}</strong></span>
        </div>
      </header>

      <Stepper activeStep={activeStep} onChange={setActiveStep} />

      <section className="grid grid-cols-1 gap-2 border-b border-slate-200 bg-white px-4 py-3 md:grid-cols-3 xl:grid-cols-4">
        <label className="text-[11px] font-bold text-slate-600">เลขแผนหลัก<select className={inputClass} value={masterPlanNo} onChange={(event) => selectMasterPlan(event.target.value)}><option value="">เลือกเลขแผนหลัก</option>{masterPlans.map((plan) => <option key={plan.masterPlanNo} value={plan.masterPlanNo}>{plan.masterPlanNo} · {plan.periodStart || "ไม่ระบุวัน"}</option>)}</select></label>
        <label className="text-[11px] font-bold text-slate-600">แผนก<select className={inputClass} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">ทุกแผนก</option>{departmentOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <label className="text-[11px] font-bold text-slate-600">สินค้า / Cost Sheet<select className={inputClass} value={sheet && !sheet.id ? "__draft" : selectedId} onChange={(event) => event.target.value !== "__draft" && setSelectedId(event.target.value)}><option value="">เลือกงานผลิต</option>{sheet && !sheet.id && <option value="__draft">{sheet.sku_code} · {sheet.sku_name}</option>}{visibleSheets.map((row) => <option key={row.id} value={row.id}>{row.sku_code} · {row.sku_name}</option>)}</select></label>
        <label className="text-[11px] font-bold text-slate-600">LOT ที่ผลิต<select className={inputClass} value={sheet && !sheet.id ? "__draft" : selectedId} onChange={(event) => event.target.value !== "__draft" && setSelectedId(event.target.value)}><option value="">เลือก LOT</option>{sheet && !sheet.id && <option value="__draft">{sheet.lot_no}</option>}{visibleSheets.map((row) => <option key={row.id} value={row.id}>{row.lot_no}</option>)}</select></label>
      </section>

      {loading || planLoading ? (
        <div className="flex h-96 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> กำลังโหลดข้อมูลจริง...</div>
      ) : !sheet ? (
        planOverview
          ? <MasterPlanOverview overview={planOverview} department={department} onOpen={openPlanOutput} />
          : <div className="flex h-96 flex-col items-center justify-center gap-2 bg-white text-center"><FileText className="h-10 w-10 text-slate-300" /><strong>เริ่มจากเลือกเลขแผนหลัก</strong><span className="text-xs text-slate-500">ระบบจะแสดงแผนย่อยทุกแผนก ผลผลิตจริงแยก LOT และสถานะต้นทุนในภาพเดียว</span></div>
      ) : (
        <div className="grid min-h-[560px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_310px]">
          <main className="min-w-0 border-r border-slate-200 bg-white">
            {activeStep === 1 && <SelectionStep sheet={sheet} sheets={visibleSheets} onSelect={setSelectedId} />}
            {activeStep === 2 && <PlanStep sheet={sheet} materials={materials} planRow={selectedPlanRow} onNext={() => setActiveStep(3)} />}
            {activeStep === 3 && <><AllocationStep sheet={sheet} materials={materials} updateMaterialQty={updateMaterialQty} rawCost={rawCost} allocating={allocating} preview={allocationPreview} onAllocate={allocateFromBom} onConfirm={confirmBomAllocation} /><ManualMaterialsEditor materials={materials} onAdd={addManualWip} onChange={updateManualMaterial} onRemove={(index) => setMaterials((current) => current.filter((_, rowIndex) => rowIndex !== index))} disabled={sheet.status === "closed"} /></>}
            {activeStep === 4 && <ExpenseStep dlCost={dlCost} ohCost={ohCost} onChange={updateExpense} />}
            {activeStep === 5 && <ReviewStep issues={issues} sheet={sheet} />}
          </main>
          <SummaryPanel sheet={sheet} plannedUom={selectedPlanRow?.plannedUom || sheet._planned_uom_name || sheet.uom_name} rawCost={rawCost} wipCost={wipCost} dlCost={dlCost} ohCost={ohCost} totalCost={totalCost} unitCost={unitCost} issues={issues} />
        </div>
      )}

      {sheet && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-2 text-[11px] text-slate-500"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>ระบบคำนวณจาก LOT และเอกสารที่ผูกกับ Cost Sheet นี้ ผู้ใช้ต้องตรวจยอดจัดสรร ปริมาณผลผลิตจริง และ DL/OH ก่อนปิดต้นทุน</span></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => save("draft")} disabled={saving || sheet.status === "closed"} className="inline-flex h-9 items-center gap-1.5 border border-slate-300 bg-white px-4 text-xs font-bold disabled:opacity-50"><Save className="h-4 w-4" /> บันทึกแบบร่าง</button>
            <button type="button" onClick={() => setActiveStep(5)} className="inline-flex h-9 items-center gap-1.5 border border-[#075fc4] bg-white px-4 text-xs font-bold text-[#075fc4]"><ClipboardCheck className="h-4 w-4" /> ตรวจสอบการจัดสรร</button>
            <button type="button" onClick={() => save("closed")} disabled={saving || sheet.status === "closed" || issues.length > 0} className="inline-flex h-9 items-center gap-1.5 bg-[#075fc4] px-4 text-xs font-bold text-white disabled:bg-slate-300">ยืนยันการจัดสรร <ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      )}
      {showCandidatePicker && <CandidatePicker candidates={filteredCandidates} loading={candidateLoading} search={candidateSearch} setSearch={setCandidateSearch} dateFrom={candidateDateFrom} setDateFrom={setCandidateDateFrom} dateTo={candidateDateTo} setDateTo={setCandidateDateTo} onLoad={loadCandidates} onStart={startCandidate} onClose={() => setShowCandidatePicker(false)} />}
      </>}
      {showExecutiveReport && <ExecutiveCostReport
        report={executiveReport}
        candidates={candidates}
        loading={reportLoading || candidateLoading}
        date={reportDate}
        skuCode={reportSkuCode}
        lotNo={reportLotNo}
        onDateChange={changeReportDate}
        onSkuChange={(value) => { setReportSkuCode(value); setReportLotNo(""); setExecutiveReport(null); }}
        onLotChange={(value) => { setReportLotNo(value); setExecutiveReport(null); }}
        onSearch={searchExecutiveReport}
        onSaveStageCosts={saveStageCosts}
        onResolveItem={resolveCostTreeItem}
        onConfirmCost={confirmExecutiveCost}
        backLabel={returnHref ? "กลับหน้าต้นทุน" : "กลับ Cost Sheet"}
        returnHref={returnHref}
        onClose={() => {
          if (returnHref) {
            window.location.assign(returnHref);
            return;
          }
          setShowExecutiveReport(false);
          setExecutiveReport(null);
        }}
      />}
    </div>
  );
}

function MasterPlanOverview({ overview, department, onOpen }) {
  const rows = (overview.rows || []).filter((row) => !department || row.departmentCode === department);
  const cards = [
    ["งานในแผน", overview.summary.planRows, "รายการ"],
    ["ผลผลิตจริง", overview.summary.outputLots, "LOT"],
    ["ปิดต้นทุนแล้ว", overview.summary.closed, "LOT"],
    ["รอผลผลิตจริง", overview.summary.waitingOutput, "รายการ"],
  ];
  return (
    <div className="bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-base font-black">แผนหลัก {overview.masterPlanNo}</h2><p className="text-xs text-slate-500">{overview.periodStart} ถึง {overview.periodEnd} · เปิด Cost Sheet จากผลผลิตจริงแต่ละ LOT</p></div>
        {overview.summary.problems > 0 && <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">ไม่มี BOM Snapshot {overview.summary.problems} งาน</div>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map(([label, value, unit]) => <div key={label} className="border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-0.5 text-xl font-black tabular-nums">{Number(value || 0).toLocaleString("th-TH")} <span className="text-xs">{unit}</span></div></div>)}
      </div>
      <div className="mt-3 overflow-auto border border-slate-200">
        <table className="min-w-[1180px] w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface-navy,#123663)] text-white">
            <tr><th className="px-3 py-2 text-left">วันที่ผลิต</th><th className="px-3 py-2 text-left">แผนก / แผนย่อย</th><th className="px-3 py-2 text-left">สินค้า</th><th className="px-3 py-2 text-right">ตามแผน</th><th className="px-3 py-2 text-left">LOT ผลผลิตจริง</th><th className="px-3 py-2 text-right">ผลผลิตจริง</th><th className="px-3 py-2 text-center">BOM</th><th className="px-3 py-2 text-center">สถานะต้นทุน</th><th className="px-3 py-2 text-right">ดำเนินการ</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.flatMap((planRow) => (planRow.outputs.length ? planRow.outputs : [null]).map((output, outputIndex) => {
              const sheet = output?.existingSheet;
              const status = sheet?.status === "closed" ? "ปิดแล้ว" : sheet ? "แบบร่าง" : output ? "ยังไม่เริ่ม" : "รอผลผลิต";
              return <tr key={`${planRow.planId}-${output?.key || outputIndex}`} className="hover:bg-blue-50/50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{planRow.productionDate}</td>
                <td className="px-3 py-2"><strong>{planRow.departmentName || planRow.departmentCode || "—"}</strong><div className="text-[11px] text-slate-500">{planRow.subPlanNo || planRow.planId}</div></td>
                <td className="px-3 py-2"><strong>{planRow.skuCode}</strong><div className="max-w-[270px] text-[11px] text-slate-600">{planRow.skuName}</div></td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{qty(planRow.plannedQty)} {planRow.plannedUom}</td>
                <td className="px-3 py-2 font-bold">{output?.lotNo || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{output ? `${qty(output.actualQty)} ${output.uomName}` : "—"}</td>
                <td className="px-3 py-2 text-center"><span className={`px-2 py-1 font-bold ${planRow.hasBomSnapshot ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{planRow.hasBomSnapshot ? "พร้อม" : "ไม่มี Snapshot"}</span></td>
                <td className="px-3 py-2 text-center"><span className={`px-2 py-1 font-bold ${sheet?.status === "closed" ? "bg-emerald-50 text-emerald-700" : output ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{status}</span></td>
                <td className="px-3 py-2 text-right"><button type="button" disabled={!output || !planRow.hasBomSnapshot} onClick={() => onOpen(planRow, output)} className="h-8 bg-[#075fc4] px-3 font-bold text-white disabled:bg-slate-300">{sheet ? "เปิด Cost Sheet" : "เริ่ม Cost Sheet"}</button></td>
              </tr>;
            }))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">LOT ผลผลิตใช้วันที่ในเลข LOT จับกับวันผลิตของแผน ส่วนวันที่รับเข้ายังคงเก็บเป็นหลักฐานต้นทาง</div>
    </div>
  );
}

function ExecutiveCostReport({ report, candidates, loading, date, skuCode, lotNo, onDateChange, onSkuChange, onLotChange, onSearch, onSaveStageCosts, onResolveItem, onConfirmCost, backLabel, returnHref, onClose }) {
  const [selectedException, setSelectedException] = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

  // Clear AI analysis immediately when product, lot, or report changes
  useEffect(() => {
    setAiResult(null);
    setAiError("");
  }, [report?.sheet?.skuCode, report?.sheet?.lotNo, report?.sheet?.productionDate]);

  const runAiAnalysis = async () => {
    if (!report?.sheet) return;
    setAiAnalyzing(true);
    setAiError("");
    try {
      const response = await fetch("/api/production-costing/executive-report/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "วิเคราะห์ AI ไม่สำเร็จ");
      setAiResult(json.data);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiAnalyzing(false);
    }
  };

  const sheet = report?.sheet;
  const control = report?.control;
  const productOptions = [...new Map(candidates.map((item) => [item.skuCode, item.skuName])).entries()];
  const lotOptions = candidates.filter((item) => item.skuCode === skuCode);
  const rootNode = {
    type: sheet?.costType || "FG",
    code: sheet?.skuCode,
    name: sheet?.skuName,
    lotNo: sheet?.lotNo,
    qty: sheet?.actualQty,
    uomName: sheet?.uomName,
    unitCost: sheet?.unitCost,
    totalCost: sheet?.totalCost,
    status: sheet?.status === "closed" ? "actual" : "manual_review",
    source: sheet?.costNo,
    costSheetId: sheet?.costSheetId,
    costSheetStatus: sheet?.status,
    productionDate: sheet?.productionDate,
    dlCost: sheet?.dlCost,
    overheadCost: sheet?.overheadCost,
    children: report?.tree || [],
  };
  const totalItems = report ? countCostTreeItems([rootNode]) : 0;
  const problemItems = report ? control.manualCount + control.sharedCount : 0;
  const completeItems = Math.max(0, totalItems - problemItems);

  return (
    <div className="bg-[#edf3f9] text-[#102c57] print:bg-white">
      <article className="mx-auto min-h-screen max-w-[1800px] bg-white shadow-2xl print:max-w-none print:shadow-none">
        <header className="border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[30px] font-black leading-none tracking-tight">ต้นทุนการผลิตตาม FG LOT</h2>
              <p className="mt-2 text-sm text-slate-500">ติดตามต้นทุนจากผลผลิตจริง ย้อนกลับถึงวัตถุดิบและ WIP ทุกระดับ</p>
            </div>
            <div className="flex gap-2 print:hidden">
              {returnHref && <nav aria-label="หน้าต้นทุนการผลิต" className="flex items-center gap-2">
                <a href="/production-line/costing/estimate" className="inline-flex h-10 items-center gap-2 bg-[#d7af20] px-4 text-sm font-black text-[#102c57]"><Calculator className="h-4 w-4" />ประมาณการจาก BOM</a>
                <a href="/production-line/costing?mode=lot" aria-current="page" className="inline-flex h-10 items-center gap-2 bg-[var(--surface-navy,#123663)] px-4 text-sm font-black text-white"><BarChart3 className="h-4 w-4" />ต้นทุนตาม FG/WIP LOT</a>
              </nav>}
              <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 border border-[#123663] bg-white px-4 text-sm font-black text-[#123663]"><Printer className="h-4 w-4" />พิมพ์รายงาน</button>
              {!returnHref && <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 bg-[var(--surface-navy,#123663)] px-4 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" />{backLabel}</button>}
            </div>
          </div>
          <div className="mt-3 grid gap-3 bg-[#eaf2f9] p-3 lg:grid-cols-[180px_minmax(380px,1.25fr)_minmax(260px,.8fr)_120px]">
            <label className="text-sm font-bold text-slate-600">วันที่ผลิตจริง<input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className={reportInputClass} /></label>
            <label className="text-sm font-bold text-slate-600">เลือก FG / WIP ที่ผลิตเสร็จแล้ว<select value={skuCode} onChange={(event) => onSkuChange(event.target.value)} className={reportInputClass}><option value="">เลือกสินค้า</option>{productOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
            <label className="text-sm font-bold text-slate-600">LOT ผลผลิต<select value={lotNo} onChange={(event) => onLotChange(event.target.value)} className={reportInputClass}><option value="">เลือก LOT</option>{lotOptions.map((item) => <option key={item.key} value={item.lotNo}>{item.lotNo} · {qty(item.actualQty)} {item.uomName}</option>)}</select></label>
            <button type="button" onClick={onSearch} disabled={loading || !skuCode || !lotNo} className="mt-[21px] inline-flex h-11 items-center justify-center gap-2 bg-[#075fc4] px-4 text-sm font-black text-white disabled:bg-slate-300"><Search className="h-4 w-4" />{loading ? "กำลังค้น..." : "ค้นหา"}</button>
          </div>
        </header>

        {!report ? <div className="flex min-h-[650px] flex-col items-center justify-center bg-white text-center"><Search className="h-12 w-12 text-slate-300" /><h3 className="mt-3 text-lg font-black">เลือกวันที่ สินค้า และ LOT ผลผลิตจริง</h3><p className="mt-1 max-w-xl text-xs text-slate-500">ระบบจะแตกต้นทุนย้อนกลับจาก FG/WIP LOT ไปยังวัตถุดิบ WIP ต้นทาง และ RM LOT ตามเอกสารจริง</p>{!loading && candidates.length === 0 && <p className="mt-4 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">ไม่พบผลผลิตจริงในวันที่เลือก</p>}</div> : <>

        <section className="grid min-h-[82px] gap-px border-b border-slate-200 bg-slate-200 lg:grid-cols-[1.45fr_.8fr_.65fr_.8fr_auto]">
          <div className="flex items-center gap-3 bg-white px-5 py-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 bg-contain bg-center bg-no-repeat text-xs font-black text-slate-400" style={sheet.imageUrl ? { backgroundImage: `url(${sheet.imageUrl})` } : undefined}>{sheet.imageUrl ? "" : sheet.costType}</div><div><div className="text-xs font-bold text-slate-500">ผลผลิตที่เลือก</div><div className="text-xl font-black">{sheet.skuCode}</div><div className="text-sm">{sheet.skuName}</div></div></div>
          <div className="bg-white px-5 py-3"><div className="text-xs font-bold text-slate-500">LOT</div><div className="text-lg font-black">{sheet.lotNo}</div><div className="text-xs text-slate-500">วันที่ผลิต {sheet.productionDate}</div></div>
          <div className="bg-white px-5 py-3"><div className="text-xs font-bold text-slate-500">ผลผลิตจริง</div><div className="text-2xl font-black tabular-nums">{qty(sheet.actualQty)} <span className="text-sm">{sheet.uomName}</span></div></div>
          <div className="bg-white px-5 py-3"><div className="text-xs font-bold text-slate-500">Cost Sheet</div><div className="text-sm font-black">{sheet.costNo}</div><div className="text-xs text-slate-500">แผน {sheet.masterPlanNo || "—"}</div></div>
          <div className="flex items-center justify-end gap-2 bg-white px-4 py-3 print:hidden">
            <button
              type="button"
              onClick={runAiAnalysis}
              disabled={loading || aiAnalyzing}
              className="inline-flex h-10 items-center gap-2 border border-purple-600 bg-purple-50 px-3.5 text-sm font-black text-purple-700 hover:bg-purple-100 disabled:opacity-50"
              title="ใช้ Gemini Flash-Lite วิเคราะห์ที่มาของต้นทุนและตรวจจับความผิดปกติ"
            >
              {aiAnalyzing ? <Loader2 className="h-4 w-4 animate-spin text-purple-700" /> : <Sparkles className="h-4 w-4 text-purple-600" />}
              {aiAnalyzing ? "กำลังวิเคราะห์..." : "AI ช่วยวิเคราะห์ต้นทุน"}
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm font-bold"><FileText className="h-4 w-4" />ดูเอกสาร</button>
            <button type="button" onClick={() => onConfirmCost(rootNode)} disabled={loading || control.complete || !control.readyToClose} className="inline-flex h-10 items-center gap-2 bg-[#d7af20] px-4 text-sm font-black disabled:bg-slate-300"><Check className="h-4 w-4" />{control.complete ? "ปิดต้นทุนแล้ว" : "ยืนยันต้นทุน"}</button>
          </div>
        </section>

        {aiResult?.data && (
          <section className="border-b border-slate-300 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-4 print:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--surface-navy,#123663)] text-white shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-[#123663]">ผลการตรวจสอบต้นทุนการผลิต (Cost Audit Verification)</span>
                    <span className={`rounded px-2.5 py-0.5 text-[11px] font-black ${
                      aiResult.data.auditVerdict === "PASS"
                        ? "bg-emerald-700 text-white"
                        : aiResult.data.auditVerdict === "PASS_WITH_REMARKS"
                        ? "bg-amber-600 text-white"
                        : "bg-rose-700 text-white"
                    }`}>
                      {aiResult.data.auditVerdict === "PASS" ? "ผ่านเกณฑ์สมบูรณ์ (PASS)" : aiResult.data.auditVerdict === "PASS_WITH_REMARKS" ? "ผ่านแบบมีเงื่อนไข" : "ไม่ผ่านเกณฑ์ (FAILED)"}
                    </span>
                    {aiResult.data.confidenceScore !== undefined && (
                      <span className="rounded bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 border border-slate-300">
                        ระดับความเชื่อมั่น: {aiResult.data.confidenceScore}%
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1 text-sm font-black text-slate-900">{aiResult.data.headline}</h4>
                  
                  {/* Two columns of deep audit: Mass/Ratio and Timeline/Traceability */}
                  <div className="mt-2.5 grid gap-2.5 md:grid-cols-2 text-xs">
                    {aiResult.data.ratioAndMassAnalysis && (
                      <div className="rounded bg-slate-50 p-2.5 text-slate-900 border border-slate-200">
                        <strong className="text-slate-800 flex items-center gap-1.5 mb-1 font-bold">
                          <Scale className="h-3.5 w-3.5 text-slate-600" />
                          สัดส่วนเนื้อขนมและไส้จริง (Mass Balance Analysis)
                        </strong>
                        <span className="text-slate-700 leading-relaxed block">{aiResult.data.ratioAndMassAnalysis}</span>
                      </div>
                    )}
                    {aiResult.data.timelineAndTraceability && (
                      <div className="rounded bg-slate-50 p-2.5 text-slate-900 border border-slate-200">
                        <strong className="text-slate-800 flex items-center gap-1.5 mb-1 font-bold">
                          <History className="h-3.5 w-3.5 text-slate-600" />
                          สายการผลิตย้อนกลับและลำดับ LOT (Traceability Analysis)
                        </strong>
                        <span className="text-slate-700 leading-relaxed block">{aiResult.data.timelineAndTraceability}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAiResult(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
                title="ปิดบทวิเคราะห์"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3.5 grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-4 text-xs">
              <div className="rounded border border-slate-200 bg-white p-2.5 shadow-sm">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-slate-600" />
                  ปัจจัยต้นทุนหลัก (Cost Driver)
                </span>
                <p className="mt-1.5 text-slate-700 leading-relaxed">{aiResult.data.costDriver || "—"}</p>
              </div>

              <div className="rounded border border-rose-200 bg-rose-50/70 p-2.5">
                <span className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                  รายการที่ขาดราคาต่อหน่วย
                </span>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-rose-900 font-semibold">
                  {aiResult.data.exactMissingCostList?.length
                    ? aiResult.data.exactMissingCostList.map((item, idx) => <li key={idx}>{item}</li>)
                    : <li className="text-emerald-700 font-normal">ครบถ้วนทุกรายการ (ไม่มีตัวขาดราคา)</li>}
                </ul>
              </div>

              <div className="rounded border border-amber-200 bg-amber-50/70 p-2.5">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  ข้อสังเกตจากการตรวจสอบ
                </span>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-amber-900">
                  {aiResult.data.anomaliesDetected?.length
                    ? aiResult.data.anomaliesDetected.map((a, idx) => <li key={idx}>{a}</li>)
                    : <li>ไม่พบความผิดปกติของตัวเลขหรือหน่วยนับ</li>}
                </ul>
              </div>

              <div className="rounded border border-blue-200 bg-blue-50/70 p-2.5">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-blue-700" />
                  สิ่งที่ต้องดำเนินการ (Action Checklist)
                </span>
                <ul className="mt-1.5 list-decimal space-y-1 pl-4 text-blue-950 font-medium">
                  {aiResult.data.actionChecklist?.length
                    ? aiResult.data.actionChecklist.map((act, idx) => <li key={idx}>{act}</li>)
                    : <li>ข้อมูลพร้อมสำหรับกระบวนการปิดต้นทุน</li>}
                </ul>
              </div>
            </div>
          </section>
        )}

        {aiError && (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 print:hidden">
            เกิดข้อผิดพลาดในการวิเคราะห์ AI: {aiError}
          </div>
        )}

        <div className="border-b border-slate-200 bg-[#e8f4fd] px-4 py-2 text-center text-sm font-black text-[#123663]">FG LOT <span className="mx-3">→</span> วัตถุดิบที่ใช้จริง <span className="mx-3">→</span> WIP ต้นทาง <span className="mx-3">→</span> RM LOT <span className="mx-3">→</span> ต้นทุนรวม</div>

        <div className="grid min-h-[560px] lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 border-r border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-navy,#123663)] px-4 py-2.5 text-white">
              <div><h3 className="text-lg font-black">โครงสร้างต้นทุนย้อนกลับ</h3><p className="text-xs text-blue-100">ขยายแต่ละ WIP เพื่อดูวัตถุดิบ LOT ต้นทางและเอกสารอ้างอิง</p></div>
              <div className="flex gap-4 text-xs font-bold"><span className="text-emerald-300">● ครบถ้วน</span><span className="text-amber-300">● ต้องตรวจ</span><span className="text-rose-300">● ข้อมูลไม่ครบ</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] table-fixed border-collapse border border-slate-300 text-[12px] text-[#071b37]">
                <colgroup><col className="w-[72px]" /><col className="w-[58px]" /><col className="w-[92px]" /><col className="w-[20%]" /><col className="w-[120px]" /><col className="w-[82px]" /><col className="w-[70px]" /><col className="w-[84px]" /><col className="w-[152px]" /><col className="w-[84px]" /></colgroup>
                <thead className="sticky top-0 z-10 bg-[#eaf2fa] text-[#071b37]"><tr><th className="border border-slate-300 px-1.5 py-2">ลำดับ</th><th className="border border-slate-300 px-1.5 py-2">ประเภท</th><th className="border border-slate-300 px-1.5 py-2 text-left">รหัสสินค้า</th><th className="border border-slate-300 px-1.5 py-2 text-left">ชื่อสินค้า</th><th className="border border-slate-300 px-1.5 py-2 text-left">LOT / รายละเอียด</th><th className="border border-slate-300 px-1.5 py-2 text-right">ใช้จริงสุทธิ</th><th className="border border-slate-300 px-1.5 py-2">หน่วย</th><th className="border border-slate-300 px-1.5 py-2 text-right">ต้นทุน/หน่วย</th><th className="border border-slate-300 px-1.5 py-2 text-left">เอกสารอ้างอิง</th><th className="border border-slate-300 px-1.5 py-2">สถานะ</th></tr></thead>
                <tbody><CostTreeRows nodes={[rootNode]} depth={0} prefix="" stageNode={rootNode} selectedException={selectedException} onSelectException={setSelectedException} onSaveStageCosts={onSaveStageCosts} onConfirmCost={onConfirmCost} /></tbody>
              </table>
            </div>
          </main>

          <aside className="bg-[#f7f9fc] p-4">
            <div className="border border-[#d7af20] bg-white">
              <h3 className="flex items-center gap-2 bg-[#d7af20] px-4 py-3 text-lg font-black"><Calculator className="h-5 w-5" />สรุปต้นทุนการผลิต</h3>
              <div className="divide-y divide-slate-200 px-4 text-sm">
                <CostSummaryRow label="วัตถุดิบโดยตรง (RM)" value={sheet.directMaterialCost} />
                <CostSummaryRow label="ต้นทุน WIP โอนเข้า" value={sheet.transferredWipCost} />
                <CostSummaryRow label="ค่าแรงงานตรง (DL)" value={sheet.dlCost} />
                {sheet.directLaborSource === "piece_rate" && <div className="py-2 text-[11px] text-sky-700">จากบันทึกชิ้นงาน {sheet.directLaborDocumentCount.toLocaleString("th-TH")} เอกสาร · {sheet.directLaborEmployeeCount.toLocaleString("th-TH")} คน</div>}
                <CostSummaryRow label="ค่าใช้จ่ายการผลิต (OH)" value={sheet.overheadCost} />
              </div>
              <div className="flex items-center justify-between bg-[#f4d264] px-4 py-3 text-base font-black"><span>ต้นทุนรวม</span><span className="tabular-nums">{money(sheet.totalCost)} บาท</span></div>
              <div className="flex items-center justify-between px-4 py-3 text-sm font-black"><span>{control.complete ? "ต้นทุนต่อ" : "ต้นทุนชั่วคราวต่อ"}{sheet.uomName}</span><span className="text-2xl tabular-nums">{money(sheet.unitCost)}</span></div>
            </div>

            <div className="mt-3 border border-slate-200 bg-white">
              <h3 className="flex items-center gap-2 bg-[var(--surface-navy,#123663)] px-4 py-3 text-base font-black text-white"><ClipboardCheck className="h-5 w-5" />ผลการตรวจสอบความถูกต้อง</h3>
              <div className="space-y-2.5 p-4 text-sm">
                <ValidationLine tone="ok" label={`ตรวจครบ ${completeItems.toLocaleString("th-TH")} รายการ`} />
                <ValidationLine tone={problemItems ? "warn" : "ok"} label={`ต้องตรวจ ${problemItems.toLocaleString("th-TH")} รายการ`} />
                <ValidationLine tone={control.sharedCount ? "danger" : "ok"} label={`รอจัดสรรร่วม ${control.sharedCount.toLocaleString("th-TH")} รายการ`} />
                <ValidationLine tone={control.manualCount ? "danger" : "ok"} label={`รอ Cost Sheet/Manual ${control.manualCount.toLocaleString("th-TH")} รายการ`} />
              </div>
            </div>

            <div className="mt-3 border border-slate-200 bg-white p-4 text-sm">
              <h3 className="font-black">ข้อมูลเชื่อมโยง</h3>
              <div className="mt-2 flex justify-between"><span>เปลือกที่พบ</span><strong>{control.shellLots} LOT</strong></div>
              <div className="mt-1 flex justify-between"><span>แยมที่พบ</span><strong>{control.jamLots} LOT</strong></div>
              <div className="mt-1 flex justify-between"><span>รายการทั้งหมด</span><strong>{totalItems} รายการ</strong></div>
            </div>

            {control.warnings.length > 0 && <div className="mt-3 border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><strong>หมายเหตุจากเอกสารจริง</strong><ul className="mt-1 list-disc space-y-1 pl-4">{control.warnings.map((warning, index) => <li key={index}>{warning.source}: {warning.message}</li>)}</ul></div>}
          </aside>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500"><span>ต้นทุนที่ยังไม่ปิด Cost Sheet เป็นข้อมูลรอตรวจสอบและไม่นำไปลงบัญชี</span><span>อัปเดตล่าสุด {new Date(report.generatedAt).toLocaleString("th-TH")}</span></footer>
        {selectedException && <CostExceptionDrawer key={`${selectedException.node.code}-${selectedException.node.lotNo}-${selectedException.sequence}`} selection={selectedException} saving={loading} onClose={() => setSelectedException(null)} onSave={async (payload) => { await onResolveItem(payload); setSelectedException(null); }} />}
        </>}
      </article>
    </div>
  );
}

function countCostTreeItems(nodes) {
  return nodes.reduce((sum, node) => sum + 1 + countCostTreeItems(node.children || []), 0);
}

function CostTreeRows({ nodes, depth, prefix, stageNode, selectedException, onSelectException, onSaveStageCosts, onConfirmCost }) {
  return nodes.map((node, index) => {
    const sequence = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    const parentStage = depth === 0 ? node : stageNode;
    return <CostTreeRow key={`${node.code}-${node.lotNo}-${sequence}-${node.dlCost}-${node.overheadCost}`} node={node} stageNode={parentStage} depth={depth} sequence={sequence} selectedException={selectedException} onSelectException={onSelectException} onSaveStageCosts={onSaveStageCosts} onConfirmCost={onConfirmCost} />;
  });
}

function CostTreeRow({ node, stageNode, depth, sequence, selectedException, onSelectException, onSaveStageCosts, onConfirmCost }) {
  const [open, setOpen] = useState(depth < 2);
  const [costEditorOpen, setCostEditorOpen] = useState(false);
  const [dlCost, setDlCost] = useState(Number(node.dlCost) > 0 ? Number(node.dlCost) : "");
  const [ohCost, setOhCost] = useState(Number(node.overheadCost || 0));
  const hasChildren = node.children?.length > 0;
  const isCostStage = ["FG", "WIP"].includes(node.type);
  const editableStage = Boolean(node.code && node.lotNo) && node.costSheetStatus !== "closed";
  const problem = ["manual_required", "missing_cost"].includes(node.status);
  const warning = ["shared_pending", "manual_review", "pending", "proposed"].includes(node.status);
  const rowTone = problem ? "bg-rose-50" : warning ? "bg-amber-50" : depth === 0 ? "bg-blue-50" : "even:bg-slate-50/50";
  const statusLabel = problem ? "ข้อมูลไม่ครบ" : warning ? "ต้องตรวจ" : "ครบถ้วน";
  const statusTone = problem ? "text-rose-700" : warning ? "text-amber-700" : "text-emerald-700";
  const typeTone = node.type === "FG" ? "bg-blue-600 text-white" : node.type === "WIP" || node.type === "MANUAL_WIP" ? "bg-amber-100 text-amber-900" : node.type === "PACKAGING" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800";
  const usage = resolveCostTreeUsage(node);
  const cellClass = "border border-slate-300 px-1.5 py-1.5 align-middle";
  const selected = selectedException?.sequence === sequence;
  const clickable = depth > 0 && (problem || warning);
  const stageReady = isCostStage && !treeHasUnresolved(node.children || []);
  return <>
    <tr onClick={clickable ? () => onSelectException({ node, stageNode, sequence }) : undefined} className={`${rowTone} text-[#071b37] ${clickable ? "cursor-pointer hover:outline hover:outline-2 hover:outline-blue-500" : ""} ${selected ? "relative z-[1] outline outline-2 outline-blue-600" : ""}`}>
      <td className={`${cellClass} text-center font-semibold`}><div className="flex items-center justify-end gap-1" style={{ paddingLeft: `${Math.min(depth, 4) * 3}px` }}><span>{sequence}</span>{hasChildren ? <button type="button" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-slate-400 bg-white text-xs font-black" aria-label={open ? `ยุบ ${node.name}` : `ขยาย ${node.name}`}>{open ? "−" : "+"}</button> : <span className="h-5 w-5" />}</div></td>
      <td className={`${cellClass} text-center`}><span className={`inline-flex min-h-5 min-w-10 items-center justify-center px-1.5 py-0.5 text-[10px] font-black ${typeTone}`}>{node.type}</span></td>
      <td className={`${cellClass} font-black`}>{node.code || "—"}</td>
      <td className={cellClass}><div className={`${depth > 0 ? "border-l-2 border-slate-300" : ""} font-bold leading-[1.25]`} style={{ paddingLeft: `${Math.min(depth, 5) * 7}px` }}><span className="block text-[11px]">{node.name || "รอระบุชื่อ"}</span>{node.note && <span className={`mt-0.5 block text-[9px] leading-tight ${problem ? "text-rose-700" : "text-amber-700"}`}>{node.note}</span>}</div></td>
      <td className={cellClass}><strong>{node.lotNo || "—"}</strong>{isCostStage && <button type="button" onClick={(event) => { event.stopPropagation(); setCostEditorOpen((value) => !value); }} className="mt-0.5 block text-[9px] font-bold text-[#075fc4] underline">DL {Number(node.dlCost) > 0 ? money(node.dlCost) : "—"} · OH {money(node.overheadCost)}</button>}</td>
      <td className={`${cellClass} text-right font-black tabular-nums`}>{qty(usage.displayQty)}{usage.baseQty != null && <span className="block whitespace-nowrap text-[9px] font-semibold">= {qty(usage.baseQty)} kg</span>}</td>
      <td className={`${cellClass} text-center font-semibold`}>{usage.displayUom || "—"}</td>
      <td className={`${cellClass} text-right font-semibold tabular-nums`}>{node.unitCost == null ? "—" : unitMoney(node.unitCost)}</td>
      <td className={`${cellClass} text-[10px] leading-tight`}><span className="block">ใบเบิก: {node.source || "ไม่มี"}</span><span className="block">ใบคืน: {node.returnDocRefs?.length ? node.returnDocRefs.join(", ") : "ไม่มี"}</span>{node.costSource && <span className="block font-bold text-blue-700">ต้นทุน: รับเข้าผลิต {node.costSource}</span>}{node.grossQty > 0 && <span className="block">เบิก {qty(node.grossQty)} · คืน {qty(node.returnQty)} · สุทธิ {qty(Math.max(0, node.grossQty - node.returnQty))} {compactIssueUnit(node.sourceUomName)}</span>}</td>
      <td className={`${cellClass} text-center text-[10px] font-black ${statusTone}`}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${problem ? "bg-rose-500" : warning ? "bg-amber-500" : "bg-emerald-500"}`} />{statusLabel}</td>
    </tr>
    {costEditorOpen && isCostStage && <tr className="border-b border-blue-200 bg-blue-50"><td colSpan={10} className="px-4 py-3"><div className="ml-auto grid max-w-3xl gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"><label className="text-[10px] font-bold">ค่าแรงตรง (DL) ของช่วง {node.code}<input type="number" min="0" step="0.01" value={dlCost} onChange={(event) => setDlCost(event.target.value)} disabled={!editableStage} className={`${inputClass} mt-1 text-right`} /></label><label className="text-[10px] font-bold">ค่าใช้จ่ายผลิต (OH) ของช่วง {node.code}<input type="number" min="0" step="0.01" value={ohCost} onChange={(event) => setOhCost(event.target.value)} disabled={!editableStage} className={`${inputClass} mt-1 text-right`} /></label><button type="button" onClick={() => onSaveStageCosts(node, dlCost, ohCost)} disabled={!editableStage} className="mt-[15px] h-9 border border-[#075fc4] bg-white px-3 text-[10px] font-black text-[#075fc4] disabled:border-slate-300 disabled:text-slate-400">บันทึก DL/OH</button><button type="button" onClick={() => onConfirmCost(node)} disabled={!editableStage || !stageReady} title={!stageReady ? "แก้รายการที่ต้องตรวจก่อน" : ""} className="mt-[15px] h-9 bg-[#d7af20] px-3 text-[10px] font-black disabled:bg-slate-300">{node.costSheetStatus === "closed" ? "ปิดต้นทุนแล้ว" : "ยืนยันต้นทุนช่วงนี้"}</button></div></td></tr>}
    {open && hasChildren && <CostTreeRows nodes={node.children} depth={depth + 1} prefix={sequence} stageNode={isCostStage ? node : stageNode} selectedException={selectedException} onSelectException={onSelectException} onSaveStageCosts={onSaveStageCosts} onConfirmCost={onConfirmCost} />}
  </>;
}

function treeHasUnresolved(nodes) {
  return nodes.some((node) => ["manual_required", "missing_cost", "manual_review", "shared_pending", "pending", "proposed"].includes(node.status)
    || treeHasUnresolved(node.children || []));
}

function CostExceptionDrawer({ selection, saving, onClose, onSave }) {
  const { node, stageNode } = selection;
  const noIssue = !node.source && (Number(node.qty) <= 0 || String(node.note || "").includes("ไม่พบในใบเบิก"));
  const outsideBom = String(node.note || "").includes("ไม่อยู่ใน BOM") || String(node.note || "").includes("ไม่ตรง BOM");
  const noLot = !node.lotNo && !noIssue;
  const options = noIssue ? [
    ["not_used", "ไม่ได้ใช้จริง", "เก็บรายการ BOM ไว้ แต่ไม่คิดต้นทุนใน LOT นี้"],
    ["linked_issue", "ผูกใบเบิกอื่น", "ระบุเลขเอกสาร LOT ปริมาณ และต้นทุนจริง"],
    ["substitute", "ใช้รหัสทดแทน", "ยืนยันว่ารายการเบิกอื่นใช้แทนวัตถุดิบนี้"],
  ] : outsideBom ? [
    ["outside_bom", "คิดเป็นต้นทุนตรง", "รับรายการเบิกนี้เข้าต้นทุนของ LOT"],
    ["not_related", "ไม่เกี่ยวข้องกับงานนี้", "ตัดออกจากต้นทุนและบันทึกเหตุผล"],
    ["indirect_oh", "คิดเป็นวัสดุทางอ้อม (OH)", "ย้ายมูลค่าไปรวมค่าใช้จ่ายการผลิต"],
  ] : noLot ? [
    ["direct_no_lot", "วัสดุจิปาถะ ไม่มี LOT", "ใช้เอกสารเบิกเป็นหลักฐานและคิดต้นทุนตรง"],
    ["not_related", "ไม่เกี่ยวข้องกับงานนี้", "ตัดออกจากต้นทุนและบันทึกเหตุผล"],
    ["indirect_oh", "คิดเป็นวัสดุทางอ้อม (OH)", "ย้ายมูลค่าไปรวมค่าใช้จ่ายการผลิต"],
  ] : [
    ["manual_actual", "ยืนยันข้อมูลจริง", "แก้ปริมาณ LOT และต้นทุนจากหลักฐานจริง"],
    ["not_related", "ไม่เกี่ยวข้องกับงานนี้", "ตัดออกจากต้นทุนและบันทึกเหตุผล"],
    ["indirect_oh", "คิดเป็นวัสดุทางอ้อม (OH)", "ย้ายมูลค่าไปรวมค่าใช้จ่ายการผลิต"],
  ];
  const [resolution, setResolution] = useState(options[0][0]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(String(node.qty || node.grossQty || ""));
  const [unitPrice, setUnitPrice] = useState(String(node.unitCost || ""));
  const [resolvedLot, setResolvedLot] = useState(node.lotNo || "");
  const [sourceDoc, setSourceDoc] = useState(node.source || "");
  const [error, setError] = useState("");
  const excluded = ["not_used", "not_related", "indirect_oh"].includes(resolution);
  const needsLot = !excluded && resolution !== "direct_no_lot";
  const valid = reason.trim() && (excluded || (Number(quantity) > 0 && Number(unitPrice) > 0 && sourceDoc.trim() && (!needsLot || resolvedLot.trim())));
  const payload = { stageNode, node, resolution, reason: reason.trim(), note: note.trim(), quantity, unitPrice, lotNo: resolvedLot.trim(), sourceDoc: sourceDoc.trim() };
  const submit = async (confirmed) => {
    setError("");
    if (confirmed && !valid) {
      setError("กรอกเหตุผลและข้อมูลอ้างอิงที่จำเป็นให้ครบ");
      return;
    }
    try {
      await onSave({ ...payload, confirmed });
    } catch (saveError) {
      setError(saveError.message);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/20 print:hidden" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-slate-300 bg-white text-[#071b37] shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-300 bg-[var(--surface-navy,#123663)] px-5 py-4 text-white">
          <div><div className="text-[11px] font-bold text-blue-200">แก้ไขรายการที่ต้องตรวจ · {selection.sequence}</div><h3 className="mt-1 text-xl font-black">{node.code}</h3><p className="mt-0.5 max-w-[390px] text-sm font-semibold leading-snug">{node.name}</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center border border-white/40" aria-label="ปิด"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-slate-300 p-4">
            <h4 className="text-sm font-black">หลักฐานที่ระบบพบ</h4>
            <div className="mt-3 grid grid-cols-2 border border-slate-300 text-xs">
              <div className="border-r border-slate-300 bg-slate-50 p-3"><span className="text-slate-500">BOM ของ {stageNode.code}</span><strong className="mt-1 block">{noIssue ? "มีในสูตรมาตรฐาน" : outsideBom ? "ไม่พบรหัสนี้" : "มีรายการอ้างอิง"}</strong><span className="mt-1 block">จำนวน {node.qty ? qty(node.qty) : "—"} {node.uomName || ""}</span></div>
              <div className="p-3"><span className="text-slate-500">ใบเบิก / ใบคืนจริง</span><strong className={`mt-1 block ${node.source ? "text-emerald-700" : "text-rose-700"}`}>{node.source || "ไม่พบใบเบิก"}</strong><span className="mt-1 block">คืน {node.returnDocRefs?.length ? node.returnDocRefs.join(", ") : "ไม่มี"}</span></div>
            </div>
            {node.note && <div className="mt-2 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{node.note}</div>}
          </section>

          <section className="border-b border-slate-300 p-4">
            <h4 className="text-sm font-black">เลือกวิธีจัดการ</h4>
            <div className="mt-2 space-y-2">
              {options.map(([value, label, description]) => <label key={value} className={`flex cursor-pointer gap-3 border p-3 ${resolution === value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-300"}`}><input type="radio" name="cost-resolution" value={value} checked={resolution === value} onChange={() => setResolution(value)} className="mt-0.5 h-4 w-4" /><span><strong className="block text-sm">{label}</strong><span className="mt-0.5 block text-xs text-slate-600">{description}</span></span></label>)}
            </div>
          </section>

          {!excluded && <section className="grid grid-cols-2 gap-3 border-b border-slate-300 p-4">
            <label className="text-xs font-bold">เลขเอกสารใบเบิก<input value={sourceDoc} onChange={(event) => setSourceDoc(event.target.value)} className={`${inputClass} mt-1`} placeholder="เช่น XA6908/0027" /></label>
            {resolution !== "direct_no_lot" && <label className="text-xs font-bold">LOT<input value={resolvedLot} onChange={(event) => setResolvedLot(event.target.value)} className={`${inputClass} mt-1`} placeholder="LOT วัตถุดิบ / WIP" /></label>}
            <label className="text-xs font-bold">ใช้จริงสุทธิ<input type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={`${inputClass} mt-1 text-right`} /></label>
            <label className="text-xs font-bold">ต้นทุนต่อหน่วย<input type="number" min="0" step="0.0001" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className={`${inputClass} mt-1 text-right`} /></label>
          </section>}

          <section className="p-4">
            <label className="text-xs font-bold">เหตุผลที่เลือกวิธีนี้ <span className="text-rose-600">*</span><select value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} mt-1`}><option value="">เลือกเหตุผล</option><option value="ยืนยันจากเอกสารจริง">ยืนยันจากเอกสารจริง</option><option value="หน้างานไม่ได้ใช้รายการนี้">หน้างานไม่ได้ใช้รายการนี้</option><option value="ใช้วัสดุทดแทนที่อนุมัติแล้ว">ใช้วัสดุทดแทนที่อนุมัติแล้ว</option><option value="เป็นวัสดุสิ้นเปลืองไม่มี LOT">เป็นวัสดุสิ้นเปลืองไม่มี LOT</option><option value="เป็นค่าใช้จ่ายการผลิตทางอ้อม">เป็นค่าใช้จ่ายการผลิตทางอ้อม</option></select></label>
            <label className="mt-3 block text-xs font-bold">หมายเหตุเพิ่มเติม<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none border border-slate-300 p-2 text-xs outline-none focus:border-blue-500" /></label>
            <div className="mt-3 border border-[#d7af20] bg-amber-50 p-3 text-sm"><div className="flex justify-between"><span className="font-bold">ผลต่อต้นทุนรายการนี้</span><strong>{excluded ? "0.00" : money(Number(quantity) * Number(unitPrice))} บาท</strong></div><div className="mt-1 text-xs text-slate-600">{resolution === "indirect_oh" ? "บันทึกเป็น OH" : excluded ? "ไม่นำเข้าต้นทุนตรง" : `ใช้จริง ${qty(quantity)} ${node.uomName || "หน่วย"} × ${money(unitPrice)}`}</div></div>
            {error && <div className="mt-3 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div>}
          </section>
        </div>
        <footer className="grid grid-cols-[auto_1fr_1.2fr] gap-2 border-t border-slate-300 bg-slate-50 p-4">
          <button type="button" onClick={onClose} className="h-10 border border-slate-400 bg-white px-4 text-xs font-black">ยกเลิก</button>
          <button type="button" onClick={() => submit(false)} disabled={saving} className="h-10 border border-[#123663] bg-white px-3 text-xs font-black text-[#123663] disabled:opacity-50">บันทึกแบบร่าง</button>
          <button type="button" onClick={() => submit(true)} disabled={saving || !valid} className="h-10 bg-[#d7af20] px-3 text-xs font-black disabled:bg-slate-300">ยืนยันรายการ</button>
        </footer>
      </aside>
    </div>
  );
}

function CostSummaryRow({ label, value }) {
  return <div className="flex items-center justify-between py-3"><span>{label}</span><strong className="tabular-nums">{money(value)} บาท</strong></div>;
}

function ValidationLine({ tone, label }) {
  const styles = tone === "danger" ? "bg-rose-500 text-rose-700" : tone === "warn" ? "bg-amber-500 text-amber-700" : "bg-emerald-500 text-emerald-700";
  return <div className={`flex items-center gap-2 font-bold ${styles.split(" ")[1]}`}><span className={`inline-block h-3 w-3 rounded-full ${styles.split(" ")[0]}`} />{label}</div>;
}

function CandidatePicker({ candidates, loading, search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo, onLoad, onStart, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-base font-black">เลือกงานผลิตจากข้อมูลจริง</h2><p className="mt-0.5 text-xs text-slate-500">ระบบค้นจากรายการรับผลผลิตจากใบชั่งและป้ายแยม แล้วนำรหัสสินค้า วันที่ ปริมาณ และ LOT ที่มีอยู่มาให้เลือก</p></div>
          <button type="button" onClick={onClose} className="h-8 border border-slate-300 px-3 text-xs font-bold">ปิด</button>
        </div>
        <div className="grid gap-2 border-b border-slate-200 bg-slate-50 p-3 md:grid-cols-[150px_150px_minmax(220px,1fr)_auto]">
          <label className="text-[11px] font-bold">จากวันที่<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputClass} /></label>
          <label className="text-[11px] font-bold">ถึงวันที่<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputClass} /></label>
          <label className="text-[11px] font-bold">ค้นหางานผลิต<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="รหัสสินค้า ชื่อสินค้า หรือ LOT" className={inputClass} /></label>
          <button type="button" onClick={onLoad} disabled={loading} className="mt-[15px] h-9 bg-[#ddb51f] px-5 text-xs font-black text-[#102c57] disabled:opacity-50">{loading ? "กำลังค้น..." : "ค้นหา"}</button>
        </div>
        <div className="flex flex-wrap gap-4 border-b border-slate-200 px-4 py-2 text-[11px]"><span className="font-bold text-emerald-700"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />อัตโนมัติจากเอกสารจริง</span><span className="font-bold text-amber-700"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />ต้องเลือก/ยืนยันก่อนปิดต้นทุน</span></div>
        <div className="min-h-64 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] table-fixed text-[11px]">
            <thead className="sticky top-0 bg-[var(--surface-navy,#123663)] text-white"><tr><th className="w-24 px-2 py-2 text-left">วันที่ผลิต</th><th className="w-16 px-2 py-2">ประเภท</th><th className="w-36 px-2 py-2 text-left">สินค้า</th><th className="px-2 py-2 text-left">ชื่อสินค้า</th><th className="w-36 px-2 py-2">LOT ผลผลิต</th><th className="w-28 px-2 py-2 text-right">ผลผลิตจริง</th><th className="w-48 px-2 py-2 text-left">ข้อมูลอัตโนมัติ</th><th className="w-48 px-2 py-2 text-left">ยังต้องยืนยัน</th><th className="w-32 px-2 py-2" /></tr></thead>
            <tbody>
              {candidates.map((candidate) => <tr key={candidate.key} className="border-b border-slate-200 even:bg-slate-50/60"><td className="px-2 py-2">{candidate.productionDate}</td><td className="px-2 py-2 text-center"><span className={`px-1.5 py-0.5 font-black ${candidate.costType === "WIP" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>{candidate.costType}</span></td><td className="px-2 py-2 font-black">{candidate.skuCode}</td><td className="px-2 py-2 font-semibold">{candidate.skuName}</td><td className={`px-2 py-2 text-center font-black ${candidate.lotNo ? "text-[#102c57]" : "text-amber-700"}`}>{candidate.lotNo || "ยังไม่มี LOT"}</td><td className="px-2 py-2 text-right font-black tabular-nums">{qty(candidate.actualQty)} {candidate.uomName}</td><td className="px-2 py-2 text-emerald-700">{candidate.automaticFields.join(" · ")}</td><td className="px-2 py-2 text-amber-700">{candidate.confirmationFields.join(" · ")}</td><td className="px-2 py-2 text-center">{candidate.existingSheet ? <button type="button" onClick={() => onStart(candidate)} className="border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700">เปิด {candidate.existingSheet.cost_no}</button> : <button type="button" onClick={() => onStart(candidate)} disabled={!candidate.canStart || loading} title={candidate.blockedReason || ""} className="bg-[#075fc4] px-3 py-1.5 font-bold text-white disabled:bg-slate-300">เริ่ม Cost Sheet</button>}</td></tr>)}
              {!loading && !candidates.length && <tr><td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-500">ไม่พบงานผลิตจริงในช่วงวันที่เลือก</td></tr>}
              {loading && <tr><td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังอ่านรายการรับผลผลิตจากใบชั่งและป้ายแยม...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">FG ที่รายงานยังไม่มี LOT จะถูกแสดงเพื่อให้เห็นงาน แต่ระบบไม่อนุญาตให้เริ่ม Cost Sheet จนกว่าจะมี LOT ผลผลิตจริง</div>
      </div>
    </div>
  );
}

function SelectionStep({ sheet, sheets, onSelect }) {
  return <div className="p-4"><h2 className="text-sm font-black">1. เลือกงานผลิตที่ต้องการคิดต้นทุน</h2><div className="mt-3 overflow-hidden border border-slate-200"><table className="w-full text-xs"><thead className="bg-[var(--surface-navy,#123663)] text-white"><tr><th className="px-3 py-2 text-left">Cost Sheet</th><th className="px-3 py-2 text-left">สินค้า</th><th className="px-3 py-2 text-left">LOT</th><th className="px-3 py-2 text-left">แผนหลัก</th><th className="px-3 py-2">สถานะ</th></tr></thead><tbody>{sheets.map((row) => <tr key={row.id} onClick={() => onSelect(row.id)} className={`cursor-pointer border-t border-slate-200 ${row.id === sheet.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><td className="px-3 py-2 font-bold">{row.cost_no}</td><td className="px-3 py-2">{row.sku_code} · {row.sku_name}</td><td className="px-3 py-2">{row.lot_no}</td><td className="px-3 py-2">{row.master_plan_no || "—"}</td><td className="px-3 py-2 text-center">{row.status === "closed" ? "ปิดแล้ว" : "แบบร่าง"}</td></tr>)}</tbody></table></div></div>;
}

function PlanStep({ sheet, materials, planRow, onNext }) {
  const bomMaterials = planRow?.bomMaterials || sheet._bom_materials || [];
  const plannedUom = planRow?.plannedUom || sheet._planned_uom_name || sheet.uom_name;
  return <div className="p-4"><h2 className="text-sm font-black">2. ตรวจแผนและ BOM</h2><p className="mt-1 text-xs text-slate-500">ตรวจสูตรมาตรฐานจาก snapshot ของแผนก่อนนำใบเบิกจริงมาจัดสรร</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="แผนหลัก" value={sheet.master_plan_no || "ยังไม่ผูกแผน"} /><Info label="ผลผลิต" value={`${sheet.sku_code} · ${sheet.sku_name}`} /><Info label="จำนวนตามแผน" value={`${qty(sheet.planned_qty)} ${plannedUom}`} /></div><div className="mt-4 overflow-hidden border border-slate-200"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs"><strong>BOM Snapshot {bomMaterials.length.toLocaleString("th-TH")} รายการ</strong><span className="text-slate-500">รายการจัดสรรแล้ว {materials.length.toLocaleString("th-TH")} รายการ</span></div>{bomMaterials.length ? <div className="max-h-[360px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-[var(--surface-navy,#123663)] text-white"><tr><th className="px-3 py-2 text-left">Trade Code</th><th className="px-3 py-2 text-left">วัตถุดิบ / WIP</th><th className="px-3 py-2 text-right">ตาม BOM</th><th className="px-3 py-2 text-right">ยอดเบิกใน Snapshot</th><th className="px-3 py-2 text-left">หน่วย</th></tr></thead><tbody>{bomMaterials.map((item) => <tr key={item.key} className="border-b border-slate-200 even:bg-slate-50"><td className="whitespace-nowrap px-3 py-2 font-bold">{item.goodsCode || item.skuCode || "—"}</td><td className="px-3 py-2">{item.name}</td><td className="px-3 py-2 text-right tabular-nums">{qty(item.requiredQty)}</td><td className="px-3 py-2 text-right tabular-nums">{qty(item.issueQty)}</td><td className="whitespace-nowrap px-3 py-2">{item.uomName || "—"}</td></tr>)}</tbody></table></div> : <div className="p-4 text-xs text-amber-700">แผนนี้ไม่มี BOM Snapshot จึงยังจัดสรรต้นทุนไม่ได้</div>}</div><div className="mt-4 flex justify-end"><button type="button" onClick={onNext} disabled={!bomMaterials.length} className="h-9 bg-[#075fc4] px-4 text-xs font-bold text-white disabled:bg-slate-300">ไปจัดสรรวัตถุดิบ <ChevronRight className="ml-1 inline h-4 w-4" /></button></div></div>;
}

function AllocationStep({ sheet, materials, updateMaterialQty, rawCost, allocating, preview, onAllocate, onConfirm }) {
  const unmatchedIssues = preview?.unmatchedIssues || [];
  return <div><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><div><h2 className="text-sm font-black">3. จัดสรรวัตถุดิบให้ LOT ที่ผลิต</h2><p className="text-[11px] text-slate-500">ยอดเบิกจริงหักใบคืนแต่ละ LOT × สัดส่วนความต้องการจาก BOM ของทุกสินค้าที่ผลิตร่วมกัน</p></div><div className="flex items-center gap-2"><button type="button" onClick={onAllocate} disabled={allocating || sheet.status === "closed"} className="h-8 bg-[#ddb51f] px-3 text-[11px] font-black disabled:opacity-50">{allocating ? "กำลังคำนวณ..." : "คำนวณจัดสรรจาก BOM"}</button>{materials.some((item) => item.allocation_status === "proposed") && <button type="button" onClick={onConfirm} disabled={!preview?.canConfirm} title={!preview?.canConfirm ? "ยอดเบิก คืน และจัดสรรยังกระทบยอดไม่ครบ" : ""} className="h-8 bg-emerald-600 px-3 text-[11px] font-black text-white disabled:bg-slate-300">ยืนยันยอดจัดสรร</button>}<span className="bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{sheet.sku_code} · LOT {sheet.lot_no}</span></div></div>{preview && <div className="grid gap-px border-b border-slate-200 bg-slate-200 text-[11px] sm:grid-cols-3 xl:grid-cols-7"><Info label="สินค้าที่ผลิตร่วม" value={`${preview.products.length} รายการ`} /><Info label="เอกสารจาก Preview" value={preview.previewDocuments?.length ? preview.previewDocuments.join(", ") : "ไม่มีเลขเอกสารเก่า"} /><Info label="ใบเบิกจริง ERP" value={preview.documents.join(", ")} /><Info label="ใบคืนจริง ERP" value={preview.returnDocuments.length ? preview.returnDocuments.join(", ") : "ไม่มี"} /><Info label="กระทบยอด" value={preview.canConfirm ? "ครบ พร้อมยืนยัน" : "ยังไม่ครบ"} /><Info label="เบิกจริงไม่ตรง BOM" value={`${unmatchedIssues.length} รายการ`} /><Info label="รหัสที่จับคู่" value={preview.aliases.length ? preview.aliases.join(", ") : "ไม่มี"} /></div>}<div className="overflow-x-auto"><table className="w-full min-w-[980px] table-fixed text-[11px]"><thead className="bg-[var(--surface-navy,#123663)] text-white"><tr><th className="w-10 px-2 py-2">#</th><th className="w-28 px-2 py-2 text-left">Trade Code</th><th className="px-2 py-2 text-left">ชื่อวัตถุดิบ</th><th className="w-28 px-2 py-2">LOT</th><th className="w-24 px-2 py-2 text-right">เบิกสุทธิรวม</th><th className="w-24 px-2 py-2 text-right">ตาม BOM</th><th className="w-28 px-2 py-2 text-right">จัดสรรหน่วยหลัก</th><th className="w-24 px-2 py-2 text-right">ต้นทุน/หน่วย</th><th className="w-28 px-2 py-2 text-right">มูลค่า</th><th className="w-32 px-2 py-2">สถานะ</th></tr></thead><tbody>{materials.map((item, index) => { const status = materialStatus(item); return <tr key={item.id || `${item.item_code}-${item.lot_no}-${index}`} title={item.exception_reason || ""} className="border-b border-slate-200 even:bg-slate-50/60"><td className="px-2 py-2 text-center text-slate-400">{index + 1}</td><td className="px-2 py-2 font-bold">{item.item_code}</td><td className="px-2 py-2"><span className="mr-1 border border-slate-200 bg-slate-100 px-1 text-[9px] font-bold">{item.item_type}</span>{item.item_name}{item.exception_reason && <div className="mt-0.5 text-[10px] text-amber-700">{item.exception_reason}</div>}</td><td className="px-2 py-2 text-center font-semibold">{item.lot_no || "—"}</td><td className="px-2 py-2 text-right tabular-nums">{item.issued_qty == null ? "—" : qty(item.issued_qty)}</td><td className="px-2 py-2 text-right tabular-nums">{item.bom_qty == null ? "—" : qty(item.bom_qty)}</td><td className="px-2 py-1.5"><input type="number" min="0" step="0.0001" value={item.qty} onChange={(event) => updateMaterialQty(index, event.target.value)} disabled={sheet.status === "closed"} className="h-7 w-full border border-blue-200 bg-blue-50 px-1.5 text-right font-bold tabular-nums outline-none disabled:border-transparent disabled:bg-transparent" /></td><td className="px-2 py-2 text-right font-semibold tabular-nums">{unitMoney(item.unit_price)}</td><td className="px-2 py-2 text-right font-black tabular-nums">{money(item.total_amount)}</td><td className={`px-2 py-2 text-center font-bold ${status.ok ? "text-emerald-700" : "text-amber-700"}`}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${status.ok ? "bg-emerald-500" : "bg-amber-500"}`} />{status.label}</td></tr>; })}{unmatchedIssues.map((item, index) => <tr key={`unmatched-${item.materialCode}-${item.lotNo}-${item.sourceDocRef}-${index}`} className="border-b border-rose-200 bg-rose-50/70"><td className="px-2 py-2 text-center text-slate-400">{materials.length + index + 1}</td><td className="px-2 py-2 font-bold">{item.materialCode}</td><td className="px-2 py-2"><span className="mr-1 border border-rose-200 bg-white px-1 text-[9px] font-bold">{item.itemType || "RM"}</span>{item.materialName}<div className="mt-0.5 text-[10px] text-rose-700">พบในใบเบิก {item.sourceDocRef || "—"} แต่ Trade Code ไม่ตรงกับ BOM Snapshot จึงยังไม่นำเข้าต้นทุน</div></td><td className="px-2 py-2 text-center font-semibold">{item.lotNo || "—"}</td><td className="px-2 py-2 text-right font-bold tabular-nums">{qty(item.issueQty)}</td><td className="px-2 py-2 text-right">—</td><td className="px-2 py-2 text-right">—</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{item.unitCost == null ? <span className="text-[9px] font-normal text-rose-700">{item.itemType === "WIP" ? "รอ Cost Sheet WIP" : "ไม่พบราคา LOT"}</span> : <>{unitMoney(item.unitCost)}<div className="text-[9px] font-normal text-slate-500">บาท/{item.costUomName}</div></>}</td><td className="px-2 py-2 text-right">—</td><td className="px-2 py-2 text-center font-bold text-rose-700"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />ไม่ตรง BOM</td></tr>)}</tbody><tfoot className="border-t-2 border-[#d7af20] bg-[#eef3f9] font-black"><tr><td colSpan={8} className="px-3 py-2 text-right">รวมต้นทุนวัตถุดิบโดยตรง</td><td className="px-2 py-2 text-right tabular-nums">{money(rawCost)}</td><td /></tr></tfoot></table></div></div>;
}

function ManualMaterialsEditor({ materials, onAdd, onChange, onRemove, disabled }) {
  const rows = materials.map((item, index) => ({ item, index })).filter(({ item }) => item.source_kind === "manual_cost_input");
  return <section className="border-t border-amber-200 bg-amber-50/60 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-black text-amber-950">WIP ที่ระบบยังไม่มีข้อมูล</h3><p className="text-[11px] text-amber-800">ใช้เฉพาะข้อมูลที่ตรวจจากเอกสารหรือผู้รับผิดชอบแล้ว รายการไม่ครบจะปิดต้นทุนไม่ได้</p></div><button type="button" onClick={onAdd} disabled={disabled} className="h-8 border border-amber-400 bg-white px-3 text-[11px] font-black text-amber-900 disabled:opacity-50">+ เพิ่ม WIP Manual</button></div>{rows.length > 0 && <div className="mt-3 space-y-2">{rows.map(({ item, index }) => <div key={`manual-${index}`} className="grid gap-2 border border-amber-200 bg-white p-2 md:grid-cols-[100px_minmax(160px,1fr)_120px_90px_80px_110px_minmax(150px,1fr)_36px]"><input aria-label="รหัส WIP" placeholder="รหัส WIP" value={item.item_code} onChange={(event) => onChange(index, "item_code", event.target.value)} className={inputClass} disabled={disabled} /><input aria-label="ชื่อ WIP" placeholder="ชื่อ WIP เช่น แป้งหมัก" value={item.item_name} onChange={(event) => onChange(index, "item_name", event.target.value)} className={inputClass} disabled={disabled} /><input aria-label="LOT WIP" placeholder="LOT" value={item.lot_no} onChange={(event) => onChange(index, "lot_no", event.target.value)} className={inputClass} disabled={disabled} /><input aria-label="ปริมาณ WIP" type="number" min="0" step="0.0001" placeholder="ปริมาณ" value={item.qty} onChange={(event) => onChange(index, "qty", event.target.value)} className={`${inputClass} text-right`} disabled={disabled} /><input aria-label="หน่วย WIP" placeholder="หน่วย" value={item.uom_name} onChange={(event) => onChange(index, "uom_name", event.target.value)} className={inputClass} disabled={disabled} /><input aria-label="ต้นทุนต่อหน่วย WIP" type="number" min="0" step="0.0001" placeholder="ต้นทุน/หน่วย" value={item.unit_price} onChange={(event) => onChange(index, "unit_price", event.target.value)} className={`${inputClass} text-right`} disabled={disabled} /><input aria-label="เอกสารอ้างอิง WIP" placeholder="เอกสาร/ผู้ยืนยัน" value={item.source_doc_ref} onChange={(event) => onChange(index, "source_doc_ref", event.target.value)} className={inputClass} disabled={disabled} /><button type="button" aria-label="ลบ WIP Manual" onClick={() => onRemove(index)} disabled={disabled} className="h-9 border border-rose-200 text-rose-600 disabled:opacity-50">×</button></div>)}</div>}</section>;
}

function ExpenseStep({ dlCost, ohCost, onChange }) {
  return <div className="p-4"><h2 className="text-sm font-black">4. ค่าแรงงานตรงและค่าใช้จ่ายการผลิต</h2><p className="mt-1 text-xs text-slate-500">กรอกยอดที่ฝ่ายรับผิดชอบคำนวณและอนุมัติสำหรับ LOT นี้</p><div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2"><label className="border border-sky-200 bg-sky-50 p-4 text-xs font-bold">ค่าแรงงานตรง (DL) บาท<input type="number" min="0" step="0.01" value={dlCost} onChange={(event) => onChange("DL", event.target.value)} className="mt-2 h-11 w-full border border-sky-300 bg-white px-3 text-right text-lg font-black outline-none" /></label><label className="border border-amber-200 bg-amber-50 p-4 text-xs font-bold">ค่าใช้จ่ายการผลิต (OH) บาท<input type="number" min="0" step="0.01" value={ohCost} onChange={(event) => onChange("OH", event.target.value)} className="mt-2 h-11 w-full border border-amber-300 bg-white px-3 text-right text-lg font-black outline-none" /></label></div></div>;
}

function ReviewStep({ issues, sheet }) {
  return <div className="p-4"><h2 className="text-sm font-black">5. ตรวจสอบและปิดต้นทุน</h2><div className={`mt-4 border p-4 ${issues.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-center gap-2 font-bold">{issues.length ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Check className="h-5 w-5 text-emerald-600" />}{issues.length ? `พบ ${issues.length} จุดที่ต้องแก้ก่อนปิดต้นทุน` : "ข้อมูลผ่านการตรวจสอบเบื้องต้น"}</div>{issues.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</div><div className="mt-4 text-xs text-slate-500">เมื่อปิดต้นทุนแล้ว Cost Sheet {sheet.cost_no} จะไม่สามารถแก้ไขตรง ๆ ได้ เพื่อรักษาร่องรอยการตรวจสอบย้อนหลัง</div></div>;
}

function SummaryPanel({ sheet, plannedUom, rawCost, wipCost, dlCost, ohCost, totalCost, unitCost, issues }) {
  return <aside className="bg-[#f8fafc] p-4"><h2 className="text-sm font-black">สรุปต้นทุน LOT นี้</h2><div className="mt-3 border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">ผลผลิตจริง</div><div className="mt-1 text-2xl font-black tabular-nums">{qty(sheet.actual_qty)} <span className="text-sm">{sheet.uom_name}</span></div><div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-[11px]"><span>ตามแผน</span><strong>{qty(sheet.planned_qty)} {plannedUom}</strong></div></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-xs"><SummaryRow label="วัตถุดิบโดยตรง" value={rawCost} color="text-emerald-700" /><SummaryRow label="ต้นทุน WIP โอนเข้า" value={wipCost} color="text-violet-700" /><SummaryRow label="ค่าแรงงานตรง (DL)" value={dlCost} color="text-sky-700" /><SummaryRow label="ค่าใช้จ่ายการผลิต (OH)" value={ohCost} color="text-amber-700" /></div><div className="mt-4 bg-[var(--surface-navy,#123663)] p-4 text-white"><div className="flex justify-between text-xs"><span>รวมต้นทุนการผลิต</span><strong className="tabular-nums">{money(totalCost)} บาท</strong></div><div className="my-3 h-px bg-white/20" /><div className="text-center"><div className="text-[11px] text-blue-100">ต้นทุนต่อหน่วยจริง</div><div className="mt-1 text-3xl font-black tabular-nums">{money(unitCost)}</div><div className="text-xs">บาท/{sheet.uom_name}</div></div></div><div className={`mt-3 flex items-start gap-2 border p-2.5 text-[11px] font-semibold ${issues.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{issues.length ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}<span>{issues.length ? `ยังมี ${issues.length} จุดที่ต้องตรวจ` : "พร้อมปิดต้นทุน"}</span></div></aside>;
}

function SummaryRow({ label, value, color }) { return <div className="flex items-center justify-between py-2.5"><span>{label}</span><strong className={`tabular-nums ${color}`}>{money(value)}</strong></div>; }
function Info({ label, value }) { return <div className="border border-slate-200 bg-white p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-sm font-black">{value}</div></div>; }

