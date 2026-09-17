# Stock Issue Mobile Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลดความหนาแน่นของ picker บนมือถือและให้ตาราง/การยืนยันใช้งานได้สะดวกขึ้น

**Architecture:** เพิ่ม presentation state หนึ่งตัวสำหรับเปิด filters บนมือถือ แล้ว render mobile search bar แยกจาก desktop filter grid โดยใช้ filter/query handlers เดิม Footer เดิมจะเพิ่ม mobile-only selection summary และ compact pagination โดยไม่เปลี่ยน data flow

**Tech Stack:** React, Tailwind CSS, Node test runner, ESLint, Next.js 16

## Global Constraints

- คงตารางแบบ horizontal scroll
- ไม่เปลี่ยน API, query parameters, selection state หรือ issue payload
- Desktop layout ต้องคงเดิมตั้งแต่ `lg` breakpoint
- Mobile controls มี accessible name และ touch target อย่างน้อย 44px

---

### Task 1: Mobile picker regression contract

**Files:**
- Modify: `tests/production-stock-issue-responsive.test.mjs`

- [ ] เพิ่ม assertions สำหรับ `isMobileFiltersOpen`, `aria-expanded`, copy “ตัวกรองเพิ่มเติม”, mobile-only search และ mobile footer summary
- [ ] รัน `npm run test -- tests/production-stock-issue-responsive.test.mjs` และยืนยันว่า FAIL ก่อนแก้ component

### Task 2: Compact mobile picker

**Files:**
- Modify: `src/features/production-line/components/ProductionStockIssuePageClient.js`

- [ ] เพิ่ม `isMobileFiltersOpen` state และปิด state เมื่อปิด picker
- [ ] เพิ่ม mobile search row ที่ใช้ `pickerFilters.search` และ `handleSearchPicker` เดิม
- [ ] ซ่อน date/product filters บน mobile จนกด “ตัวกรองเพิ่มเติม”; desktop แสดงเดิม
- [ ] เพิ่ม `aria-expanded`, `aria-controls`, focus-visible และ active-filter indicator
- [ ] เพิ่ม mobile footer summary และ compact previous/next buttons
- [ ] รัน focused test ให้ PASS

### Task 3: Verify

**Files:**
- Verify component and responsive test

- [ ] รัน focused ESLint
- [ ] รัน `npm run lint`
- [ ] รัน `npm run build`
