# Checklist ทดสอบระบบ Production Planning แบบครบจบ (ภาษาคน)

วันที่: 2026-02-13  
อ้างอิง: `docs/PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`

## 1) เป้าหมายการเทส
เทสให้ครบทั้งเส้นงานจริง:
- ผูก BOM -> ขออนุมัติ BOM -> วางแผนใหญ่ -> แตกแผนย่อย -> คุมวัตถุดิบ -> Replan -> Trace ย้อนรอย -> ปิด UAT

## 2) ผู้ทดสอบที่ต้องมี
- `Manager` (หัวหน้าแผน)
- `Editor` (QA/หัวหน้างานแผนก)
- `Viewer` (ผู้ดูรายงาน)

## 3) ข้อมูลที่ต้องเตรียมก่อนเริ่ม
- [ ] มี SKU ทดสอบ FG, WIP, RAW ครบ
- [ ] มี 2 แผนกขึ้นไป และตั้ง owner ของ SKU แล้ว
- [ ] มี stock จริง + open PO บางรายการ (ให้เกิด ETA)
- [ ] มี user ครบ 3 role
- [ ] กำหนด Plan No ทดสอบ เช่น `MP-2026-W07-001`

---

## 4) Checklist แบบทีละขั้น (ทำตามลำดับ)

## A. BOM และ Approval Policy
- [ ] เข้า `Production Line > BOM`
- [ ] เลือก FG ที่จะทดสอบ แล้วบันทึกสูตรให้ครบ:
  - [ ] `base_batch > 0`
  - [ ] `base_output_boxes > 0`
  - [ ] material type ผ่าน matrix
- [ ] กดขออนุมัติ
- [ ] ทดสอบเคสผิด 1 ครั้ง (เช่น base_batch = 0) เพื่อยืนยันว่าโดนบล็อกจริง
- [ ] อนุมัติเคสที่ถูกต้องให้สำเร็จ

Expected:
- สูตรไม่พร้อมต้องขออนุมัติไม่ผ่าน
- สูตรพร้อมจึงอนุมัติผ่าน

หลักฐาน:
- Screenshot หน้า BOM ก่อน/หลัง approve
- Screenshot error policy

---

## B. Master Plan (หัวหน้าวางแผนใหญ่)
- [ ] ล็อกอินด้วย `Manager`
- [ ] เข้า `Production Line > Planning > Master`
- [ ] กำหนดช่วงวัน 1 สัปดาห์
- [ ] ใส่ Plan No มาตรฐาน (MP-YYYY-WWW-XXX)
- [ ] เพิ่มสินค้า FG และจำนวน batch ตามแผน
- [ ] กด `Publish Master Plan`

Expected:
- publish สำเร็จ
- แผนพร้อมไป Workbench/InBox
- snapshot ตอน publish ถูกบันทึก

หลักฐาน:
- Screenshot publish success
- Screenshot plan summary

---

## C. Workbench (QA/แผนก)
- [ ] ล็อกอินด้วย `Editor`
- [ ] เข้า `Planning > Workbench` หรือ `Planning > Inbox`
- [ ] ค้นหา `Plan No` เดียวกับที่ publish
- [ ] ตรวจว่าแถวงานแผนกตัวเองแก้ได้, แผนกอื่นอ่านอย่างเดียว
- [ ] กดคำนวณ
- [ ] ตรวจค่าที่ต้องขึ้นในตาราง:
  - [ ] Feasible Batch
  - [ ] Short Batch
  - [ ] Backorder Batch
  - [ ] Earliest ETA
  - [ ] Exception Reason
- [ ] กดยืนยัน Sub Plan

Expected:
- ระบบแตก BOM แบบ FG -> WIP -> RAW ได้
- ของไม่พอแล้วเห็น short/backorder ชัด
- Editor แก้ได้เฉพาะ own scope

หลักฐาน:
- Screenshot ก่อนคำนวณ / หลังคำนวณ
- Screenshot แถวที่มี shortage/backorder

---

## D. รูปแบบการเบิกของ 2 แผนก (ตามงานจริง)
- [ ] แผนก A: ทดสอบเบิกของตามแผนย่อยทั้งสัปดาห์
- [ ] แผนก B: ทดสอบเบิกแบบวันต่อวันตามแผนย่อย
- [ ] ถ้าทำไม่ได้ตามแผน ให้กรอกหมายเหตุเหตุผลในรายการ

Expected:
- ทั้ง 2 วิธีทำงานได้จริง
- ย้อนรอยได้ว่าเบิกของสัมพันธ์กับแผนย่อยไหน

หลักฐาน:
- Screenshot รายการแผนย่อย + หมายเหตุ

---

## E. Control Tower + ETA + Replan
- [ ] ล็อกอิน `Manager`
- [ ] เข้า `Planning > Control Tower`
- [ ] เลือกช่วงวันเดียวกับแผน
- [ ] ตรวจ KPI หลัก:
  - [ ] delayed plans
  - [ ] short/backorder
  - [ ] net gap
- [ ] ใส่ ETA feedback (วัตถุดิบมาช้า)
- [ ] สั่ง replan
- [ ] ตรวจผลหลัง replan (วันที่/สถานะเปลี่ยนตาม ETA)

Expected:
- ETA กระทบแผนจริง
- Replan queue ทำงาน

หลักฐาน:
- Screenshot ก่อนและหลัง ETA feedback
- Screenshot รายการ replan jobs

---

## F. Trace (main -> sub -> material movement)
- [ ] เข้า `Planning > Trace`
- [ ] ค้นหา Plan No
- [ ] ตรวจว่าเห็น:
  - [ ] Main plans
  - [ ] Sub plans
  - [ ] Material impact
  - [ ] Exception summary
