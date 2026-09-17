-- Migration: 20260709_fix_piece_rate_logs_request_id_unique.sql
-- Description: Clean up duplicate piece rate logs and add unique constraint on request_id for idempotency.

BEGIN;

-- 1. ลบข้อมูลที่ซ้ำกันในตาราง production_piece_rate_logs โดยเก็บเฉพาะแถวแรกสุดของแต่ละ request_id (ตาม logged_at)
DELETE FROM public.production_piece_rate_logs
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY logged_at ASC) as row_num
    FROM public.production_piece_rate_logs
  ) t
  WHERE t.row_num > 1
);

-- 2. เพิ่ม UNIQUE constraint ให้กับฟิลด์ request_id เพื่อให้ระบบ idempotency (ป้องกันการบันทึกซ้ำ) ทำงานได้สมบูรณ์
ALTER TABLE public.production_piece_rate_logs
  ADD CONSTRAINT production_piece_rate_logs_request_id_key UNIQUE (request_id);

COMMIT;
