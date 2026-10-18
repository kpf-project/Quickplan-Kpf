import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

test("packing SQL saves closing stock atomically and rejects overuse, cross-product and changed retries", { timeout: 120000 }, async t => {
  const install = new URL("../scripts/install-packing-workspace.sql", import.meta.url);
  assert.ok(existsSync(install), "atomic multi-unit writer must exist");
  if (spawnSync("initdb", ["--version"], { windowsHide: true }).error) return t.skip("local PostgreSQL unavailable");
  const tempRoot = realpathSync(os.tmpdir());
  const directory = mkdtempSync(path.join(tempRoot, "kpf-packing-test-"));
  const data = path.join(directory, "data");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres" };
  const run = (command, args, input) => spawnSync(command, args, { input, env, encoding: "utf8", windowsHide: true });
  const sql = (query, success = true) => {
    const result = run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-tA"], query);
    if (success) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, "must reject invalid transaction");
    return result.stdout.trim();
  };
  const actor = "00000000-0000-4000-8000-000000000001", dept = "00000000-0000-4000-8000-000000000002";
  let started = false;
  try {
    assert.equal(run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]).status, 0);
    assert.equal(spawnSync("pg_ctl", ["-D", data, "-l", path.join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { env, stdio: "ignore", windowsHide: true }).status, 0);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
      create function public.is_admin() returns boolean language sql as 'select false';
      create function public.has_permission(text) returns boolean language sql as 'select false';
      create table profiles(id uuid primary key,is_active boolean); insert into profiles values('${actor}',true);
      create table production_departments(id uuid primary key,code text,is_active boolean,deleted_at timestamptz); insert into production_departments values('${dept}','TEST',true,null);
      create table production_department_users(user_id uuid,department_id uuid,role text); insert into production_department_users values('${actor}','${dept}','editor');
      create table production_department_products(department_id uuid,sku_code text); insert into production_department_products values('${dept}','FG1'),('${dept}','OTHER');
      create table products_cache(sku_code text primary key,is_active boolean); insert into products_cache values('FG1',true),('OTHER',true);`);
    sql(readFileSync("supabase/migrations/20260817125140_add_fg_wip_end_of_day_flow.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20260818073041_add_wip_can_issue_flow.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20260826075346_add_wip_opening_balance_flow.sql", "utf8"));
    sql(readFileSync("supabase/migrations/20260826093659_make_fg_wip_carryover_optional.sql", "utf8"));
    sql(readFileSync(install, "utf8"));
    const units = [{ code: "pail", label: "ปี๊บ", factor: 1, precision: 0 }, { code: "carton", label: "ลัง", factor: 12, precision: 0 }];
    const payload = (closing, sources = []) => ({ workDate: "2026-10-15", departmentId: dept, productCode: "FG1", units, unitVersion: "test", produced: { carton: 5 }, closing: { pail: closing }, sources });
    const call = (id, p, product = "FG1") => `select record_packing_workspace('00000000-0000-4000-8000-${String(id).padStart(12, "0")}','${actor}','${dept}','${product}','2026-10-15','151026','Product',null,'${JSON.stringify(p)}'::jsonb);`;
    assert.equal(sql(`select count(*) from packing_workspace_sources('${dept}','FG1','2026-10-15')`), "0");
    sql(call(10, payload(8)));
    assert.equal(sql("select remaining from production_packing_line_stock"), "8.000");
    sql(call(10, payload(8)));
    assert.equal(sql("select count(*) from production_packing_documents"), "1");
    sql(call(10, payload(9)), false);
    const source = sql("select id from production_packing_line_stock");
    sql(call(11, payload(2, [{ id: source, quantity: 9 }])), false);
    assert.equal(sql("select remaining from production_packing_line_stock"), "8.000");
    assert.equal(sql("select count(*) from production_packing_documents"), "1");
    sql(call(12, { ...payload(2, [{ id: source, quantity: 1 }]), productCode: "OTHER" }, "OTHER"), false);
    sql(call(13, payload(2, [{ id: source, quantity: 3 }])));
    assert.equal(sql(`select remaining from production_packing_line_stock where id='${source}'`), "5.000");
    sql(call(14, payload(2, [{ id: source, quantity: 5.5 }])), false);
    assert.equal(sql("select count(*) from production_packing_documents"), "2");
    const concurrentSql = query => new Promise(resolve => {
      const child = spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-tA"], { env, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
      child.on("close", resolve); child.stdin.end(query);
    });
    const race = await Promise.all([15, 16].map(id => concurrentSql(call(id, payload(0, [{ id: source, quantity: 4 }])))));
    assert.equal(race.filter(status => status === 0).length, 1);
    assert.equal(sql(`select remaining from production_packing_line_stock where id='${source}'`), "1.000");
    assert.equal(sql("select count(*) from production_packing_documents"), "3");
    assert.equal(sql("select has_function_privilege('anon','record_packing_workspace(uuid,uuid,uuid,text,date,text,text,text,jsonb)','EXECUTE')"), "f");

    // The old and new forms must draw from the exact same pail ledger, not snapshots.
    sql(`update production_departments set code='KP13' where id='${dept}';
      select record_wip_opening_balance_batch('real-opening','2026-10-14',
        '[{"productCode":"OTHER","productName":"Pails","barcode":"OTHER","lotNo":"141026","quantity":10}]','${actor}',null);`);
    const legacySource = sql(`select id from packing_workspace_sources('${dept}','OTHER','2026-10-15')`);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15')`), "10");
    const legacyPayload = { ...payload(0), productCode: "OTHER", sources: [{ id: legacySource, sourceKind: "legacy_opening", quantity: 3 }] };
    sql(call(20, legacyPayload, "OTHER"));
    assert.equal(sql("select sum(quantity_in-quantity_out) from production_wip_opening_balance_movements where product_code='OTHER'"), "7");
    sql(`select issue_wip_opening_cans_atomic('old-form','old-issue','${legacySource}','OTHER','141026',2,'2026-10-15','${actor}');`);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${legacySource}'`), "5");
    sql(call(20, legacyPayload, "OTHER"));
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${legacySource}'`), "5");
    // A rejected closing quantity must roll back an already attempted legacy source issue.
    sql(call(21, { ...legacyPayload, closing: { pail: -1 } }, "OTHER"), false);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${legacySource}'`), "5");
    const mixedRace = await Promise.all([
      concurrentSql(call(22, { ...legacyPayload, sources: [{ id: legacySource, sourceKind: "legacy_opening", quantity: 4 }] }, "OTHER")),
      concurrentSql(`select issue_wip_opening_cans_atomic('old-race','old-race','${legacySource}','OTHER','141026',4,'2026-10-15','${actor}');`),
    ]);
    assert.equal(mixedRace.filter(status => status === 0).length, 1);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${legacySource}'`), "1");
    sql(call(23, { ...legacyPayload, sources: [], closing: { pail: 6 } }, "OTHER"));
    assert.equal(sql("select count(*) from production_wip_opening_balance_batches where packing_document_id is not null"), "1");
    assert.equal(sql("select count(*) from production_packing_line_stock where product_code='OTHER'"), "0");
    assert.equal(sql("select sum(quantity_in-quantity_out) from production_wip_opening_balance_movements where product_code='OTHER'"), "7");
    assert.equal(sql(`select count(*) from packing_workspace_sources('${dept}','OTHER','2026-10-15') where lot_no='151026' and remaining=6`), "1");
    assert.equal(sql("select has_function_privilege('authenticated','packing_workspace_sources(uuid,text,date)','EXECUTE')"), "f");
    sql(`select record_fg_wip_end_of_day('old-receipt','old-receipt','2026-10-14',null,'141026','OTHER','Pails','OTHER','ลัง',12,1,'OTHER','Pails','OTHER',20,'${actor}',null);`);
    const normalSource = sql(`select id from packing_workspace_sources('${dept}','OTHER','2026-10-15') where source_kind='legacy_wip'`);
    sql(call(24, { ...legacyPayload, sources: [{ id: normalSource, sourceKind: "legacy_wip", quantity: 5 }] }, "OTHER"));
    const normalDocument = sql(`select source_document_id from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${normalSource}'`);
    sql(`select issue_wip_cans_atomic('old-normal','old-normal','${normalDocument}','OTHER','141026',2,'2026-10-15','${actor}');`);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${normalSource}'`), "13");
    const normalRace = await Promise.all([
      concurrentSql(call(25, { ...legacyPayload, sources: [{ id: normalSource, sourceKind: "legacy_wip", quantity: 9 }] }, "OTHER")),
      concurrentSql(`select issue_wip_cans_atomic('old-normal-race','old-normal-race','${normalDocument}','OTHER','141026',9,'2026-10-15','${actor}');`),
    ]);
    assert.equal(normalRace.filter(status => status === 0).length, 1);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${normalSource}'`), "4");
    sql(`insert into production_wip_can_movements(document_id,movement_type,movement_date,product_code,product_name_snapshot,barcode,lot_no,quantity_in)
      values('${normalDocument}','receipt','2026-10-16','OTHER','Pails','OTHER','141026',100);`);
    const blocker = concurrentSql("begin; select pg_advisory_xact_lock(hashtextextended('OTHER|OTHER|141026',0)); select pg_sleep(1); commit;");
    await new Promise(resolve => setTimeout(resolve, 100));
    const futureRace = await Promise.all([26, 27].map(id => concurrentSql(call(id, { ...legacyPayload, sources: [{ id: normalSource, sourceKind: "legacy_wip", quantity: 3 }] }, "OTHER"))));
    assert.equal(await blocker, 0);
    assert.equal(futureRace.filter(status => status === 0).length, 1);
    assert.equal(sql(`select remaining from packing_workspace_sources('${dept}','OTHER','2026-10-15') where id='${normalSource}'`), "1");
    assert.equal(sql(`select count(*) from packing_workspace_sources('${dept}','OTHER','2026-10-13')`), "0");
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    const resolved = realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), tempRoot.toLowerCase());
    assert.ok(path.basename(resolved).startsWith("kpf-packing-test-"));
    rmSync(resolved, { recursive: true, force: true });
  }
});
