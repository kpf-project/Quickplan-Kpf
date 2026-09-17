# Codex Context (Persistent Handoff)

อัปเดตล่าสุด: 2026-02-10

## 1) เป้าหมายโปรเจกต์ (Current Goal)
- ต้องการให้สินค้า 1 SKU รองรับหลายสูตร BOM (formula variants)
- หน้า `production-line/planning` ต้องให้ผู้ใช้เลือกสูตรก่อนคำนวณวัตถุดิบ
- ต้องคง behavior เดิมให้ใช้งานได้ (backward compatible)
- ต้องการ schema/db ที่ปลอดภัย เร็ว และไม่เกิด warning ที่พบบ่อยใน Supabase

## 2) สิ่งที่ทำแล้ว (Implemented)
- แก้ hydration mismatch + token parsing + icon 404 บางส่วนในโค้ดแอป
  - `src/features/raw-material-requisitions/components/RawMaterialRequisitionsPageClient.js`
  - `src/lib/adminApi.js`
  - `src/app/layout.js`

- เพิ่ม migration:
  - `supabase/migrations/20260411_add_bom_formula_variants.sql`
    - เพิ่ม `formula_code`, `formula_name` ใน `production_bom_versions`
    - เพิ่มคอลัมน์สูตรใน `production_plan_status`
    - เพิ่ม index ที่เกี่ยวข้อง
  - `supabase/migrations/20260412_harden_planning_and_add_bom_formulas.sql`
    - สร้างตาราง `production_bom_formulas`
    - backfill สูตรจาก `production_bom_versions`
    - เพิ่ม constraint/index และ RLS/policies สำหรับ `production_bom_formulas` และ `production_plan_status`
    - เพิ่ม permission planning ถ้ายังไม่มี

- ปรับ API/logic บางส่วนให้รองรับสูตร:
  - `src/app/api/production-boms/[skuCode]/route.js`
  - `src/app/api/production-bom-products/route.js`
  - `src/features/production-planning/services/calculationLogic.js`
  - `src/app/api/production-planning/status/route.js`

## 3) สถานะสำคัญ (Important Status)
- การเชื่อม `MCP Supabase` ยังมีปัญหา auth (`OAuth token refresh failed`) ใน session ก่อนหน้า
- ยังไม่ได้ยืนยัน schema จริงจาก DB production โดยตรงผ่าน MCP
- มีการแก้โค้ดหลายจุดแล้ว ควร lint/test และตรวจ behavior end-to-end ก่อน deploy

## 4) งานค้าง (Next TODO)
1. ตรวจ syntax/lint ไฟล์ที่แก้ล่าสุดทั้งหมด
2. ทดสอบ flow BOM + Planning end-to-end:
   - บันทึกหลายสูตรใน SKU เดียว
   - เลือกสูตรใน planning
   - คำนวณและยืนยันแผน
   - ตรวจ `bom_snapshot` ว่าผูกสูตรถูกต้อง
3. ถ้า MCP Supabase ใช้ได้ ให้ตรวจ schema จริง:
   - table/column/index/rls/policy ให้ตรง migration
4. ปรับ UI หน้า BOM/Planning ให้มีสูตรแบบ responsive ตามดีไซน์เดิม

## 5) คำสั่งเช็คเร็ว (Quick Commands)
```bash
npx eslint "src/lib/adminApi.js" "src/app/layout.js" "src/app/api/production-boms/[skuCode]/route.js" "src/app/api/production-bom-products/route.js" "src/features/production-planning/services/calculationLogic.js" "src/app/api/production-planning/status/route.js"
```

## 6) วิธีใช้งานไฟล์นี้ (For Next Codex Session)
- ทุกครั้งที่เริ่มงาน ให้เปิดไฟล์นี้ก่อน:
  - `docs/codex-context.md`
- หลังจบงานในแต่ละรอบ ให้อัปเดต:
  - วันที่
  - สิ่งที่ทำแล้ว
  - TODO ถัดไป
  - blockers ที่ยังติด
