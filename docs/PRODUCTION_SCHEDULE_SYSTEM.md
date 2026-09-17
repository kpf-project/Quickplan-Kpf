# ระบบตารางผลิต (Production Schedule System)
> เอกสารฉบับนี้อธิบาย flow ทั้งหมด สิ่งที่สร้างแล้ว และสิ่งที่ต้องทำต่อ
> อัปเดตล่าสุด: 2026-03-23

---

## 1. ภาพรวม — ระบบนี้ทำอะไร

ระบบตารางผลิตเป็น **หน้าวางแผนการผลิตหลัก** ของแต่ละแผนก
แทนที่ระบบ Master Plan เดิม (ProductionPlanningPageClient) ที่ซับซ้อนเกินไป

**แนวคิดหลัก:**
- แต่ละแผนกมี **template** เป็นของตัวเอง (กำหนดได้ว่าจะมีกี่ section, กี่คอลัมน์)
- กรอกข้อมูลรายสัปดาห์ (จ–ส) ผ่านตารางที่ยืดหยุ่น
- ข้อมูลที่กรอกไว้ = **แผนการผลิตหลักของแผนกนั้น**
- QA และแผนกอื่นมองเห็นแผนนี้ และวางแผนย่อยตามสิทธิ์ที่มี

---

## 2. Flow การทำงานทั้งระบบ

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: ตั้งค่า Template (ทำครั้งเดียว / แก้เมื่อต้องการ)        │
│ Admin → /admin/schedule-config                                   │
│ • สร้าง template ต่อแผนก                                         │
│ • กำหนด section (เช่น ซองใน, บรรจุ, ขนส่ง)                       │
│ • กำหนดคอลัมน์ (ชื่อสินค้า, จำนวน, น้ำหนัก, เวลา ฯลฯ)           │
│ • ผูก template กับแผนก                                           │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: วางแผนการผลิต (ทุกสัปดาห์)                               │
│ /production-line/planning/schedule                               │
│ • แผนก เลือกสัปดาห์ที่ต้องการวางแผน                              │
│ • กรอกข้อมูลแต่ละวัน: ชื่อสินค้า, จำนวน, เวลาผลิต ฯลฯ           │
│ • ระบบ auto-generate เลขแผน (MPYYYYMMXXX)                        │
│ • บันทึก → สถานะ "draft" หรือ "published"                        │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: QA / แผนกที่เกี่ยวข้อง มองเห็นแผน                        │
│ /production-line/planning/plan  (งานแผนก)                        │
│ • QA เห็นเฉพาะสินค้าที่แผนกตัวเองเป็น "owner"                   │
│   (ตั้งค่าที่ /production-line/settings/department-products)     │
│ • QA วางแผนย่อยลงใน row ที่เกี่ยวข้อง (sub_plan_id)              │
│ • ระบบคำนวณ BOM / วัตถุดิบเหมือนเดิมทุกอย่าง                    │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: คำนวณ BOM + เบิกวัตถุดิบ (ระบบเดิม ยังใช้อยู่)           │
│ • BOM explosion จาก sku_code + qty ใน schedule rows              │
│ • เชื่อมกับ production_plan_status เดิม ผ่าน master_plan_no      │
│ • Material claims (/production-line/planning/claims)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. สิทธิ์การใช้งาน (Permission Model)

### 3.1 สิทธิ์หลัก (Permission Keys)

| Permission Key | ใครมี | ทำอะไรได้ |
|---|---|---|
| `production-line-planning-manage` | Planner / Admin | ทุกอย่าง |
| `production-line-planning-view` | ผู้ชม | ดูอย่างเดียว |
| `plan.edit_own_dept` | หัวหน้าแผนก | แก้ไขได้เฉพาะแผนกตัวเอง |

### 3.2 สิทธิ์ตามสินค้า (QA Product Scope)

```
production_department_users  →  department_id + user_id + role (editor/viewer)
         ↓
production_department_products  →  department_id + sku_code + is_owner
         ↓
QA เห็นเฉพาะ sku_code ที่ department ตัวเองเป็น is_owner = true
```

**ตั้งค่าที่:** `/production-line/settings/department-products`
- แท็บ "สินค้าตามแผนก" — ผูก sku_code กับแผนก
- `is_owner = true` — แผนกนั้นรับผิดชอบสินค้านี้ (QA จะเห็น)
- `is_owner = false` — แผนกรู้จักสินค้า แต่ไม่ได้รับผิดชอบ

