import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";

test("isolated PostgreSQL: ERP receipt export atomic commit, monthly numbering, replay, stale-source and duplicate guards", { timeout: 120000 }, async t => {
  if (spawnSync("initdb", ["--version"], { windowsHide: true }).error) {
    t.skip("PostgreSQL initdb is not installed");
    return;
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), "kpf-erp-export-"));
  const data = path.join(directory, "data");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "3" };
  const args = ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
  function run(command, commandArgs, input) {
    const result = spawnSync(command, commandArgs, { env, input, encoding: "utf8", windowsHide: true,
      ...(command === "pg_ctl" ? { stdio: "ignore" } : {}) });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || result.stdout);
    return (result.stdout || "").replaceAll("\r\n", "\n").trim();
  }
  const query = sql => run("psql", args, sql);
  function concurrent(sql) {
    return new Promise((resolve, reject) => {
      const child = spawn("psql", args, { env, windowsHide: true });
      let output = "", errors = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { errors += chunk; });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
      child.stdin.end(sql);
    });
  }
  let started = false;
  try {
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]);
    run("pg_ctl", ["-D", data, "-l", path.join(directory, "server.log"), "-o", "-h 127.0.0.1 -p " + port, "-w", "start"]);
    started = true;
    query(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.role() returns text language sql as $$select current_user::text$$;
      create table profiles(id uuid primary key);
      create table production_weight_receipts(id uuid primary key, net_weight_kg numeric, weighed_at timestamptz, product_config_id uuid, lot_id uuid, status text, metadata jsonb, barcode text);`);
    run("psql", [...args, "-f", "scripts/install-receipt-erp-export.sql"]);
    const actor = randomUUID(), config = randomUUID(), lot = randomUUID();
    query(`insert into profiles values ('${actor}');`);
    function row(date = "2026-10-14", net = 10.125) {
      const id = randomUUID();
      query(`insert into production_weight_receipts values ('${id}',${net},'${date}T08:00:00+07:00','${config}','${lot}','recorded','{}','${id}');`);
      return { documentDate: date, tradeCode: "WKB-0002", productName: "test", lotNo: "LOT", quantity: net, unitWeightKg: 0, sourceReceiptIds: [id], barcodes: [id], sources: [{ id, netWeightKg: net, weighedAt: date + "T08:00:00+07:00", productConfigId: config, lotId: lot, barcode: id }] };
    }
    const json = value => JSON.stringify(value).replaceAll("'", "''");
    const commit = (rows, id = randomUUID(), numbers = {}, reason = "", hash = "hash") => `select public.commit_wip_receipt_erp_export('${id}','${actor}','${json({ departmentId: config, dateFrom: rows[0].documentDate, dateTo: rows.at(-1).documentDate })}','${json(rows)}','${json(numbers)}','${reason}','${hash}');`;
    const first = row(), request = randomUUID();
    const initial = query(commit([first], request));
    assert.equal(query(commit([first], request)), initial);
    assert.throws(() => query(commit([first], request, {}, "", "changed")), /ข้อมูลอื่น/);
    assert.throws(() => query(commit([first])), /เคยส่งออก/);
    assert.equal(query("select document_no from production_erp_export_documents;"), "IMM6910/0001");
    assert.equal(query("select quantity||'|'||unit_weight_kg from production_erp_export_lines;"), "10.125|0.000");
    const concurrentRows = Array.from({ length: 8 }, () => row());
    const allocated = await Promise.all(concurrentRows.map(item => concurrent(commit([item]))));
    assert.equal(new Set(allocated).size, 8);
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "9");
    const retryRow = row(), retryId = randomUUID();
    const retried = await Promise.all(Array.from({ length: 5 }, () => concurrent(commit([retryRow], retryId))));
    assert.equal(new Set(retried).size, 1);
    const collisionRow = row();
    const collision = await Promise.allSettled([concurrent(commit([collisionRow])), concurrent(commit([collisionRow]))]);
    assert.equal(collision.filter(item => item.status === "fulfilled").length, 1);
    const november = row("2026-11-01");
    query(commit([november]));
    assert.equal(query("select document_no from production_erp_export_documents where period_ym='6911';"), "IMM6911/0001");
    query(commit([row()], undefined, { "2026-10-14": "IMM6910/0050" }, "Emergency reconciliation"));
    query(commit([row()]));
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "51");
    query(commit([row()], undefined, { "2026-10-14": "IMM6910/0030" }, "Unused lower number"));
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "51");
    assert.throws(() => query(commit([row()], undefined, { "2026-10-14": "IMM6910/0030" }, "Duplicate manual")), /ถูกใช้แล้ว/);
    const stale = row();
    query(`update production_weight_receipts set net_weight_kg=11 where id='${stale.sources[0].id}';`);
    assert.throws(() => query(commit([stale])), /เปลี่ยนจากพรีวิว/);
    const cancelled = row();
    query(`update production_weight_receipts set status='voided' where id='${cancelled.sources[0].id}';`);
    assert.throws(() => query(commit([cancelled])), /เปลี่ยนจากพรีวิว/);
    const rollback = row(), rollbackId = randomUUID();
    query("begin;" + commit([rollback], rollbackId) + "rollback;");
    assert.equal(query(`select count(*) from production_erp_export_batches where metadata->>'requestId'='${rollbackId}';`), "0");
    assert.equal(query(`select count(*) from production_erp_export_receipts where receipt_id='${rollback.sources[0].id}';`), "0");
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "51");
    const lateFailureRows = [row("2026-10-14"), row("2026-11-02")];
    const before = query("select count(*) from production_erp_export_batches;");
    assert.throws(() => query(commit(lateFailureRows, undefined, { "2026-11-02": "IMM6911/0001" }, "Conflict after first date")), /ถูกใช้แล้ว/);
    assert.equal(query("select count(*) from production_erp_export_batches;"), before);
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "51");
    assert.throws(() => query("set role authenticated;" + commit([row()])), /permission denied/);
    assert.throws(() => query("set role authenticated; select * from production_erp_export_lines;"), /permission denied/);
    query("set role service_role;" + commit([row()]));
    const legacy = row(), legacyBatch = randomUUID(), legacyDocument = randomUUID();
    query(`insert into production_erp_export_batches(id,document_type,source_module,date_from,date_to,file_name,row_count,metadata)
      values('${legacyBatch}','IMM','weight_receipt','2026-10-14','2026-10-14','legacy.xlsx',1,'{}');
      insert into production_erp_export_documents(id,batch_id,document_type,source_module,period_ym,running_no,document_no,document_date,document_note)
      values('${legacyDocument}','${legacyBatch}','IMM','weight_receipt','6910',80,'IMM6910/0080','2026-10-14','legacy');
      insert into production_erp_export_lines(batch_id,document_id,line_no,document_date,document_no,trade_code,quantity,unit_weight_kg,lot_no,production_date,expiry_date,metadata)
      values('${legacyBatch}','${legacyDocument}',1,'2026-10-14','IMM6910/0080','WKB-0002',1,10.125,'LOT','2026-10-14','2027-10-14','${json({ sourceReceiptIds: legacy.sourceReceiptIds })}');`);
    run("psql", [...args, "-f", "scripts/install-receipt-erp-export.sql"]);
    assert.throws(() => query(commit([legacy])), /เคยส่งออก/);
    query(commit([row()]));
    assert.equal(query("select last_value from production_erp_export_sequences where period_ym='6910';"), "81");
    assert.equal(query(`select quantity||'|'||unit_weight_kg from production_erp_export_lines where batch_id='${legacyBatch}';`), "1.000|10.125");
    query("update production_erp_export_sequences set last_value=9999 where period_ym='6911';");
    assert.throws(() => query(commit([row("2026-11-03")])), /เต็มหรือไม่ถูกต้อง/);
    query(commit([row("2027-01-01")]));
    assert.equal(query("select document_no from production_erp_export_documents where period_ym='7001';"), "IMM7001/0001");
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(realpathSync(os.tmpdir()) + path.sep));
    rmSync(resolved, { recursive: true, force: true });
  }
});
