-- ============================================================
-- Production Schedule Dynamic Config System
-- 2026-03-23
--
-- Tables:
--   production_schedule_templates    — one template per dept (or shared)
--   production_schedule_section_defs — ordered sections inside a template
--   production_schedule_column_defs  — column schema per section
--   production_schedule_plans        — one weekly plan per dept
--   production_schedule_rows         — actual row data (JSONB)
-- ============================================================

-- ── Templates ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_schedule_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id     uuid        REFERENCES production_departments(id) ON DELETE SET NULL,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Section Definitions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_schedule_section_defs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid        NOT NULL REFERENCES production_schedule_templates(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  color_theme   text        NOT NULL DEFAULT 'slate',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Column Definitions ─────────────────────────────────────────────────────────
-- col_type: text | number | time | sku_picker | brand_auto | select
-- group_label + group_order: for 2-row merged headers (e.g. "ซองใน" colspan=4)
-- auto_fill_field: sku_picker uses this to auto-write brand into another field key
CREATE TABLE IF NOT EXISTS production_schedule_column_defs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_def_id  uuid        NOT NULL REFERENCES production_schedule_section_defs(id) ON DELETE CASCADE,
  key             text        NOT NULL,
  label           text        NOT NULL,
  col_type        text        NOT NULL DEFAULT 'text',
  display_order   int         NOT NULL DEFAULT 0,
  width           int,                        -- px; NULL = flex-grow
  highlight_color text,                       -- blue | amber | orange | indigo | teal | purple
  group_label     text,                       -- group header text (triggers 2-row header)
  group_order     int,                        -- which group (same group_order = same header cell)
  auto_fill_field text,                       -- sku_picker: field key to auto-fill with brand
  is_required     boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_def_id, key)
);

-- ── Schedule Plans (one per dept per week) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_schedule_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id          uuid        REFERENCES production_departments(id) ON DELETE SET NULL,
  template_id      uuid        REFERENCES production_schedule_templates(id) ON DELETE SET NULL,
  master_plan_no   text,
  week_start_date  date        NOT NULL,
  status           text        NOT NULL DEFAULT 'draft',   -- draft | published
  notes            text,
  created_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dept_id, week_start_date)
);

