export const dynamic = "force-dynamic";

function buildHtml() {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BOM Approval</title>
    <style>
      :root {
        font-family: "Inter", "Sarabun", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #0f172a;
        background: #f4f6fb;
        --border: #e4e7ec;
        --muted: #475569;
        --brand-dark: #0f172a;
        --accent: #059669;
        --accent-strong: #047857;
        --accent-warning: #f97316;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f4f6fb;
      }
      .page {
        max-width: 960px;
        margin: 0 auto;
        padding: 36px 20px 60px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .hero {
        padding: 32px;
        border-radius: 28px;
        background: linear-gradient(135deg, #0f172a, #1f2a5b);
        color: #fff;
        box-shadow: 0 24px 40px rgba(15, 23, 42, 0.25);
      }
      .hero small {
        display: block;
        letter-spacing: 0.4em;
        font-size: 11px;
        text-transform: uppercase;
        opacity: 0.8;
      }
      .hero h1 {
        margin: 12px 0 4px;
        font-size: 30px;
        font-weight: 600;
      }
      .hero p {
        margin: 0;
        font-size: 15px;
        color: rgba(255, 255, 255, 0.85);
      }
      .card {
        background: #ffffff;
        border-radius: 28px;
        padding: 32px;
        box-shadow: 0 25px 45px rgba(15, 23, 42, 0.1);
        border: 1px solid rgba(15, 23, 42, 0.07);
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .status-line {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: #f8fafc;
      }
      .status-line.info {
        border-color: rgba(59, 130, 246, 0.3);
      }
      .status-line.success {
        border-color: rgba(16, 185, 129, 0.25);
      }
      .status-line.warning {
        border-color: rgba(234, 179, 8, 0.25);
      }
      .status-line.error {
        border-color: rgba(239, 68, 68, 0.35);
      }
      .status-line .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
        transition: background 0.2s ease;
      }
      .status-line .dot.error {
        background: #dc2626;
      }
      .status-line .dot.warning {
        background: #d97706;
      }
      .status-line .status-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .status-line strong {
        font-size: 16px;
      }
      .status-line small {
        color: var(--muted);
        font-size: 12px;
      }
      .error-box {
        display: none;
        border-radius: 14px;
        padding: 10px 14px;
        border: 1px solid rgba(220, 38, 38, 0.35);
        background: #fff1f2;
        color: #b91c1c;
        font-size: 13px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .detail {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px 16px;
        background: #f8fafc;
      }
      .detail span {
        display: block;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .detail strong {
        font-size: 18px;
        color: #0f172a;
      }
      section h3 {
        margin: 0 0 8px;
        font-size: 16px;
        color: #0f172a;
      }
        .form-note {
          font-size: 13px;
          color: var(--muted);
        }
        .action-note {
          font-size: 13px;
          color: #0f172a;
          margin-top: -8px;
          min-height: 1em;
        }
        .action-note.locked {
          font-weight: 600;
          color: #059669;
        }
        .action-note.locked.reject {
          color: #dc2626;
        }
      .approver-form {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: #fffdfa;
      }
      .approver-form .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .approver-form label {
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .approver-form input,
      .approver-form textarea {
        border-radius: 12px;
        border: 1px solid var(--border);
        padding: 12px 14px;
        font-size: 15px;
        font-family: inherit;
      }
      .approver-form textarea {
        min-height: 110px;
        resize: vertical;
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .cta {
        flex: 1;
        min-width: 150px;
        border: none;
        border-radius: 14px;
        padding: 14px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .cta.primary {
        background: linear-gradient(135deg, #059669, #10b981);
        color: #ffffff;
        box-shadow: 0 12px 22px rgba(5, 150, 105, 0.35);
      }
      .cta.secondary {
        background: #fff1cc;
        color: #92400e;
      }
      .cta:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        box-shadow: none;
      }
      .reason-wrapper.hidden {
        display: none;
      }
      .debug-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .debug-row input {
        flex: 1;
      }
      .debug-result {
        margin: 12px 0 0;
        font-size: 13px;
        min-height: 18px;
        color: #0f172a;
      }
      .debug-result strong {
        color: var(--accent);
      }
      .confirm-modal {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.6);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .confirm-modal.active {
        opacity: 1;
        pointer-events: auto;
      }
      .confirm-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 24px 28px;
        width: min(440px, calc(100% - 40px));
        box-shadow: 0 18px 30px rgba(15, 23, 42, 0.25);
        text-align: center;
      }
      .confirm-card p {
        margin: 6px 0;
        color: #0f172a;
        font-size: 15px;
      }
      .modal-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
        justify-content: center;
      }
      @media (max-width: 640px) {
        .page {
          padding: 24px 14px 40px;
        }
        .card {
          padding: 24px;
        }
        .actions {
          flex-direction: column;
        }
        .status-line {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <small>Quickplan • BOM</small>
        <h1>BOM Approval</h1>
        <p>ตรวจสอบรายการเปลี่ยนแปลง รับรองความถูกต้องด้วย approver code และเก็บ audit ไว้อย่างละเอียด</p>
      </header>
      <section class="card">
                <div class="status-line info" id="statusLine">
          <span class="dot"></span>
          <div class="status-info">
            <strong id="statusMessage">Preparing approval data…</strong>
            <small id="statusMeta">รอ token จาก LINE</small>
          </div>
        </div>
        <div class="error-box" id="errorBox"></div>
        <p class="form-note">รายละเอียดทั้งหมดแสดงใน LINE chat แล้ว กด Approve/Reject เพื่อกรอก approver code ด้านล่าง</p>
<form class="approver-form" id="approverForm" onsubmit="return false">
          <div class="form-group">
            <label for="approverCodeInput">Approver code</label>
            <input id="approverCodeInput" placeholder="กรอกรหัสที่ได้รับ" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Actions</label>
            <div class="actions">
              <button type="button" class="cta primary" id="approveButton">Approve</button>
              <button type="button" class="cta secondary" id="rejectButton">Reject</button>
            </div>
          </div>
          <div class="form-group reason-wrapper hidden" id="reasonSection">
            <label for="reasonInput">เหตุผล (กรณีเลือก reject)</label>
            <textarea id="reasonInput" placeholder="บอกเหตุผลให้ทีมอื่นเข้าใจ" rows="4"></textarea>
          </div>
        </form>
        <section class="debug">
          <h3>Token &amp; Debug</h3>
          <div class="debug-row">
            <input id="debugTokenInput" placeholder="วาง token หรือ token_id ที่ได้รับ" />
            <button type="button" class="cta primary" id="verifyTokenButton">Verify token</button>
          </div>
          <p class="debug-result" id="debugResult"></p>
        </section>
      </section>
    </div>
    <div class="confirm-modal" id="confirmModal">
      <div class="confirm-card">
        <p class="confirm-title">ยืนยันการตัดสินใจ</p>
        <p id="confirmMessage">คุณแน่ใจหรือไม่ว่าต้องการดำเนินการนี้</p>
        <div class="modal-actions">
          <button type="button" class="cta secondary" id="confirmCancel">ยกเลิก</button>
          <button type="button" class="cta primary" id="confirmProceed">ยืนยัน</button>
        </div>
      </div>
    </div>
    <script>
      (function () {
        const elements = {
          statusLine: document.getElementById("statusLine"),
          statusMessage: document.getElementById("statusMessage"),
          statusMeta: document.getElementById("statusMeta"),
          errorBox: document.getElementById("errorBox"),
          approverCodeInput: document.getElementById("approverCodeInput"),
          approveButton: document.getElementById("approveButton"),
          rejectButton: document.getElementById("rejectButton"),
          approverForm: document.getElementById("approverForm"),
          reasonSection: document.getElementById("reasonSection"),
          reasonInput: document.getElementById("reasonInput"),
          confirmModal: document.getElementById("confirmModal"),
          confirmMessage: document.getElementById("confirmMessage"),
          confirmProceed: document.getElementById("confirmProceed"),
          confirmCancel: document.getElementById("confirmCancel"),
        };
        const statusDot = elements.statusLine.querySelector(".dot");
        const actionNotice = document.createElement("p");
        actionNotice.className = "form-note action-note";
        actionNotice.id = "actionNotice";
        if (elements.approverForm && elements.approverForm.parentNode) {
          elements.approverForm.parentNode.insertBefore(actionNotice, elements.approverForm);
        }
        elements.actionNotice = actionNotice;

        const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
        const isLineWebView = /LIFF|Line/i.test(userAgent);
        const suppressedLineMessages = ["string did not match the expected pattern", "invalid regular expression"];

        const state = {
          token: "",
          pendingReject: false,
          busy: false,
          completed: false,
          confirmAction: null,
        };

        function shouldSuppressLineError(message) {
          if (!isLineWebView || typeof message !== "string") {
            return false;
          }
          const normalized = message.toLowerCase();
          return suppressedLineMessages.some((snippet) => normalized.includes(snippet));
        }

        function normalizeToken(value) {
          if (typeof value !== "string") {
            return "";
          }
          return value.trim();
        }

        function decodeSafe(value) {
          try {
            return decodeURIComponent(value);
          } catch (error) {
            return value || "";
          }
        }

        function extractTokenFromQuery(query) {
          try {
            const params = new URLSearchParams(query);
            return normalizeToken(params.get("token") || "");
          } catch (error) {
            const match = query.match(/(?:^|&)token=([^&]+)/);
            if (match) {
              return normalizeToken(decodeSafe(match[1]));
            }
            return "";
          }
        }

        function stripLeadingSlash(value) {
          if (value.startsWith("?")) {
            value = value.slice(1);
          }
          if (value.startsWith("/")) {
            value = value.slice(1);
          }
          return value;
        }

        function parseLiffState(value) {
          if (!value) {
            return "";
          }
          const trimmed = stripLeadingSlash(value);
          const decoded = decodeSafe(trimmed);
          return extractTokenFromQuery(decoded);
        }

        function extractTokenFromLocation(search) {
          try {
            const params = new URLSearchParams(search);
            let token = normalizeToken(params.get("token") || "");
            if (!token && params.has("liff.state")) {
              token = parseLiffState(params.get("liff.state"));
            }
            return token;
          } catch (error) {
            const directMatch = extractTokenFromQuery(search);
            if (directMatch) {
              return directMatch;
            }
            const stateMatch = search.match(/(?:[?&])liff\.state=([^&]+)/);
            if (stateMatch) {
              return parseLiffState(stateMatch[1]);
            }
            return "";
          }
        }

        function resolveTokenFromLocation() {
          const search = window.location.search || "";
          let token = extractTokenFromLocation(search);
          if (!token) {
            token = sessionStorage.getItem("bomToken") || "";
          } else {
            sessionStorage.setItem("bomToken", token);
          }
          state.token = token;
        }

        function setStatus(message, level = "info", meta = "") {
          elements.statusMessage.textContent = message;
          elements.statusMeta.textContent = meta;
          elements.statusLine.classList.remove("info", "success", "warning", "error");
          elements.statusLine.classList.add(level);
          statusDot.className = "dot";
          if (level === "error") {
            statusDot.classList.add("error");
          } else if (level === "warning") {
            statusDot.classList.add("warning");
          }
          if (level === "error") {
            elements.errorBox.textContent = message;
            elements.errorBox.style.display = "block";
          } else {
            elements.errorBox.style.display = "none";
          }
        }

        function disableControls(disabled) {
          [elements.approverCodeInput, elements.approveButton, elements.rejectButton, elements.reasonInput].forEach(function (el) {
            if (el) {
              el.disabled = disabled;
            }
          });
          state.busy = disabled;
          if (!disabled) {
            elements.confirmProceed.disabled = false;
          }
        }

        function resetReasonField() {
          state.pendingReject = false;
          elements.reasonSection.classList.add("hidden");
          elements.reasonInput.value = "";
          elements.rejectButton.textContent = "Reject";
        }

        function refreshActionNotice(statusValue) {
          const notice = elements.actionNotice;
          if (!notice) {
            return;
          }
          const normalized = (statusValue || "").toLowerCase();
          notice.classList.remove("locked", "reject");
          if (normalized === "approved") {
            notice.textContent = "รายการนี้ได้รับอนุมัติแล้ว (ล็อกปุ่มกดเพิ่มเติมใน LINE chat).";
            notice.classList.add("locked");
          } else if (normalized === "rejected") {
            notice.textContent = "รายการนี้ถูกปฏิเสธแล้ว (ล็อกปุ่มกดเพิ่มเติมใน LINE chat).";
            notice.classList.add("locked", "reject");
          } else {
            notice.textContent = "";
          }
        }

        function lockForm(statusValue) {
          state.completed = true;
          refreshActionNotice(statusValue);
          disableControls(true);
        }

        function openConfirm(action) {
          state.confirmAction = action;
          elements.confirmMessage.textContent = action === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ";
          elements.confirmProceed.textContent = action === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ";
          elements.confirmModal.classList.add("active");
        }

        function closeConfirm() {
          elements.confirmModal.classList.remove("active");
          state.confirmAction = null;
          elements.confirmProceed.disabled = false;
        }

        function prepareAction(action) {
          if (state.busy) {
            return;
          }
          if (state.completed) {
            setStatus("รายการนี้ประมวลผลแล้ว", "warning", "Action locked");
            return;
          }
          const code = elements.approverCodeInput.value.trim();
          if (!code) {
            setStatus("กรุณากรอก approver code ก่อนดำเนินการ", "warning");
            return;
          }
          if (action === "reject") {
            if (!state.pendingReject) {
              state.pendingReject = true;
              elements.reasonSection.classList.remove("hidden");
              elements.rejectButton.textContent = "ยืนยันปฏิเสธ";
              return;
            }
            if (!elements.reasonInput.value.trim()) {
              setStatus("ระบุเหตุผลเมื่อเลือก reject", "warning");
              return;
            }
          }
          openConfirm(action);
        }

        async function submitDecision(action) {
          if (!action) {
            return;
          }
          disableControls(true);
          setStatus(action === "approve" ? "กำลังส่งการอนุมัติ…" : "กำลังส่งการปฏิเสธ…", "info");
          const payload = {
            token: state.token,
            action: action,
            approver_code: elements.approverCodeInput.value.trim(),
            reason: action === "reject" ? elements.reasonInput.value.trim() : "",
          };
          try {
            const response = await fetch("/api/production-bom-approvals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw { message: body.error || "ไม่สามารถบันทึกผลได้", details: body.details || "" };
            }
            await loadApproval({ suppressStatus: true });
            lockForm(action === "approve" ? "approved" : "rejected");
            setStatus(action === "approve" ? "อนุมัติเรียบร้อย" : "ปฏิเสธเรียบร้อย", "success", "Status: " + (action === "approve" ? "approved" : "rejected"));
          } catch (error) {
            disableControls(false);
            setStatus(error.message || "ไม่สามารถบันทึกผลได้", "error", error.details || "");
          } finally {
            resetReasonField();
            closeConfirm();
          }
        }

        async function loadApproval(options) {
          options = options || {};
          if (!state.token) {
            setStatus("Token ขาดหาย เปิดลิงก์ใหม่จาก LINE อีกครั้ง", "error", "Token missing");
            return;
          }
          disableControls(true);
          if (!options.suppressStatus) {
            setStatus("กำลังโหลดข้อมูลการอนุมัติ…", "info", "Fetching record");
          }
          try {
            const response = await fetch("/api/production-bom-approvals?token=" + encodeURIComponent(state.token), { cache: "no-store" });
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw { message: payload.error || "ไม่สามารถโหลดข้อมูลได้", details: payload.details ? (typeof payload.details === "string" ? payload.details : JSON.stringify(payload.details)) : "" };
            }
                        const data = await response.json();
            const statusValue = data.approval?.status || "unknown";
            state.completed = statusValue !== "pending";
            const statusLevel = statusValue === "pending" ? "info" : statusValue === "approved" ? "success" : "warning";
            if (state.completed) {
              lockForm(statusValue);
            } else {
              refreshActionNotice(statusValue);
              disableControls(false);
            }
            if (!options.suppressStatus) {
              setStatus("ข้อมูลสำรองการดำเนินการ", statusLevel, "Status: " + statusValue);
            } else {
              disableControls(state.completed);
            }
            resetReasonField();
          } catch (error) {
            disableControls(false);
            const message = error?.message || "เกิดข้อผิดพลาด";
            const details = error?.details || "";
            if (shouldSuppressLineError(message)) {
              console.debug("Suppressed LINE client parse error", message, details);
              setStatus("Preparing approval data…", "info", "Awaiting LINE token");
              return;
            }
            setStatus(message, "error", details);
          }
        }

        elements.approveButton.addEventListener("click", () => prepareAction("approve"));
        elements.rejectButton.addEventListener("click", () => prepareAction("reject"));
        elements.confirmCancel.addEventListener("click", closeConfirm);
        elements.confirmProceed.addEventListener("click", () => { const action = state.confirmAction; closeConfirm(); submitDecision(action); });

        resolveTokenFromLocation();
        loadApproval();
      })();

    </script>
  </body>
</html>`;
}

export async function GET() {
  const html = buildHtml();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
