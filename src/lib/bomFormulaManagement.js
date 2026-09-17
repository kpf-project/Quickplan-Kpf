const DEFAULT_FORMULA_CODE = "DEFAULT";

function normalizeFormulaCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function prepareBomFormulaMutation({ action, formulaCode, formulaName } = {}) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const normalizedCode = normalizeFormulaCode(formulaCode);

  if (!normalizedCode) {
    return { ok: false, status: 400, error: "กรุณาระบุรหัสสูตร" };
  }

  if (normalizedAction === "rename") {
    const normalizedName = String(formulaName || "").trim();
    if (!normalizedName) {
      return { ok: false, status: 400, error: "กรุณาระบุชื่อสูตร" };
    }
    return {
      ok: true,
      action: "rename",
      formulaCode: normalizedCode,
      formulaName: normalizedName,
    };
  }

  if (normalizedAction === "deactivate") {
    if (normalizedCode === DEFAULT_FORMULA_CODE) {
      return {
        ok: false,
        status: 400,
        error: "ไม่สามารถปิดใช้งานสูตรหลัก DEFAULT ได้",
      };
    }
    return {
      ok: true,
      action: "deactivate",
      formulaCode: normalizedCode,
    };
  }

  return { ok: false, status: 400, error: "คำสั่งจัดการสูตรไม่ถูกต้อง" };
}