---

## 4. Database Schema

### 4.1 ตารางที่สร้างใหม่ (Production Schedule System)

```sql
-- Template: 1 template ต่อ 1 แผนก
production_schedule_templates
  id              uuid PK
  name            text
  department_id   uuid → production_departments
  status          text  ('draft' | 'active')
  created_at, updated_at, created_by

-- Section: กลุ่มของตาราง (เช่น "ซองใน", "บรรจุ")
production_schedule_section_defs
  id              uuid PK
  template_id     uuid → production_schedule_templates
  name            text
  display_order   int
  color_theme     text  ('slate'|'indigo'|'teal'|...)

-- Column: คอลัมน์ในแต่ละ section
production_schedule_column_defs
  id              uuid PK
  section_def_id  uuid → production_schedule_section_defs
  key             text  (ชื่อ field ใน row_data JSONB)
  label           text  (ชื่อที่แสดงในหัวตาราง)
  col_type        text  ('text'|'number'|'time'|'sku_picker'|'brand_auto')
  display_order   int
  width           text  (CSS width เช่น '80px')
  highlight_color text  (สีพื้น: 'blue'|'amber'|...)
  group_label     text  (ชื่อกลุ่มหัว colspan)
  group_order     int
  auto_fill_field text  (key ของคอลัมน์ที่จะ auto-fill brand)
  is_required     boolean
  UNIQUE(section_def_id, key)

-- Plan: 1 plan ต่อ 1 แผนก ต่อ 1 สัปดาห์
production_schedule_plans
  id              uuid PK
  department_id   uuid → production_departments
  week_start_date date  (วันจันทร์ของสัปดาห์)
  template_id     uuid → production_schedule_templates
  status          text  ('draft' | 'published')
  master_plan_no  text  (รูปแบบ MPYYYYMMXXX)  ← TODO: auto-generate
  notes           text
  created_at, created_by
  UNIQUE(department_id, week_start_date)

-- Row: แถวข้อมูลในตาราง
production_schedule_rows
  id              uuid PK
  plan_id         uuid → production_schedule_plans
  section_def_id  uuid → production_schedule_section_defs
  day_key         text  ('mon'|'tue'|'wed'|'thu'|'fri'|'sat')
  display_order   int
  row_data        jsonb  (ข้อมูลทุก field ตาม column_defs)
  sub_plan_id     uuid  (NULL | → production plan ย่อยของ QA)
  created_at, created_by
```

### 4.2 ตารางที่ใช้ร่วม (ระบบเดิม)

```sql
production_departments          -- แผนก
production_department_users     -- user ↔ แผนก (role: editor/viewer)
production_department_products  -- sku ↔ แผนก (is_owner)
products_cache                  -- cache สินค้าจาก ERP (sku_code, sku_name, brand_name, uom_name)
production_plan_status          -- แผนที่ confirmed แล้ว (เชื่อม BOM)
```

---

## 5. API Routes

### 5.1 Schedule Config (Admin)

| Method | Path | ทำอะไร |
|---|---|---|
| GET/POST | `/api/production-planning/schedule/templates` | list / create template |
| GET/PUT | `/api/production-planning/schedule/templates/[id]` | get / update template |
| POST | `/api/production-planning/schedule/templates/[id]/sections` | สร้าง section |
| PUT/DELETE | `/api/production-planning/schedule/section-defs/[id]` | แก้ / ลบ section |
| POST | `/api/production-planning/schedule/section-defs/[id]/columns` | สร้าง column |
| PUT/DELETE | `/api/production-planning/schedule/column-defs/[id]` | แก้ / ลบ column |

### 5.2 Schedule Plans (Department)

| Method | Path | ทำอะไร |
|---|---|---|
| GET/POST | `/api/production-planning/schedule/plans` | list / create plan |
| GET/PUT | `/api/production-planning/schedule/plans/[id]` | get / update plan |
| GET/POST/DELETE | `/api/production-planning/schedule/plans/[id]/rows` | CRUD rows |
| PUT/DELETE | `/api/production-planning/schedule/rows/[id]` | แก้ / ลบ row เดี่ยว |
| GET | `/api/production-planning/schedule/inbox` | list published plans + rows ตามสิทธิ์แผนก/owner SKU |