- [ ] ตรวจส่วน `Material Movement Log`
  - [ ] มี Issue
  - [ ] มี PO Receipt
  - [ ] มี MO Receipt
  - [ ] มีเลขเอกสาร/วันที่/ปริมาณ
- [ ] กดลิงก์ไปหน้าคลังเพื่อตรวจรายการต้นทาง

Expected:
- Trace ถึง movement จริง ไม่ใช่แค่ impact รวม

หลักฐาน:
- Screenshot trace summary
- Screenshot movement log table

---

## G. Report / Expired
- [ ] เข้า `Planning > Report`
- [ ] เข้า `Planning > Expired`
- [ ] ทดสอบ filter Plan No / Department / Plan Kind
- [ ] ตรวจ root-cause ต่อรายการ
- [ ] กด action Replan/Trace จากรายการได้

Expected:
- หน้างานเห็นเหตุผลชัด และมีทางลัดไปแก้ปัญหา

---

## H. ทดสอบสิทธิ์ครบ 3 บทบาท
- [ ] `Manager` publish/replan ได้
- [ ] `Editor` คำนวณ/แก้ได้เฉพาะแผนกตัวเอง
- [ ] `Viewer` ดูได้ แต่กด action เขียนข้อมูลไม่ได้ (ต้องโดน deny)

Expected:
- role lock ตรงตาม DoD

แนะนำรันสคริปต์:
- `node scripts/verify-planning-role-workflow.mjs`
- `node scripts/run-production-planning-uat-evidence.mjs`

---

## 5) หน้าสำคัญ: หน้านี้แสดงอะไร และมาจากข้อมูลไหน

## 5.1 หน้า BOM (`/production-line/bom`)
แสดงอะไร:
- สูตร BOM ต่อ SKU, version, formula, base batch/output
- สถานะอนุมัติ

ข้อมูลมาจากไหน:
- API: `/api/production-boms/[skuCode]`, `/api/production-bom-products`
- ขออนุมัติ: `/api/line/notify`
- อนุมัติ/ปฏิเสธ: `/api/production-bom-approvals`
- ตารางหลัก: `production_boms`, `production_bom_versions`, `production_bom_items`

ตัวอย่าง:
- FG-A สูตรล่าสุด version 5 status `approved`
- ถ้า base_batch = 0 จะโดนบล็อกก่อนอนุมัติ

## 5.2 หน้า Master/Workbench/Report/Expired (`/production-line/planning/*`)
แสดงอะไร:
- รายการแผนหลัก/แผนย่อย
- ตัวเลข feasible/short/backorder/ETA
- สถานะและเหตุผล exception

ข้อมูลมาจากไหน:
- API หลัก: `/api/production-planning/status`
- คำนวณ: `/api/production-planning/calculate`
- publish: `/api/production-planning/master-publish`
- inbox: `/api/production-planning/inbox`
- ตารางหลัก: `production_plan_status`, `production_master_plans`, `production_sub_plans`

ตัวอย่าง:
- FG-A 16 batch -> feasible 8, short 8, backorder 8, ETA 2026-02-18

## 5.3 หน้า Control Tower (`/production-line/planning/control-tower`)
แสดงอะไร:
- demand ข้ามแผนก
- delayed plans, net gap, backlog
- ETA feedback และคิว replan

ข้อมูลมาจากไหน:
- API: `/api/production-planning/control-tower`
- ETA: `/api/production-planning/eta-feedback`
- Queue: `/api/production-planning/replan/jobs`
- แหล่งข้อมูลเสริม: gateway `/api/open-po-eta-by-sku`, `/api/raw-materials-summary-by-skus`

ตัวอย่าง:
- RAW-X required 1000, incoming 400 => net gap 600

## 5.4 หน้า Trace (`/production-line/planning/trace`)
แสดงอะไร:
- ความเชื่อมโยง main -> sub -> material impact
- movement log จริง (Issue / PO Receipt / MO Receipt)

ข้อมูลมาจากไหน:
- API: `/api/production-planning/trace`
- trace ดึง movement จริงผ่าน gateway `/api/material-movement-log`
- movement query ERP หลักจาก `SKUMOVE`, `DOCINFO`, `DOCTYPE`, `SKUMASTER`

ตัวอย่าง:
- แผน MP-2026-W07-001 แสดงว่า Issue RAW-X 300, PO Receipt RAW-X 200, MO Receipt WIP-A 50

## 5.5 หน้า Capacity Planner (`/production-line/planning/capacity-planner`)
แสดงอะไร:
- capacity รายแผนก
- policy scheduling
- advanced scheduling preview

ข้อมูลมาจากไหน:
- API: `/api/production-planning/scheduling/capacities`
- API: `/api/production-planning/scheduling/policies`
- API: `/api/production-planning/scheduling/advanced`

---

## 6) ปิดงาน UAT ให้ครบจริง (ต้องติ๊กครบ)
- [ ] Flow ทั้งเส้นผ่าน
- [ ] หลักฐาน screenshot ครบ
- [ ] Role 3 บทบาทผ่าน
- [ ] Movement mapping ผ่าน
- [ ] Sign-off ครบจากทีมที่เกี่ยวข้อง

เอกสารผลที่ต้องแนบ:
- `docs/UAT_EXECUTION_LOG_PRODUCTION_PLANNING_FLOW_2026-02-13.md`
- `docs/UAT_EXECUTION_RESULTS_PRODUCTION_PLANNING_FLOW_*.md`
- `docs/ROLE_E2E_RESULTS_PRODUCTION_PLANNING_*.md`
- `docs/MOVEMENT_MAPPING_ACCEPTANCE_*.md`
