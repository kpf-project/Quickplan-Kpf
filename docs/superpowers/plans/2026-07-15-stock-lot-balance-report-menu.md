# Stock Lot Balance Report Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แยกเมนูรายงานคงเหลือราย Lot เป็นรายงานละเอียดและรายงาน A4 ที่เข้าได้โดยตรง พร้อมทำให้พรีวิว A4 แสดงเป็นกระดาษสีขาวมีเงาโดยไม่มีกรอบ container ชั้นนอก

**Architecture:** ใช้ route ที่มีอยู่แล้วทั้ง `/production-line/stock/balance` และ `/production-line/stock/balance/lot` โดยเปลี่ยนเฉพาะ navigation configuration และ presentation layer ของสอง client components ไม่เพิ่ม API หรือเปลี่ยน data flow รายงาน เมนูใช้ `next/link` และ prefetch เดิมของ `WeightScalePrimaryHeader`

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, Node built-in test runner

## Global Constraints

- ไม่เพิ่ม API หรือ query ใหม่
- ไม่เปลี่ยน logic การคำนวณยอดคงเหลือ
- ไม่แตะหน้าชั่งเข้า ชั่งคืน เบิก หรือฐานข้อมูล
- คงตัวกรอง การส่งออก Excel การแบ่งหน้า และ CSS สำหรับการพิมพ์เดิม
- การนำทางต้องใช้ `next/link` และ prefetch เดิม ไม่ใช้ full-page reload

---

### Task 1: เพิ่ม regression test สำหรับเมนูและโครงสร้างหน้า

**Files:**
- Create: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: source files ของ `WeightScalePrimaryHeader`, `ProductionStockLotBalanceSummaryReportPageClient` และ `ProductionStockLotBalanceReportPageClient`
- Produces: regression contract สำหรับชื่อเมนู เส้นทาง การถอดปุ่ม A4 และ paper-only preview

- [ ] **Step 1: เขียน failing test**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("lot balance report navigation exposes detailed and A4 destinations", () => {
  const source = readRepoFile("src/features/production-line/components/WeightScalePrimaryHeader.js");

  assert.match(source, /key: "lot-balance-report"/);
  assert.match(source, /href: "\/production-line\/stock\/balance"[\s\S]*label: "รายงานสรุปคงเหลือราย Lot แบบละเอียด"/);
  assert.match(source, /href: "\/production-line\/stock\/balance\/lot"[\s\S]*label: "รายงานสรุปยอดคงเหลือราย Lot"/);
});

