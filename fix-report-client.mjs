import fs from "fs";

const filepath = "src/features/attendance/components/PieceRateReportPageClient.js";
let content = fs.readFileSync(filepath, "utf8");

// Normalize all newlines to LF for easy replacement
content = content.replace(/\r\n/g, "\n");

// 1. Fix the broken block at lines 354 to 365
const brokenBlock = `        {row.cancelReason ? (
          <>
            <dt className="text-slate-500">เหตุผล</dt>
            <dd>{row.cancelReason}</dd>
          </>
                  onClick={() => onEdit(row)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
            )}
          </div>
        </div>
      ) : null}`;

const restoredBlock = `        {row.cancelReason ? (
          <>
            <dt className="text-slate-500">เหตุผล</dt>
            <dd>{row.cancelReason}</dd>
          </>
        ) : null}
      </dl>

      {canEdit && !isGroupedView ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => onOpenHistory(row)}
              className="piece-rate-no-print inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <History size={12} /> ดูประวัติ
            </button>
            {row.docStatus === "active" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 size={12} /> ออกเอกสารแก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => onCancel(row)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <XCircle size={12} /> ยกเลิกเอกสาร
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">{row.cancelReason || row.editReason || "-"}</div>
            )}
          </div>
        </div>
      ) : null}`;

if (content.includes(brokenBlock)) {
  console.log("Found broken block. Restoring it...");
  content = content.replace(brokenBlock, restoredBlock);
} else {
  console.log("Broken block not found as exact string. Let's do a regex search or line-based replacement.");
  // Let's replace the region directly around canViewMoney / cancelReason
  const startKey = "{row.cancelReason ? (";
  const endKey = "export default function PieceRateReportPageClient";
  
  const startIdx = content.indexOf(startKey);
  const endIdx = content.indexOf(endKey);
  
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    console.log("Replacing the broken region using index bounding...");
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx);
    content = before + restoredBlock + "\n\n" + after;
  }
}

// 2. Make sure useUserProfile is imported
if (!content.includes('import { useUserProfile } from "@/lib/useUserProfile";')) {
  console.log("Adding useUserProfile import...");
  content = content.replace(
    'import { supabase } from "@/lib/supabaseClient";',
    'import { supabase } from "@/lib/supabaseClient";\nimport { useUserProfile } from "@/lib/useUserProfile";'
  );
}

// 3. Add const { username } = useUserProfile(); inside PieceRateReportPageClient
const componentStart = "export default function PieceRateReportPageClient({ initialViewMode = DEFAULT_VIEW_MODE }) {";
if (content.includes(componentStart)) {
  const componentStartWithHook = `${componentStart}\n  const { username } = useUserProfile();`;
  if (!content.includes(componentStartWithHook)) {
    console.log("Calling useUserProfile hook inside component...");
    content = content.replace(componentStart, componentStartWithHook);
  }
}

// 4. Update the Manual and Excel button conditional rendering
const manualButtonBlock = `{capabilities.canEdit && (
                  <button
                    type="button"
                    onClick={openManualModal}`;

const manualButtonBlockReplacement = `{capabilities.canEdit && username === "apexechelon" && (
                  <button
                    type="button"
                    onClick={openManualModal}`;

if (content.includes(manualButtonBlock)) {
  console.log("Restricting Manual Record button...");
  content = content.replace(manualButtonBlock, manualButtonBlockReplacement);
}

const excelButtonBlock = `{capabilities.canEdit && (
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}`;

const excelButtonBlockReplacement = `{capabilities.canEdit && username === "apexechelon" && (
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}`;

if (content.includes(excelButtonBlock)) {
  console.log("Restricting Import Excel button...");
  content = content.replace(excelButtonBlock, excelButtonBlockReplacement);
}

// Write back with CRLF line endings to preserve style
content = content.replace(/\n/g, "\r\n");
fs.writeFileSync(filepath, content, "utf8");
console.log("Write completed successfully.");
