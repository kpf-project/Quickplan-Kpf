# Production Planning – Remaining Work & Checks

สถานะปัจจุบัน (27 Jan 2026)
- UI/ฟังก์ชันที่เสร็จ: แท็บ แผน/รายงาน/หมดอายุ แยกชัด, รายการหมดอายุไม่เข้าคำนวณ, บังคับ endDate ไม่ย้อนหลัง, บันทึกสถานะลง `production_plan_status`, migration เพิ่มแล้ว `supabase/migrations/20260330_production_plan_status.sql`.
- Build/lint ผ่าน (`npm run lint`, `npm run build`).

สิ่งที่ยังไม่ทำ / ต้องเช็กเพิ่ม
1) Migration/DB
   - ยังไม่ได้ apply migration กับ Supabase จริง (`20260330_production_plan_status.sql`).
   - ยังไม่ได้สร้าง RLS policies บน `production_plan_status` (อ่าน/เขียน) ให้สอดคล้องสิทธิ์ของแอป.
   - ยังไม่ได้กำหนด index เพิ่มตาม use-case รายงาน (เช่น period_start + sku_code ถ้าจะค้นหารายสรุป).
2) คาช/ประสิทธิภาพฝั่ง Supabase
   - ยังไม่ได้เปิด pg_stat_statements / ตรวจ query plan จริงจาก API `production-planning/status`.
   - ยังไม่ได้เพิ่ม caching layer (Edge cache/Next cache components) ให้ endpoint สรุปรายงาน.
3) ฟีเจอร์ธุรกิจที่ค้าง
   - ยังไม่ตัดสต็อกจากคลังวัตถุดิบหลัง “ใช้รายการที่เลือก” (ตามที่ระบุให้ทำภายหลัง).
   - ยังไม่มี UX แจ้งเตือนว่ารายการหมดอายุจะไม่ถูกคำนวณ (optional).
   - ยังไม่มีตารางสรุปสำหรับ “ผลิตไม่ได้เพราะวัตถุดิบไม่พอภายในช่วง” (ถ้าต้องการ KPI % ทำตามแผน).
4) การเชื่อม Supabase เพิ่มเติม
   - ยังไม่ได้ทดสอบสิทธิ์ API `/api/production-planning/status` กับ token/role จริง (service role vs anon).
   - ยังไม่ได้เพิ่ม retry/backoff หรือ fallback สำหรับเน็ตช้า/DB error.
5) Monitoring/Logs
   - ยังไม่ได้ผูกการ log หรือ tracing สำหรับคอขวด (API latency, Supabase query time).

คำแนะนำถัดไป (ลำดับสั้น)
1. Apply migration บน Supabase และเพิ่ม RLS นโยบายอ่าน/เขียนให้ role ที่ใช้ในแอป
2. ตรวจ query plan ของ `/api/production-planning/status` และเพิ่ม composite index ถ้าต้องฟิลเตอร์ช่วงเวลา
3. ถ้าจะใช้ Next.js Cache Components → ติด `cacheComponents: true` แล้วใส่ `use cache + cacheTag/updateTag` รอบรายงานที่อ่านบ่อย
4. เพิ่มข้อความเตือนในแท็บแผนว่า “รายการหมดอายุไม่ถูกคำนวณ”
5. วางแผนฟีเจอร์ตัดสต็อก (ตามโจทย์) แยกเป็นงานอนาคตพร้อมสคริปต์ revert
