import fs from 'fs';
import path from 'path';

const targetFilePath = 'C:/Users/Riew/Desktop/KPF/Production-Line/Production-Line/src/features/attendance/components/PieceRateReportPageClient.js';
let fileContent = fs.readFileSync(targetFilePath, 'utf-8');

console.log('Original content length:', fileContent.length);

// 1. Replace the table container div
const containerTarget = '<div ref={tableWrapRef} className="mt-4 hidden overflow-hidden rounded-md border border-slate-400 lg:block">';
const containerReplacement = '<div ref={tableWrapRef} className="mt-4 hidden overflow-hidden rounded-[2px] border border-slate-200 lg:block">';
if (fileContent.includes(containerTarget)) {
  fileContent = fileContent.replace(containerTarget, containerReplacement);
  console.log('1. Replaced table container div');
} else {
  console.warn('1. WARNING: table container target not found!');
}

// 2. Replace the table tag to add border-collapse
const tableTarget = '<table className="w-full table-fixed text-[11px] text-slate-900">';
const tableReplacement = '<table className="w-full table-fixed text-[11px] text-slate-900 border-collapse">';
if (fileContent.includes(tableTarget)) {
  fileContent = fileContent.replace(tableTarget, tableReplacement);
  console.log('2. Replaced table tag');
} else {
  console.warn('2. WARNING: table tag target not found!');
}

// 3. Replace the table headers to remove border-r and change height
const headersRegex = /<thead className="bg-\[#102C57\] text-\[11px\] uppercase tracking-wide text-white">([\s\S]*?)<\/thead>/;
const headersReplacement = `<thead className="bg-[#102C57] text-[11px] uppercase tracking-wide text-white">
                    <tr>
                      <th className="px-2 py-2 text-center leading-tight">เวลา / ผู้บันทึก</th>
                      <th className="print-piece-rate-hide-col px-2 py-2 text-center leading-tight">เลขเอกสาร</th>
                      <th className="px-2 py-2 text-center leading-tight">รหัสพนักงาน</th>
                      <th className="px-2 py-2 text-center leading-tight">ชื่อพนักงาน</th>
                      <th className="px-2 py-2 text-center leading-tight">รหัสสินค้า</th>
                      <th className="px-2 py-2 text-center leading-tight">ชื่อสินค้า</th>
                      <th className="px-2 py-2 text-center leading-tight">น้ำหนัก</th>
                      <th className="px-2 py-2 text-center leading-tight">จำนวน</th>
                      {capabilities.canViewMoney ? <th className="px-2 py-2 text-center leading-tight">ค่าแรง</th> : null}
                      {detailCanEdit ? <th className="print-piece-rate-hide-col px-2 py-2 text-center leading-tight">จัดการเอกสาร</th> : null}
                    </tr>
                  </thead>`;

if (headersRegex.test(fileContent)) {
  fileContent = fileContent.replace(headersRegex, headersReplacement);
  console.log('3. Replaced table headers');
} else {
  console.warn('3. WARNING: table headers regex did not match!');
}

// 4. Replace tr align-top to align-middle and add border-b
const trTarget = 'className={`align-top ${viewMode !== "grouped"';
const trReplacement = 'className={`align-middle border-b border-slate-200 ${viewMode !== "grouped"';
if (fileContent.includes(trTarget)) {
  fileContent = fileContent.replace(trTarget, trReplacement);
  console.log('4. Replaced tr class');
} else {
  // Let's check if it already has border-b or align-middle from previous attempts
  if (fileContent.includes('className={`align-middle border-b border-slate-200 ${viewMode !== "grouped"')) {
    console.log('4. tr class already replaced');
  } else {
    console.warn('4. WARNING: tr class target not found!');
  }
}

// 5. Replace columns in body. Let's do a targeted replace of the td cells.
// We can use a regex that matches the first td down to the last td inside the tr
const bodyCellsRegex = /<td className="border-r border-slate-400 px-2 py-2 text-center text-\[11px\] leading-snug">([\s\S]*?)<\/tr>/;

