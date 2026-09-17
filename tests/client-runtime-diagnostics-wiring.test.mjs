import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, ROOT), "utf8");
}

test("initializes diagnostics before the Next.js client becomes interactive", async () => {
  const source = await read("src/instrumentation-client.js");
  assert.match(source, /initializeClientDiagnostics/);
});

test("Next.js error boundaries report and display an incident id", async () => {
  const [errorBoundary, globalErrorBoundary] = await Promise.all([
    read("src/app/error.js"),
    read("src/app/global-error.js"),
  ]);

  for (const source of [errorBoundary, globalErrorBoundary]) {
    assert.match(source, /reportClientDiagnostic/);
    assert.match(source, /incidentId/);
  }
});

test("diagnostics remain isolated from piece-rate scan business logic", async () => {
  const [scanPage, workForm] = await Promise.all([
    read("src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js"),
    read("src/app/production-line/attendance/piece-rate-scan/PieceRateWorkForm.js"),
  ]);

  assert.doesNotMatch(scanPage, /clientDiagnostics|reportClientDiagnostic/);
  assert.doesNotMatch(workForm, /clientDiagnostics|reportClientDiagnostic/);
});

test("diagnostics API writes through the server admin client", async () => {
  const source = await read("src/app/api/client-diagnostics/route.js");
  assert.match(source, /getSupabaseAdmin/);
  assert.match(source, /client_runtime_diagnostics/);
});

test("diagnostics ingestion requires the internal header and an authenticated or wrapper request", async () => {
  const source = await read("src/app/api/client-diagnostics/route.js");
  assert.match(source, /x-kpf-diagnostics/i);
  assert.match(source, /isWrapperRequest/);
  assert.match(source, /getSessionFromRequest/);
});

test("diagnostics table is private behind RLS", async () => {
  const source = await read("supabase/migrations/20260714021808_client_runtime_diagnostics.sql");
  assert.match(source, /create table if not exists public\.client_runtime_diagnostics/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on table public\.client_runtime_diagnostics from anon, authenticated/i);
  assert.doesNotMatch(source, /create policy/i);
});