-- ── Schedule Rows ──────────────────────────────────────────────────────────────
-- row_data JSONB holds all cell values keyed by column_def.key
-- sub_plan_id optionally links to an existing production sub-plan
CREATE TABLE IF NOT EXISTS production_schedule_rows (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid        NOT NULL REFERENCES production_schedule_plans(id) ON DELETE CASCADE,
  section_def_id  uuid        NOT NULL REFERENCES production_schedule_section_defs(id) ON DELETE CASCADE,
  day_key         text        NOT NULL,   -- mon | tue | wed | thu | fri | sat | sun
  display_order   int         NOT NULL DEFAULT 0,
  row_data        jsonb       NOT NULL DEFAULT '{}',
  sub_plan_id     uuid,                   -- nullable FK → production sub-plan
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sched_section_defs_template
  ON production_schedule_section_defs(template_id, display_order);

CREATE INDEX IF NOT EXISTS idx_sched_column_defs_section
  ON production_schedule_column_defs(section_def_id, display_order);

CREATE INDEX IF NOT EXISTS idx_sched_plans_dept_week
  ON production_schedule_plans(dept_id, week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_sched_plans_master_plan
  ON production_schedule_plans(master_plan_no)
  WHERE master_plan_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sched_rows_plan_section_day
  ON production_schedule_rows(plan_id, section_def_id, day_key, display_order);

CREATE INDEX IF NOT EXISTS idx_sched_rows_sub_plan
  ON production_schedule_rows(sub_plan_id)
  WHERE sub_plan_id IS NOT NULL;

-- ── updated_at triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_sched_templates_updated_at
  BEFORE UPDATE ON production_schedule_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sched_section_defs_updated_at
  BEFORE UPDATE ON production_schedule_section_defs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sched_column_defs_updated_at
  BEFORE UPDATE ON production_schedule_column_defs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sched_plans_updated_at
  BEFORE UPDATE ON production_schedule_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sched_rows_updated_at
  BEFORE UPDATE ON production_schedule_rows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE production_schedule_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedule_section_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedule_column_defs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedule_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedule_rows         ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all config and plan data
CREATE POLICY "sched_templates_read"    ON production_schedule_templates    FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_section_defs_read" ON production_schedule_section_defs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_column_defs_read"  ON production_schedule_column_defs  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_plans_read"        ON production_schedule_plans        FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_rows_read"         ON production_schedule_rows         FOR SELECT TO authenticated USING (true);
-- All writes are via service role through API routes (no additional policies needed)

-- ── Seed: Biscuit Department Template ─────────────────────────────────────────
-- dept_id is left NULL; assign via admin UI after running migration.
-- To assign: UPDATE production_schedule_templates SET dept_id = '<uuid>'
--            WHERE name = 'แผนการผลิต แผนกบิสกิต';
DO $$
DECLARE
  v_tpl  uuid;
  v_s1   uuid;
  v_s2   uuid;
  v_s3   uuid;
  v_s4   uuid;
  v_s5   uuid;
BEGIN

  -- Template
  INSERT INTO production_schedule_templates (name, is_active)
  VALUES ('แผนการผลิต แผนกบิสกิต', true)
  RETURNING id INTO v_tpl;

  -- ── Section 1: ป้ายครีม ──────────────────────────────────────────────────────
  INSERT INTO production_schedule_section_defs (template_id, name, display_order, color_theme)
  VALUES (v_tpl, 'ส่วนงานป้ายครีม', 1, 'yellow')
  RETURNING id INTO v_s1;

  INSERT INTO production_schedule_column_defs
    (section_def_id, key, label, col_type, display_order, width, highlight_color, auto_fill_field)
  VALUES
    (v_s1, 'time',    'เวลาทำงาน',  'time',       1, 96,   null,   null),
    (v_s1, 'brand',   'แบรนด์',     'brand_auto', 2, 64,   null,   null),
    (v_s1, 'skuName', 'ชื่อสินค้า', 'sku_picker', 3, null, null,   'brand'),
    (v_s1, 'machine', 'เครื่อง',    'text',        4, 80,   null,   null),
    (v_s1, 'qty',     'จำนวนงาน',  'number',      5, 80,   'blue', null),
    (v_s1, 'note',    'หมายเหตุ',  'text',        6, null, null,   null);

  -- ── Section 2: ป้ายแยม / เรือนจำ (grouped 2-row header) ──────────────────────
  INSERT INTO production_schedule_section_defs (template_id, name, display_order, color_theme)
  VALUES (v_tpl, 'ส่วนงานป้ายแยม / เรือนจำ', 2, 'amber')
  RETURNING id INTO v_s2;

  INSERT INTO production_schedule_column_defs
    (section_def_id, key, label, col_type, display_order, width, highlight_color, group_label, group_order, auto_fill_field)
  VALUES
    (v_s2, 'time',         'เวลา',         'time',       1,  96,   null,     null,                       null, null),
    (v_s2, 'jamBrand',     'แบรนด์',       'brand_auto', 2,  64,   null,     'ป้ายแยม',                  1,    null),
    (v_s2, 'jamSku',       'ชื่อสินค้า',   'sku_picker', 3,  null, null,     'ป้ายแยม',                  1,    'jamBrand'),
    (v_s2, 'jamPeople',    'จำนวนคน',     'number',      4,  56,   'amber',  'ป้ายแยม',                  1,    null),
    (v_s2, 'jamQty',       'จำนวนงาน',    'number',      5,  64,   'amber',  'ป้ายแยม',                  1,    null),
    (v_s2, 'prisonBrand',  'แบรนด์',       'brand_auto', 6,  64,   null,     'บรรจุปี๊บงานเรือนจำ',     2,    null),
    (v_s2, 'prisonSku',    'ชื่อสินค้า',   'sku_picker', 7,  null, null,     'บรรจุปี๊บงานเรือนจำ',     2,    'prisonBrand'),
    (v_s2, 'prisonSize',   'ไซส์',         'text',        8,  48,   null,     'บรรจุปี๊บงานเรือนจำ',     2,    null),
    (v_s2, 'prisonPeople', 'จำนวนคน',     'number',      9,  56,   'orange', 'บรรจุปี๊บงานเรือนจำ',     2,    null),
    (v_s2, 'prisonQty',    'จำนวนงาน',    'number',      10, 64,   'orange', 'บรรจุปี๊บงานเรือนจำ',     2,    null);

  -- ── Section 3: เครื่องบรรจุแนวนอน (grouped 2-row header) ─────────────────────
  INSERT INTO production_schedule_section_defs (template_id, name, display_order, color_theme)
  VALUES (v_tpl, 'เครื่องบรรจุแนวนอน : ออลพาย / โคบิส / งาหอม / BEEVER', 3, 'indigo')
  RETURNING id INTO v_s3;

  INSERT INTO production_schedule_column_defs
    (section_def_id, key, label, col_type, display_order, width, highlight_color, group_label, group_order, auto_fill_field)
  VALUES
    (v_s3, 'time',          'เวลา',                    'time',       1,  96,   null,     null,                          null, null),
    (v_s3, 'innerMachine',  'เครื่องบรรจุซองใน',       'text',        2,  80,   'indigo', 'เครื่องบรรจุซองใน',           1,    null),
    (v_s3, 'innerSku',      'ชื่อสินค้า',               'sku_picker', 3,  null, null,     'เครื่องบรรจุซองใน',           1,    null),
    (v_s3, 'innerFilm',     'ม้วนฟิลม์',               'number',      4,  64,   'indigo', 'เครื่องบรรจุซองใน',           1,    null),
    (v_s3, 'innerSmallBag', 'ซองเล็ก',                 'number',      5,  64,   'indigo', 'เครื่องบรรจุซองใน',           1,    null),
    (v_s3, 'outerMachine',  'เครื่อง AUTOPACK ซองนอก', 'text',        6,  96,   'blue',   'เครื่อง AUTOPACK ซองนอก',     2,    null),
    (v_s3, 'outerSku',      'ชื่อสินค้า',               'sku_picker', 7,  null, null,     'เครื่อง AUTOPACK ซองนอก',     2,    null),
    (v_s3, 'outerSize',     'ขนาดบรรจุ',               'text',        8,  80,   'blue',   'เครื่อง AUTOPACK ซองนอก',     2,    null),
    (v_s3, 'outerFilm',     'ม้วนฟิลม์',               'number',      9,  64,   'blue',   'เครื่อง AUTOPACK ซองนอก',     2,    null),
    (v_s3, 'outerBigBox',   'ลังใหญ่',                 'number',      10, 64,   'blue',   'เครื่อง AUTOPACK ซองนอก',     2,    null),
    (v_s3, 'note',          'หมายเหตุ',                'text',        11, null, null,     null,                          null, null);

  -- ── Section 4: ขนมปังกรอบบรรจุปี๊บ ───────────────────────────────────────────
  INSERT INTO production_schedule_section_defs (template_id, name, display_order, color_theme)
  VALUES (v_tpl, 'ส่วนขนมปังกรอบบรรจุปี๊บ', 4, 'teal')
  RETURNING id INTO v_s4;

  INSERT INTO production_schedule_column_defs
    (section_def_id, key, label, col_type, display_order, width, highlight_color, auto_fill_field)
  VALUES
    (v_s4, 'time',    'เวลาทำงาน',  'time',       1, 96,   null,   null),
    (v_s4, 'brand',   'แบรนด์',     'brand_auto', 2, 64,   null,   null),
    (v_s4, 'skuName', 'ชื่อสินค้า', 'sku_picker', 3, null, null,   'brand'),
    (v_s4, 'people',  'จำนวนคน',   'number',      4, 56,   null,   null),
    (v_s4, 'qty',     'จำนวนงาน',  'number',      5, 80,   'blue', null),
    (v_s4, 'note',    'หมายเหตุ',  'text',        6, null, null,   null);

  -- ── Section 5: งานห้องบรรจุ 400g ─────────────────────────────────────────────
  INSERT INTO production_schedule_section_defs (template_id, name, display_order, color_theme)
  VALUES (v_tpl, 'งานห้องบรรจุ 400 กรัม', 5, 'purple')
  RETURNING id INTO v_s5;

  INSERT INTO production_schedule_column_defs
    (section_def_id, key, label, col_type, display_order, width, highlight_color, auto_fill_field)
  VALUES
    (v_s5, 'time',    'เวลาทำงาน',       'time',       1, 96,   null,   null),
    (v_s5, 'brand',   'แบรนด์',          'brand_auto', 2, 64,   null,   null),
    (v_s5, 'skuName', 'ชื่อสินค้า',      'sku_picker', 3, null, null,   'brand'),
    (v_s5, 'lot',     'รุ่น',            'text',        4, 56,   null,   null),
    (v_s5, 'qtyUnit', 'จำนวนงาน',       'number',      5, 80,   'blue', null),
    (v_s5, 'qtyBox',  'จำนวนงาน (ลัง)', 'number',      6, 80,   'blue', null),
    (v_s5, 'note',    'หมายเหตุ',        'text',        7, null, null,   null);

  RAISE NOTICE 'Biscuit schedule template seeded: %', v_tpl;
END $$;