// Since that could match too much, let's target specific sections.
// First, the first td block:
const td1Target = `<td className="px-2 py-1.5 text-center text-[11px] leading-tight">
                            <div className="font-semibold text-slate-900">{formatDateTime(row.loggedAt)}</div>
                            <div className="text-[10px] text-slate-500">{row.operatorUsername || "-"}</div>
                          </td>`;
// It seems the first td was already successfully replaced. Let's verify:
console.log('Checking td1:', fileContent.includes('className="px-2 py-1.5 text-center text-[11px] leading-tight"'));

// Let's replace the rest of the columns starting from employeeCode td to detailCanEdit td.
const colsTargetRegex = /<td className="border-r border-slate-400 px-2 py-2 text-center text-\[11px\] font-mono font-semibold text-slate-700 whitespace-nowrap">([\s\S]*?)<\/td>\s*<\/tr>/;

// Wait, to be completely safe, let's define the exact target block. We will replace the whole desktopRows.map block if needed,
// but let's see if we can search for the start:
// <td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-mono font-semibold text-slate-700 whitespace-nowrap">
// and end:
// </td>
//                           ) : null}

const fullRowTargetRegex = /<td className="border-r border-slate-400 px-2 py-2 text-center text-\[11px\] font-mono font-semibold text-slate-700 whitespace-nowrap">[\s\S]*?<\/td>\s*<\/td>\s*<\/tr>/;
// Wait! Let's do a simpler regex that matches column by column to avoid matching too much.

// Let's list replacements:
const replacements = [
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-mono font-semibold text-slate-700 whitespace-nowrap">\r\n                            {row.employeeCode}\r\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-mono font-semibold text-slate-700 whitespace-nowrap">\n                            {row.employeeCode}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-mono font-semibold text-slate-700 whitespace-nowrap">\n                            {row.employeeCode}\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-mono font-semibold text-slate-700 whitespace-nowrap">\n                            {row.employeeCode}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] leading-snug [word-break:normal] [overflow-wrap:normal]">\r\n                            <div>{row.employeeName}</div>\r\n                            <div className="mt-1 text-[10px] text-slate-500">{row.employeeDepartment}</div>\r\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] leading-tight">\n                            <div className="font-medium text-slate-900">{row.employeeName}</div>\n                            <div className="text-[10px] text-slate-500">{row.employeeDepartment}</div>\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] leading-snug [word-break:normal] [overflow-wrap:normal]">\n                            <div>{row.employeeName}</div>\n                            <div className="mt-1 text-[10px] text-slate-500">{row.employeeDepartment}</div>\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] leading-tight">\n                            <div className="font-medium text-slate-900">{row.employeeName}</div>\n                            <div className="text-[10px] text-slate-500">{row.employeeDepartment}</div>\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-mono text-slate-700 whitespace-nowrap">\r\n                            {getProductCodeLabel(row)}\r\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-mono text-slate-700 whitespace-nowrap">\n                            {getProductCodeLabel(row)}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-mono text-slate-700 whitespace-nowrap">\n                            {getProductCodeLabel(row)}\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-mono text-slate-700 whitespace-nowrap">\n                            {getProductCodeLabel(row)}\n                          </td>'
  },
  {
    target: '<td className="cell-left border-r border-slate-400 px-2 py-2 text-[11px] leading-snug [word-break:normal] [overflow-wrap:normal]">\r\n                            <div className="font-semibold text-slate-900">{row.productName}</div>\r\n                            {row.weightOptionLabel ? (\r\n                              <div className="mt-1 text-[10px] text-slate-500">\r\n                                {row.weightOptionLabel}{row.weightKg ? ` | \${formatNumber(row.weightKg, 3)} กก.` : ""}\r\n                              </div>\r\n                            ) : null}\r\n                          </td>',
    replacement: '<td className="cell-left px-2 py-1.5 text-[11px] leading-tight">\n                            <div className="font-semibold text-slate-900">{row.productName}</div>\n                            {row.weightOptionLabel ? (\n                              <div className="text-[10px] text-slate-500">\n                                {row.weightOptionLabel}{row.weightKg ? ` | ${formatNumber(row.weightKg, 3)} กก.` : ""}\n                              </div>\n                            ) : null}\n                          </td>'
  },
  {
    target: '<td className="cell-left border-r border-slate-400 px-2 py-2 text-[11px] leading-snug [word-break:normal] [overflow-wrap:normal]">\n                            <div className="font-semibold text-slate-900">{row.productName}</div>\n                            {row.weightOptionLabel ? (\n                              <div className="mt-1 text-[10px] text-slate-500">\n                                {row.weightOptionLabel}{row.weightKg ? ` | \${formatNumber(row.weightKg, 3)} กก.` : ""}\n                              </div>\n                            ) : null}\r\n                          </td>',
    replacement: '<td className="cell-left px-2 py-1.5 text-[11px] leading-tight">\n                            <div className="font-semibold text-slate-900">{row.productName}</div>\n                            {row.weightOptionLabel ? (\n                              <div className="text-[10px] text-slate-500">\n                                {row.weightOptionLabel}{row.weightKg ? ` | ${formatNumber(row.weightKg, 3)} กก.` : ""}\n                              </div>\n                            ) : null}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\r\n                            {formatNumber(row.inputValue, row.inputDigits)} {row.inputUnitLabel}\r\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.inputValue, row.inputDigits)} {row.inputUnitLabel}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.inputValue, row.inputDigits)} {row.inputUnitLabel}\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.inputValue, row.inputDigits)} {row.inputUnitLabel}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\r\n                            {formatNumber(row.countValue, 0)}\r\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.countValue, 0)}\n                          </td>'
  },
  {
    target: '<td className="border-r border-slate-400 px-2 py-2 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.countValue, 0)}\n                          </td>',
    replacement: '<td className="px-2 py-1.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap">\n                            {formatNumber(row.countValue, 0)}\n                          </td>'
  },
  {
    target: 'className={`${detailCanEdit ? "border-r border-slate-400 " : ""}px-2 py-2 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap`}',
    replacement: 'className="px-2 py-1.5 text-center text-[11px] font-semibold tabular-nums whitespace-nowrap"'
  },
  {
    target: '<td className="print-piece-rate-hide-col px-2 py-2 text-center align-middle">([\s\S]*?)<\/td>\\s*<\\/tr>',
    isRegex: true,
    replacement: `<td className="print-piece-rate-hide-col px-2 py-1.5 text-center align-middle">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openHistoryModal(row)}
                                  className="piece-rate-no-print inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#102C57] transition-all"
                                  title="ประวัติเอกสาร"
                                >
                                  <History size={12} />
                                </button>
                                {row.docStatus === "active" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(row)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950 transition-all"
                                      title="แก้ไขเอกสาร"
                                    >
                                      <Edit3 size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openCancelModal(row)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all"
                                      title="ยกเลิกเอกสาร"
                                    >
                                      <XCircle size={12} />
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400 max-w-[85px] truncate block" title={row.cancelReason || row.editReason || "-"}>
                                    {row.cancelReason || row.editReason || "-"}
                                  </span>
                                )}
                              </div>
                            </td>`
  }
];

