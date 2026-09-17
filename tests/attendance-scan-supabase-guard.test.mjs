import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL(
  "../src/features/attendance/services/attendanceScanService.js",
  import.meta.url
);

test("QR attendance duplicate decisions use Supabase events, not fingerprint CHECKINOUT", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.doesNotMatch(source, /\/api\/consolidated-lookup/);
  assert.doesNotMatch(source, /snapshot\.check_in_snapshot/);
  assert.doesNotMatch(source, /snapshot\.check_out_snapshot/);
  assert.doesNotMatch(source, /getTodayIsoDate/);

  assert.match(source, /\/api\/employees/);
  assert.match(source, /getBangkokAttendanceDay/);
  assert.match(source, /getAttendanceDayState/);
  assert.match(source, /employee_code_key/);
  assert.match(source, /scan_business_date/);
});