### 5.3 Lookup APIs

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/api/production-planning/schedule/sku-catalog` | รายชื่อสินค้า FG สำหรับ picker |
| GET | `/api/production-planning/departments` | รายชื่อแผนก (scope=assigned) |

---

## 6. สิ่งที่สร้างแล้ว ✅

### 6.1 Admin Config UI
- **หน้า:** `/admin/schedule-config`
- **Component:** `src/features/production-planning/components/ScheduleConfigClient.js`
- สร้าง/แก้ template, section, column
- drag-and-drop เรียงลำดับคอลัมน์
- ผูก template กับแผนก
- label ภาษาไทย, auto-suggest key จาก label

### 6.2 หน้าวางแผน (Schedule Page)
- **หน้า:** `/production-line/planning/schedule`
- **Component:** `src/features/production-planning/components/ProductionScheduleClient.js`
- เลือกแผนก (auto-select ถ้ามีแผนกเดียว)
- Section tabs — กดเลือกทีละ section ไม่รก
- ตาราง A4-style card กว้าง max-w-6xl
- นำทางสัปดาห์ ◄ ►
- บันทึก (save) ข้อมูล

### 6.3 Dynamic Table Renderer
- **Component:** `src/features/production-planning/components/GenericScheduleTable.js`
- render column ตาม `col_type` อัตโนมัติ
- `sku_picker` → modal เลือกสินค้า (แสดง รหัส / ชื่อ / หน่วย, ค้นหาได้)
- `brand_auto` → auto-fill brand เมื่อเลือก sku
- `number`, `text`, `time` — inline edit
- แสดง / เพิ่ม / ลบ แถวต่อวัน

### 6.4 SKU Catalog API
- **Endpoint:** `/api/production-planning/schedule/sku-catalog`
- ดึงสินค้า FG จาก `products_cache` (iccat_code: 04, 04-1, 04-2)
- คืนค่า `[{ skuCode, name, brand, unit }]`

### 6.5 SWR Hooks
- `useScheduleTemplates(deptId)` — list templates ของแผนก
- `useScheduleTemplate(id)` — template detail + sections + columns
- `useSchedulePlan(planId)` — plan + rows
- `useFindPlan(deptId, weekStartDate)` — หา plan ที่มีอยู่

---

## 7. สิ่งที่ต้องทำต่อ ❌

### 7.1 Auto-generate เลขแผน (master_plan_no)  🔴 สำคัญ
**รูปแบบ:** `MPYYYYMMXXX`
เช่น `MP202603001`

**วิธีทำ:**
- เมื่อ create plan ใหม่ ให้ query หา max sequence ของสัปดาห์นั้น
- เพิ่ม 1 แล้วตั้งค่า `master_plan_no` ใน `production_schedule_plans`
- แสดงเลขแผนในหัว card และ section tabs

```sql
-- ตัวอย่าง query generate เลขแผน
SELECT master_plan_no FROM production_schedule_plans
WHERE master_plan_no LIKE 'MP202603%'
ORDER BY master_plan_no DESC LIMIT 1;
-- ถ้าได้ MP202603003 → ตัวต่อไปคือ MP202603004
```

### 7.2 Publish Plan  ✅ เสร็จแล้ว
- เพิ่มปุ่ม "เผยแพร่แผน" ใน ProductionScheduleClient
- เปลี่ยน `status: 'draft'` → `status: 'published'`
- เพิ่ม API `GET /api/production-planning/schedule/inbox` สำหรับดึงแผนที่ published ตามสิทธิ์

### 7.3 หน้างานแผนก (/plan) — แสดงข้อมูลจาก Schedule ใหม่  🔴 สำคัญ
**ปัจจุบัน:** งานแผนก ดึงข้อมูลจาก `production_plan_status` (ระบบเดิม)
**ต้องการ:** ดึงจาก `production_schedule_plans` + `production_schedule_rows` แทน

**สิ่งที่ต้องสร้าง:**
1. API: `GET /api/production-planning/schedule/inbox`
   - คืน published plans ที่ user มีสิทธิ์ดู
   - กรองตาม dept ownership หรือ sku ownership
2. Component ใหม่สำหรับ "งานแผนก" ที่แสดงตาราง schedule
3. QA เห็นเฉพาะ row ที่ sku_code อยู่ใน `production_department_products` ของตัวเอง (`is_owner = true`)

### 7.4 QA Sub-plan  🟡 ถัดไป
- QA กด row ที่เห็น → วางแผนย่อย
- บันทึก `sub_plan_id` ลงใน `production_schedule_rows`
- QA เห็นได้เฉพาะ row ที่ sku เป็น owner ของ dept ตัวเอง

### 7.5 BOM Calculation เชื่อมกับ Schedule  🟡 ถัดไป
**ปัจจุบัน:** BOM explosion ทำงานกับ `production_plan_status`
**ต้องการ:** เชื่อม row ใน schedule → trigger BOM calculation

**วิธีทำ (แนวคิด):**
- `production_schedule_rows.row_data` มี `sku` (ชื่อ) → ต้องหา `sku_code` ที่ตรงกัน
- ส่ง `sku_code` + `qty` + `day_key` → calculation API เดิม
- หรือสร้าง mapping table: `schedule_row_id → production_plan_status_id`

### 7.6 แสดงเลขแผนใน UI  🟢 เล็กน้อย
- แสดง `master_plan_no` ใน card header
- แสดงในแต่ละ section tab (ถ้า published)
- Link ไปหน้า report

---

## 8. File Structure

```
src/
├── app/
│   ├── production-line/planning/schedule/
│   │   └── page.js                          ← หน้าตารางผลิต
│   ├── admin/schedule-config/
│   │   └── page.js                          ← หน้า admin config
│   └── api/production-planning/schedule/
│       ├── templates/                        ← CRUD template
│       │   ├── route.js
│       │   └── [id]/
│       │       ├── route.js
│       │       └── sections/route.js
│       ├── section-defs/[id]/
│       │   ├── route.js
│       │   └── columns/route.js
│       ├── column-defs/[id]/route.js
│       ├── plans/
│       │   ├── route.js
│       │   └── [id]/
│       │       ├── route.js
│       │       └── rows/route.js
│       ├── rows/[id]/route.js
│       └── sku-catalog/route.js              ← สินค้า FG สำหรับ picker
│
├── features/production-planning/
│   ├── components/
│   │   ├── ProductionScheduleClient.js       ← หน้าหลัก (section tabs, A4 card)
│   │   ├── GenericScheduleTable.js           ← ตารางแบบ dynamic + SKU modal
│   │   └── ScheduleConfigClient.js           ← Admin config UI
│   └── hooks/
│       ├── useScheduleConfig.js              ← SWR: template + sections + columns
│       └── useSchedulePlan.js                ← SWR: plans + rows + mutations
│
└── lib/
    └── scheduleConfig.js                     ← server-side helper: loadPlanWithRows()