test("detailed lot balance report no longer links to the A4 page", () => {
  const source = readRepoFile("src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js");

  assert.doesNotMatch(source, /รายงาน A4 แนวตั้ง/);
  assert.doesNotMatch(source, /href=\{`\/production-line\/stock\/balance\/lot/);
});

test("A4 lot balance preview renders a standalone shadowed paper", () => {
  const source = readRepoFile("src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js");

  assert.doesNotMatch(source, /<section className="flex flex-col gap-4 border-2 border-\[#102c57\] bg-white p-6 shadow-/);
  assert.match(source, /lot-balance-portrait-print-shell mx-auto w-\[210mm\] min-h-\[297mm\] bg-white[^"]*shadow-/);
});
```

- [ ] **Step 2: รัน test เพื่อยืนยันว่า fail ก่อนแก้**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: FAIL เพราะยังไม่มี `lot-balance-report`, ปุ่ม A4 ยังอยู่ และ container ชั้นนอกยังมี border/shadow

---

### Task 2: แยกเมนูรายงานคงเหลือราย Lot

**Files:**
- Modify: `src/features/production-line/components/WeightScalePrimaryHeader.js:101-143`
- Test: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: `DROPDOWN_NAVS` และ renderer ของ `sections` ที่มีอยู่แล้ว
- Produces: section key `lot-balance-report` พร้อมสอง route destinations

- [ ] **Step 1: ย้ายรายการคงเหลือออกจาก `directItems` และเพิ่ม section**

ให้ `directItems` เหลือรายการ `รายงานสรุป ชั่ง-เบิก` และเพิ่ม section นี้เป็นรายการแรกของ `sections`:

```js
{
  key: "lot-balance-report",
  label: "รายงานสรุปคงเหลือราย Lot",
  icon: FileText,
  items: [
    {
      href: "/production-line/stock/balance",
      label: "รายงานสรุปคงเหลือราย Lot แบบละเอียด",
    },
    {
      href: "/production-line/stock/balance/lot",
      label: "รายงานสรุปยอดคงเหลือราย Lot",
    },
  ],
},
```

- [ ] **Step 2: รัน navigation test เฉพาะกรณีเมนู**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs --test-name-pattern="navigation exposes"`

Expected: PASS

---

### Task 3: ถอดปุ่ม A4 จากหน้ารายละเอียด

**Files:**
- Modify: `src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js:606-615`
- Test: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: action bar เดิมของหน้ารายละเอียด
- Produces: action bar ที่ไม่มี direct A4 link แต่คง Excel/Print actions อื่นตามเดิม

- [ ] **Step 1: ลบ anchor ของปุ่ม A4 เท่านั้น**

ลบ block นี้โดยไม่แก้ปุ่มถัดไป:

```jsx
<a
  href={`/production-line/stock/balance/lot?${new URLSearchParams(
    filters.productCodes.map((code) => ["productCodes", code])
  ).toString()}`}
  className="inline-flex h-12 items-center gap-2 border border-[#d4af37] px-4 text-sm font-bold text-[#102C57] transition hover:bg-[#fff8e7]"
>
  <Files size={16} />
  รายงาน A4 แนวตั้ง
</a>
```

- [ ] **Step 2: รัน test กรณีถอดปุ่ม**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs --test-name-pattern="no longer links"`

Expected: PASS

---

### Task 4: ทำพรีวิว A4 ให้เป็น standalone paper

**Files:**
- Modify: `src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js:582-654`
- Test: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: `reportPages`, `currentViewPage`, toolbar handlers และ print shell เดิม
- Produces: toolbar และ paginator ที่ไม่มี outer card พร้อม A4 paper สีขาวมีเงา

- [ ] **Step 1: ถอด styling ของ outer report card**

เปลี่ยน opening section จาก:

```jsx
<section className="flex flex-col gap-4 border-2 border-[#102c57] bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.08)] sm:p-8">
```

เป็น:

```jsx
<section className="flex flex-col gap-4">
```

- [ ] **Step 2: ให้พื้นที่พรีวิวใช้พื้นหลังหน้าหลักและเว้นระยะรอบกระดาษ**

เปลี่ยน:

```jsx
<div className="overflow-auto bg-slate-100 py-6">
```

เป็น:

```jsx
<div className="overflow-auto py-6 sm:px-4">
```

คง `lot-balance-portrait-print-shell`, ขนาด `210mm × 297mm`, `bg-white` และ shadow เดิมไว้

- [ ] **Step 3: ลบ import `Files` หากไม่มีการใช้งานในไฟล์ A4**

```js
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck,
  FileSearch,
  LayoutGrid,
  // ...imports เดิมที่ยังใช้งาน
} from "lucide-react";
```

- [ ] **Step 4: รัน test กรณีกระดาษ A4**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs --test-name-pattern="standalone shadowed paper"`

Expected: PASS

---

### Task 5: ตรวจสอบรวมและคุณภาพโค้ด

**Files:**
- Verify: `src/features/production-line/components/WeightScalePrimaryHeader.js`
- Verify: `src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js`
- Verify: `src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js`
- Verify: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: ผลลัพธ์จาก Tasks 1-4
- Produces: verified feature ที่ไม่มี lint error ในไฟล์ที่แตะ

- [ ] **Step 1: รัน regression test ทั้งไฟล์**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: 3 tests PASS, 0 FAIL

- [ ] **Step 2: รัน ESLint เฉพาะไฟล์ที่แก้**

Run: `npx eslint "src/features/production-line/components/WeightScalePrimaryHeader.js" "src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js" "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js" "tests/stock-lot-balance-report-navigation.test.mjs"`

Expected: exit code 0

- [ ] **Step 3: ตรวจ source diff แบบ manual**

ตรวจว่าไม่มีการเปลี่ยนไฟล์ API, database migration, หน้าชั่งเข้า, หน้าชั่งคืน หรือหน้าเบิก และ route ทั้งสองยังใช้ server data loader เดิม

Expected: diff จำกัดอยู่ที่ไฟล์ UI 3 ไฟล์, test 1 ไฟล์ และเอกสารเท่านั้น

- [ ] **Step 4: Commit หาก workspace รองรับ Git**

```bash
git add docs/superpowers/specs/2026-07-15-stock-lot-balance-report-menu-design.md docs/superpowers/plans/2026-07-15-stock-lot-balance-report-menu.md tests/stock-lot-balance-report-navigation.test.mjs src/features/production-line/components/WeightScalePrimaryHeader.js src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js
git commit -m "feat: split lot balance report navigation"
```

Expected: commit สำเร็จเมื่อมี Git repository; หากไม่มี ให้รายงานข้อจำกัดโดยไม่สร้าง repository ใหม่