replacements.forEach(({ target, replacement, isRegex }, idx) => {
  if (isRegex) {
    const re = new RegExp(target);
    if (re.test(fileContent)) {
      fileContent = fileContent.replace(re, (match) => {
        // We only want to replace the outer block, so let's verify
        return replacement + '\n                          </tr>';
      });
      console.log(`Replacement ${idx} (regex) applied`);
    } else {
      console.log(`Replacement ${idx} (regex) NOT applied`);
    }
  } else {
    // Try both CRLF and LF replacements
    const cleanTarget = target.replace(/\r\n/g, '\n');
    const targetCRLF = target.replace(/\r?\n/g, '\r\n');
    const targetLF = target.replace(/\r?\n/g, '\n');

    if (fileContent.includes(targetCRLF)) {
      fileContent = fileContent.replace(targetCRLF, replacement);
      console.log(`Replacement ${idx} (CRLF) applied`);
    } else if (fileContent.includes(targetLF)) {
      fileContent = fileContent.replace(targetLF, replacement);
      console.log(`Replacement ${idx} (LF) applied`);
    } else {
      console.warn(`Replacement ${idx} NOT found!`);
    }
  }
});

// Write the file back
fs.writeFileSync(targetFilePath, fileContent, 'utf-8');
console.log('Write completed! New content length:', fileContent.length);