```

---

## 9. หมายเหตุทางเทคนิค

### row_data format (JSONB)
```json
{
  "sku":     "คุ๊กกี้หัวปลา S",
  "brand":   "KPF",
  "size":    "S",
  "weight":  1.5,
  "qty":     200,
  "time":    "07:00-17:00",
  "note":    ""
}
```
key ชื่ออะไรขึ้นอยู่กับ `column_defs.key` ของ template นั้น

### fetcher vs fetchJson
- `fetcher` (จาก `@/lib/clientFetch`) — ใช้กับ SWR, unwrap `ok()` wrapper, throw on error
- `fetchJson` — ใช้กับ mutation (POST/PUT/DELETE), คืน `{ok, data, error, status}`

### Permission Guard
```js
// ต้องการสิทธิ์ใดสิทธิ์หนึ่ง (OR logic)
await requirePermissionKeys(request, ["key1", "key2"]);
```

### params ใน Next.js App Router (v16+)
```js
// ต้อง await params ก่อนใช้
const { id } = await params;
```

---

## 10. สรุป — จบแค่ไหน

```
✅ Template config system (Admin)
✅ Dynamic table renderer
✅ Weekly plan CRUD
✅ SKU picker modal (รหัส / ชื่อ / หน่วย)
✅ Dept picker + auto-select
✅ Section tabs (1 section ต่อครั้ง)
✅ A4-style card layout

❌ Auto-generate master_plan_no
❌ Publish plan (draft → published)
❌ งานแผนก — แสดงข้อมูลจาก schedule ใหม่
❌ QA filter ตาม sku ownership
❌ QA sub-plan บันทึก sub_plan_id
❌ เชื่อม BOM calculation กับ schedule rows
```

ลำดับการทำต่อที่แนะนำ:
1. Auto-generate `master_plan_no` ตอน create plan
2. ปุ่ม Publish plan
3. API inbox สำหรับงานแผนก (published plans)
4. หน้างานแผนก แสดง schedule data + QA filter
5. QA sub-plan UI
6. BOM integration
