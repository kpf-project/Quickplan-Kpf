"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ACTIONS = [
  { key: "approve", label: "Approve", activeClass: "bg-emerald-600 text-white" },
  { key: "reject", label: "Reject", activeClass: "bg-rose-600 text-white" },
];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return isNaN(date.getTime()) ? "-" : date.toLocaleString(undefined, { hour12: false });
}

function BomApprovalPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [approvalData, setApprovalData] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Loading approval data...");
  const [statusLevel, setStatusLevel] = useState("info");
  const [approverCode, setApproverCode] = useState("");
  const [action, setAction] = useState("approve");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);

  const canSubmit = !!approverCode.trim();

  const loadApproval = useCallback(
    async (signal) => {
      if (!token) {
        setStatusLevel("error");
        setStatusMessage("Approval token is missing.");
        return;
      }
    setStatusMessage("Loading approval data...");
    setStatusLevel("info");
    try {
      const response = await fetch(`/api/production-bom-approvals?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to fetch approval.");
      }
      const data = await response.json();
      setApprovalData(data);
      setLogs(data.approval_logs || []);
      setStatusMessage("Ready for your decision.");
      setStatusLevel("success");
    } catch (error) {
      if (error.name === "AbortError") return;
      setStatusMessage(error.message || "Unable to load approval.");
      setStatusLevel("error");
    }
    },
    [token]
  );

  useEffect(() => {
    if (!token) {
      setStatusLevel("error");
      setStatusMessage("Approval token is missing.");
      return;
    }
    const controller = new AbortController();
    loadApproval(controller.signal);
    return () => controller.abort();
  }, [token, loadApproval]);

  const statusTone = useMemo(() => {
    switch (statusLevel) {
      case "success":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "error":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  }, [statusLevel]);

  const handleDecision = async (selectedAction) => {
    if (!canSubmit) {
      setStatusMessage("Approver code is required.");
      setStatusLevel("warning");
      return;
    }
    if (selectedAction === "reject" && !reason.trim()) {
      setStatusMessage("Provide a reason when rejecting.");
      setStatusLevel("warning");
      return;
    }
    setIsSubmitting(true);
    setStatusMessage(
      selectedAction === "approve" ? "Submitting approval..." : "Submitting rejection..."
    );
    setStatusLevel("info");
    try {
      const response = await fetch("/api/production-bom-approvals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          action: selectedAction,
          approver_code: approverCode.trim(),
          reason: selectedAction === "reject" ? reason.trim() : "",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to complete the action.");
      }
      await loadApproval();
      setStatusMessage(selectedAction === "approve" ? "Approved successfully." : "Rejected successfully.");
      setStatusLevel("success");
      setReason("");
      setApproverCode("");
    } catch (error) {
      setStatusMessage(error.message || "Unable to complete the action.");
      setStatusLevel("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentActionLabel = ACTIONS.find((item) => item.key === action)?.label || "Approve";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-10 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.4em]">Quickplan • BOM</p>
          <h1 className="mt-4 text-3xl font-semibold">BOM Approval</h1>
          <p className="mt-2 text-sm text-white/80">
            Review the requested changes and confirm with the official approver code.
          </p>
        </div>
        <div className="mt-8 rounded-2xl bg-white p-8 shadow-xl">
          <div className={`mb-4 flex items-center gap-3 rounded-full border px-5 py-3 ${statusTone}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            <span>{statusMessage}</span>
          </div>
          <div className="grid gap-3 border-y border-slate-100 py-4 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>SKU</span>
              <strong className="text-slate-900">{approvalData?.sku_code ?? "-"}</strong>
            </div>
            <div className="flex justify-between">
              <span>Product</span>
              <strong className="text-slate-900">{approvalData?.sku_name ?? "-"}</strong>
            </div>
            <div className="flex justify-between">
              <span>Version</span>
              <strong className="text-slate-900">{approvalData?.version_no ?? "-"}</strong>
            </div>
            <div className="flex justify-between">
              <span>Requested by</span>
              <strong className="text-slate-900">{approvalData?.requested_by_name ?? "-"}</strong>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <strong className="text-slate-900">{approvalData?.approval?.status ?? "-"}</strong>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-slate-600">Changes</h3>
            {approvalData?.changes?.length ? (
              <ul className="space-y-2">
                {approvalData.changes.map((change, index) => (
                  <li key={index} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm">
                    {change}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No change list available.</p>
            )}
          </div>
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-slate-600">Audit trail</h3>
            {logs.length ? (
              <ul className="space-y-2 text-xs text-slate-500">
                {logs.map((log) => (
                  <li key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2">
                    <div className="flex justify-between">
                      <span>{formatDate(log.created_at)}</span>
                      <span className="font-semibold uppercase">{log.action}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Code: {log.approver_code || "-"} • Detail:{" "}
                      {log.detail && typeof log.detail === "object"
                        ? JSON.stringify(log.detail)
                        : log.detail || "-"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No actions recorded yet.</p>
            )}
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-600">Approver code</h3>
              <div className="flex gap-2">
                {ACTIONS.map((item) => (
                  <button
                    key={item.key}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold ${
                      action === item.key
                        ? item.activeClass
                        : "bg-slate-100 text-slate-600"
                    }`}
                    onClick={() => setAction(item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              aria-label="Approver code"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="Enter the approver code provided to you"
              value={approverCode}
              onChange={(event) => setApproverCode(event.target.value)}
            />
            {action === "reject" && (
              <textarea
                aria-label="Rejection reason"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="Reason for rejection"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <button
                disabled={isSubmitting || !canSubmit}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => handleDecision(action)}
              >
                Submit {currentActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BomApprovalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading approval page...</p>
        </div>
      </div>
    }>
      <BomApprovalPageContent />
    </Suspense>
  );
}
