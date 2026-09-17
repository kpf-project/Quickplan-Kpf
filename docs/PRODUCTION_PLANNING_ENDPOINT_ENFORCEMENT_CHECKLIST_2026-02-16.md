# Production Planning Endpoint Enforcement Checklist

วันที่อัปเดต: `2026-02-16`  
สถานะ: `Implemented`

Legend:
- `ENFORCED` = บังคับแล้วใน endpoint
- `OPTIONAL_BY_DESIGN` = ไม่บังคับ Plan No โดยตั้งใจ (read/report)
- `N/A` = ไม่ใช่ endpoint ที่ผูกกับแผนโดยตรง

## 1) Plan-Bound Write Endpoints

| Endpoint | Method | Plan No Enforcement | Role Owner Enforcement | สถานะ |
|---|---|---|---|---|
| `/api/production-planning/calculate` | `POST` | บังคับ `masterPlanNo` + format + ตรวจ mismatch ใน `plannedItems` | บังคับ `editable owner SKU` สำหรับ non-manage | `ENFORCED` |
| `/api/production-planning/status` | `POST` | บังคับ `masterPlanNo` ทุก record | บังคับ `owner SKU` และ `owner department` สำหรับ non-manage | `ENFORCED` |
| `/api/production-planning/status` | `PATCH` | บังคับ `masterPlanNo` + ต้องตรงกับ plan row | บังคับ `owner SKU` และ `owner department` สำหรับ non-manage | `ENFORCED` |
| `/api/production-planning/status` | `DELETE` | บังคับ `masterPlanNo` + ทุก `planId` ต้องอยู่ใน Plan No เดียวกัน | บังคับ `owner SKU` และ `owner department` สำหรับ non-manage | `ENFORCED` |
| `/api/production-planning/wip-sufficiency` | `GET` | บังคับ `masterPlanNo` + format | กรอง owner department scope สำหรับ non-manage | `ENFORCED` |
| `/api/production-planning/wip-plan/draft` | `POST` | บังคับ `masterPlanNo` + format | บังคับ editable department | `ENFORCED` |
| `/api/production-planning/requisition/export` | `POST` | บังคับ `masterPlanNo` + format | บังคับ editable department ก่อน export + แยกวัตถุดิบตาม `material owner` | `ENFORCED` |
| `/api/requisitions/reconcile` | `POST` | อ้างอิง `master_plan_no` จาก export document (ต้องมี) | บังคับ editable department จาก export document | `ENFORCED` |

## 2) Plan Context Endpoints (Read / Monitoring)

| Endpoint | Method | Plan No Enforcement | Role Owner Enforcement | สถานะ |
|---|---|---|---|---|
| `/api/production-planning/inbox` | `GET` | `planNo` เป็น optional filter | บังคับ read/edit scope ตามสิทธิ์ | `OPTIONAL_BY_DESIGN` |
| `/api/production-planning/trace` | `GET` | `planNo` เป็น optional filter | บังคับ department scope สำหรับ non-manage | `OPTIONAL_BY_DESIGN` |
| `/api/production-planning/control-tower` | `GET` | ไม่บังคับ Plan No (ช่วงวัน/แผนก) | บังคับ department scope สำหรับ non-manage | `OPTIONAL_BY_DESIGN` |
| `/api/production-planning/status` | `GET` | ไม่บังคับ Plan No (โหลด workbench ทั้งชุด) | ส่ง `can_edit` + editable scope ใน meta | `OPTIONAL_BY_DESIGN` |

## 3) Non Plan-Bound / Admin Endpoints

| Endpoint | Method | Plan No Enforcement | Role Owner Enforcement | สถานะ |
|---|---|---|---|---|
| `/api/production-planning/master-publish` | `POST` | ใช้ `planGroupId` เพื่อ canonicalize เป็น Master Plan No | ใช้สิทธิ์ publish/manage | `N/A` |
| `/api/production-planning/departments` | `GET` | N/A | บังคับตามบทบาท/การเป็นสมาชิกแผนก | `N/A` |
| `/api/production-planning/replan` | `POST` | N/A (exception workflow) | ใช้สิทธิ์ approve/manage | `N/A` |
| `/api/production-planning/replan/jobs` | `POST/GET` | N/A | ใช้สิทธิ์ approve/view/manage | `N/A` |
| `/api/production-planning/replan/worker` | `POST` | N/A | ใช้สิทธิ์ approve/manage | `N/A` |
| `/api/production-planning/eta-feedback` | `POST/GET` | N/A | ใช้สิทธิ์ approve/view/manage | `N/A` |
| `/api/production-planning/scheduling/*` | `GET/POST` | N/A | ใช้สิทธิ์ approve/view/manage | `N/A` |

## 4) ช่องโหว่ที่ปิดแล้วในรอบนี้

1. ปิดการคำนวณแบบไม่มี Plan No ใน `calculate`
2. ปิดการแก้/ลบ plan ข้าม Plan No ใน `status PATCH/DELETE`
3. ปิดการ export/reconcile ข้ามแผนกของผู้ใช้ใน `requisition/export` และ `requisitions/reconcile`
4. บังคับ format ของ Plan No ใน endpoint ที่ผูกกับแผน
