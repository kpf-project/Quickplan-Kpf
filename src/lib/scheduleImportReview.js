export function getProductOptions(section, columnKey) {
  return section?.productOptions?.[columnKey] ?? [];
}

export function importPreviewSection(section, productOptions, shifts) {
  return {
    id: section.id, name: section.name, color_theme: section.color_theme,
    colorTheme: section.color_theme, displayOrder: section.display_order,
    date_layout: section.date_layout, formula_layout: section.formula_layout, column_colors: section.column_colors,
    columns: [...(section.production_schedule_column_defs ?? section.columns ?? [])].sort((a, b) => a.display_order - b.display_order),
    productOptions, shifts,
  };
}

export function importTableData(section, rows) {
  const catalog = new Map();
  Object.values(section.productOptions ?? {}).flat().forEach(option => {
    const product = catalog.get(option.skuCode) ?? { skuCode: option.skuCode, name: option.name, brand: option.brand, unit: option.unit, hasBom: true, formulaOptions: [] };
    if (!product.formulaOptions.some(formula => formula.formula_code === option.formulaCode)) {
      product.formulaOptions.push({ formula_code: option.formulaCode, formula_name: option.formulaName, bom_version_id: option.rowPatch.bomVersionId });
    }
    catalog.set(option.skuCode, product);
  });
  const days = [...new Set(rows.map(row => row.dayKey || ""))].sort().map(key => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(key) ? new Date(`${key}T00:00:00Z`) : null;
    return { key, date: date ? date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "ไม่พบวันที่", label: date ? date.toLocaleDateString("th-TH", { weekday: "short", timeZone: "UTC" }) : "" };
  });
  return { rows: rows.map(row => ({ id: row.id, day_key: row.dayKey || "", row_data: row.rowData, aiProducts: row.products })), days, skuCatalog: [...catalog.values()] };
}

export function updateImportRow(row, patch, section) {
  const rowData = { ...row.rowData, ...patch };
  const columns = section.columns ?? section.production_schedule_column_defs ?? [];
  const clearedLabels = [];
  const products = row.products.map(product => {
    if (!(product.columnKey in patch) && !("formulaCode" in patch) && !("formula_code" in patch)) return product;
    const candidate = getProductOptions(section, product.columnKey).find(option => option.name === rowData[product.columnKey]
      && option.formulaCode === (rowData.formulaCode || rowData.formula_code)
      && option.rowPatch.bomVersionId === (rowData.bomVersionId || rowData.bom_version_id));
    if (!candidate) return { ...product, status: "review", selectedKey: "", learnAlias: false, userConfirmed: false };
    const column = columns.find(item => item.key === product.columnKey);
    columns.filter(item => item.key === product.columnKey || item.key === column?.auto_fill_field).forEach(item => clearedLabels.push(`${item.label}:`));
    return { ...product, status: "resolved", selectedKey: candidate.selectionKey, userConfirmed: true, learnAlias: Boolean(product.candidates?.some(option => option.selectionKey === candidate.selectionKey)), isSuggested: false, isExact: false, reviewReason: null };
  });
  return { ...row, rowData, products, issues: row.issues.filter(issue => !clearedLabels.some(label => issue.startsWith(label))) };
}

export function moveImportRow(row, previousSection, section) {
  if (!section || row.sectionDefId === section.id) return row;
  const columns = section.columns ?? [];
  const previousColumns = previousSection?.columns ?? [];
  const rowData = Object.fromEntries(columns.map(column => {
    if (["sku_picker", "brand_auto", "shift"].includes(column.col_type)) return [column.key, null];
    const previous = previousColumns.find(item => item.col_type === column.col_type && item.key === column.key)
      ?? previousColumns.find(item => item.col_type === column.col_type && item.label === column.label && item.group_label === column.group_label)
      ?? (previousColumns.filter(item => item.col_type === column.col_type && item.label === column.label).length === 1
        ? previousColumns.find(item => item.col_type === column.col_type && item.label === column.label) : null);
    return [column.key, previous ? row.rowData[previous.key] ?? null : null];
  }));
  const issues = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dayKey || "")) issues.push("ไม่พบวันที่ผลิตในแถว");
  const shiftColumn = columns.find(column => column.col_type === "shift");
  if (shiftColumn) {
    const shifts = section.shifts ?? [];
    const shift = shifts.find(item => item.code === row.rowData.shiftCode)
      ?? (shifts.length === 1 ? shifts[0] : null);
    if (shift) {
      Object.assign(rowData, { [shiftColumn.key]: `${shift.name} (${shift.startTime}-${shift.endTime})`, shiftId: shift.id, shiftCode: shift.code, shiftName: shift.name, workStartTime: shift.startTime, workEndTime: shift.endTime });
    } else issues.push("ไม่พบกะที่ตรงกันใน Section ใหม่ กรุณาตรวจสอบการตั้งค่ากะ");
  }
  const products = columns.filter(column => column.col_type === "sku_picker").map((column, index) => ({
    ...(row.products.find(item => item.columnKey === column.key) ?? row.products[index] ?? {}),
    columnKey: column.key,
    status: "review",
    selectedKey: "",
    candidates: [],
    isExact: false,
    isSuggested: false,
    learnAlias: false,
    userConfirmed: false,
    reviewReason: "เปลี่ยน Section แล้ว กรุณาเลือกสินค้าและสูตรจากหมวดของ Section ใหม่",
  }));
  columns.filter(column => column.is_required && !["sku_picker", "brand_auto"].includes(column.col_type)).forEach(column => {
    if (rowData[column.key] === null || rowData[column.key] === "") issues.push(`${column.label}: จำเป็นต้องมีข้อมูล`);
  });
  return { ...row, sectionDefId: section.id, rowData, products, issues, warnings: [] };
}
