import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";

test("isolated PostgreSQL: atomic per-product daily numbering and replay/rollback guards", { timeout: 120000 }, async t => {
  if (spawnSync("initdb", ["--version"], { windowsHide: true }).error) {
    t.skip("PostgreSQL initdb is not installed");
    return;
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), "kpf-central-numbering-"));
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
  const reserve = (code, request = randomUUID(), timestamp = "2026-10-11T12:00:00+07:00", payload = '{"net":1}') =>
    "select (central_scale.reserve_barcode('" + request + "', '" + code + "', '" + payload + "'::jsonb, '" + timestamp + "')).barcode;";
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
    query("create role anon; create role authenticated; create role service_role bypassrls; create table public.production_weight_receipts (barcode text); insert into public.production_weight_receipts values ('OLD-UNCHANGED');");
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-numbering.sql"]);
    query("insert into central_scale.product_identifiers (product_code, product_digits) values ('WK-0002','8001'), ('Z04-0002','8002'), ('FULL','8003');");
    assert.throws(() => query("insert into central_scale.product_identifiers values ('OTHER','8001',now());"), /unique/i);
    assert.equal(query("set role service_role; " + reserve("WK-0002")), "SET\n11102680010001");
    assert.equal(query(reserve("Z04-0002")), "11102680020001");
    const simultaneous = await Promise.all(Array.from({ length: 20 }, () => concurrent(reserve("WK-0002"))));
    assert.equal(new Set(simultaneous).size, 20);
    assert.equal(query("select last_number from central_scale.daily_counters where product_digits='8001';"), "21");
    const request = randomUUID();
    const replays = await Promise.all(Array.from({ length: 20 }, () => concurrent(reserve("WK-0002", request))));
    assert.equal(new Set(replays).size, 1);
    assert.equal(query("select last_number from central_scale.daily_counters where product_digits='8001';"), "22");
    assert.equal(query(reserve("WK-0002", request, "2026-10-12T12:00:00+07:00")), replays[0]);
    assert.throws(() => query(reserve("WK-0002", request, undefined, '{"net":2}')), /different data/);
    assert.throws(() => query(reserve("Z04-0002", request)), /different data/);
    assert.equal(query(reserve("WK-0002", randomUUID(), "2026-10-12T06:59:59+07:00")), "11102680010023");
    assert.equal(query(reserve("WK-0002", randomUUID(), "2026-10-12T07:00:00+07:00")), "12102680010001");
    assert.equal(query("select (central_scale.reserve_barcode('" + randomUUID() + "','WK-0002','{}','2026-10-12T19:01:00+07:00')).lot_no;"), "1210268001-2");
    const rolledBack = randomUUID();
    query("begin; " + reserve("Z04-0002", rolledBack) + " rollback;");
    assert.equal(query("select count(*) from central_scale.barcode_reservations where request_id='" + rolledBack + "';"), "0");
    assert.equal(query("select last_number from central_scale.daily_counters where product_digits='8002';"), "1");
    query("insert into central_scale.daily_counters values ('2026-10-11','8003',9999);");
    assert.throws(() => query(reserve("FULL")), /capacity exhausted/);
    assert.equal(query("select count(*) from central_scale.barcode_reservations where product_code='FULL';"), "0");
    assert.throws(() => query(reserve("UNKNOWN")), /no approved/);
    assert.throws(() => query("insert into central_scale.barcode_reservations (request_id,product_code,product_digits,production_date,shift,run_number,barcode,lot_no,payload) values ('" + randomUUID() + "','WK-0002','8002','2026-10-11',1,99,'11102680020099','1110268002-1','{}');"), /foreign key/i);
    assert.throws(() => query("insert into central_scale.barcode_reservations (request_id,product_code,product_digits,production_date,shift,run_number,barcode,lot_no,payload) values ('" + randomUUID() + "','WK-0002','8001','2026-10-11',1,99,'11102680019998','1110268001-1','{}');"), /check constraint/i);
    assert.throws(() => query("set role authenticated; " + reserve("WK-0002")), /permission denied/);
    assert.throws(() => query("set role service_role; update central_scale.product_identifiers set product_digits='9001' where product_code='WK-0002';"), /permission denied/);
    assert.throws(() => query("set role service_role; delete from central_scale.barcode_reservations;"), /permission denied/);
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-receipts.sql"]);
    const actor = randomUUID(), department = randomUUID(), point = randomUUID();
    const receive = (requestId = randomUUID(), gross = "19.020", tare = "0.500", pointId = point) =>
      "select (central_scale.receive_weight('" + requestId + "','Z04-0002','" + actor + "','" + department + "','" + pointId + "'," + gross + "," + tare + ")).net_kg;";
    const receiptRequest = randomUUID();
    const receipts = await Promise.all(Array.from({ length: 20 }, () => concurrent("set role service_role; " + receive(receiptRequest))));
    assert.equal(new Set(receipts).size, 1);
    assert.match(receipts[0], /18\.520/);
    assert.equal(query("select count(*) from central_scale.receipts;"), "1");
    assert.equal(query("select count(*) from central_scale.receipt_movements;"), "1");
    await Promise.all(Array.from({ length: 20 }, () => concurrent("set role service_role; " + receive())));
    assert.equal(query("select count(*) from central_scale.receipts;"), "21");
    assert.equal(query("select count(*) from central_scale.receipt_movements;"), "21");
    assert.throws(() => query(receive(receiptRequest, "20")), /different data/);
    assert.throws(() => query(receive(receiptRequest, undefined, undefined, randomUUID())), /different data/);
    for (const [gross, tare] of [["NULL", "0"], ["0", "0"], ["1", "-1"], ["1", "1"], ["1", "2"], ["1.0001", "0"], ["'NaN'", "0"], ["'Infinity'", "0"], ["1", "'NaN'"]]) {
      assert.throws(() => query(receive(randomUUID(), gross, tare)), /Invalid receipt/);
    }
    assert.throws(() => query("set role authenticated; " + receive()), /permission denied/);
    assert.throws(() => query("set role service_role; update central_scale.receipts set gross_kg=20;"), /permission denied/);
    assert.throws(() => query("set role service_role; delete from central_scale.receipt_movements;"), /permission denied/);
    const orphan = randomUUID();
    query(reserve("Z04-0002", orphan));
    assert.throws(() => query(receive(orphan)), /different data/);
    const matchingOrphan = randomUUID();
    query(reserve("Z04-0002", matchingOrphan, undefined, JSON.stringify({ operation: "central-receipt", actor_id: actor, department_id: department, point_id: point, gross_kg: 19.02, tare_kg: 0.5 })));
    assert.throws(() => query(receive(matchingOrphan)), /Incomplete receipt/);
    query("delete from central_scale.receipt_movements where receipt_request_id='" + receiptRequest + "';");
    assert.throws(() => query(receive(receiptRequest)), /Incomplete receipt/);
    assert.throws(() => query("insert into central_scale.receipt_movements (receipt_request_id,quantity_kg) values ('" + receiptRequest + "',1);"), /foreign key/i);
    query("insert into central_scale.receipt_movements (receipt_request_id,quantity_kg) values ('" + receiptRequest + "',18.520);");
    const failedRequest = randomUUID();
    const countBeforeFailure = query("select count(*) from central_scale.barcode_reservations;");
    const countersBeforeFailure = query("select product_digits,production_date,last_number from central_scale.daily_counters order by 1,2;");
    query("create function central_scale.reject_test_movement() returns trigger language plpgsql as $$ begin raise exception 'Simulated movement failure'; end $$; create trigger reject_test before insert on central_scale.receipt_movements for each row execute function central_scale.reject_test_movement();");
    assert.throws(() => query(receive(failedRequest)), /Simulated movement failure/);
    assert.equal(query("select count(*) from central_scale.barcode_reservations;"), countBeforeFailure);
    assert.equal(query("select product_digits,production_date,last_number from central_scale.daily_counters order by 1,2;"), countersBeforeFailure);
    assert.equal(query("select count(*) from central_scale.receipts where request_id='" + failedRequest + "';"), "0");
    query("drop trigger reject_test on central_scale.receipt_movements;");
    assert.equal(query(receive(failedRequest)), "18.520");
    query(`create table public.profiles (id uuid primary key, is_active boolean);
      create table public.roles (id uuid primary key, role_key text);
      create table public.permissions (id uuid primary key default gen_random_uuid(), perm_key text unique, label text, path text unique, group_key text);
      create table public.user_roles (user_id uuid, role_id uuid);
      create table public.role_permissions (role_id uuid, permission_id uuid);
      create table public.production_departments (id uuid primary key, code text, is_active boolean, deleted_at timestamptz);
      create table public.production_department_users (user_id uuid, department_id uuid, role text);
      create table public.production_department_products (department_id uuid, sku_code text, subcategory_id uuid);
      create table public.production_department_product_subcategories (id uuid primary key, department_id uuid, name text);
      create table public.products_cache (sku_code text primary key, iccat_code text, uom_name text);
      grant select, update on all tables in schema public to service_role;
      insert into public.profiles values ('${actor}',true);
      insert into public.roles values ('${point}','operator');
      insert into public.user_roles values ('${actor}','${point}');
      insert into public.production_departments values ('${department}','KP01',true,null);
      insert into public.production_department_users values ('${actor}','${department}','editor');
      insert into public.production_department_products values ('${department}','Z04-0002',null);
      insert into public.products_cache values ('Z04-0002','03','KG');`);
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-authorization.sql"]);
    const authorizedReceive = requestId => "set role service_role; " + receive(requestId).replace("central_scale.receive_weight", "central_scale.receive_authorized_weight");
    assert.throws(() => query(authorizedReceive(randomUUID())), /Missing central receipt permission/);
    query(`insert into public.role_permissions select '${point}',id from public.permissions where perm_key='central-scale-receive';`);
    const authorizedRequest = randomUUID();
    assert.equal(query(authorizedReceive(authorizedRequest)), "SET\n18.520");
    assert.equal(query(authorizedReceive(authorizedRequest)), "SET\n18.520");
    const authorizedCount = query("select count(*) from central_scale.receipts;");
    for (const [disable, restore, pattern] of [
      ["update public.profiles set is_active=false;", "update public.profiles set is_active=true;", /Inactive or unknown actor/],
      ["update public.production_department_users set role='viewer';", "update public.production_department_users set role='editor';", /Department editor/],
      ["update public.production_departments set is_active=false;", "update public.production_departments set is_active=true;", /Inactive or unknown department/],
      ["update public.products_cache set uom_name='PCS';", "update public.products_cache set uom_name='KG';", /kilogram product/],
      ["update public.production_department_products set sku_code='OTHER';", "update public.production_department_products set sku_code='Z04-0002';", /not assigned/],
      ["update public.production_departments set code='KP13'; insert into public.production_department_product_subcategories values ('" + point + "','" + department + "','เปลือก'); update public.production_department_products set subcategory_id='" + point + "';", "update public.production_department_products set subcategory_id=null; delete from public.production_department_product_subcategories; update public.production_departments set code='KP01';", /Shell product/],
    ]) {
      query(disable);
      assert.throws(() => query(authorizedReceive(randomUUID())), pattern);
      assert.throws(() => query(authorizedReceive(authorizedRequest)), pattern);
      assert.equal(query("select count(*) from central_scale.receipts;"), authorizedCount);
      query(restore);
    }
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-devices.sql"]);
    query(`insert into central_scale.devices (point_id,is_active,signing_key_hex,max_kg,resolution_kg) values ('${point}',true,'${"ab".repeat(32)}',60,0.001);`);
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-capture-guard.sql"]);
    const cycle = randomUUID();
    const captured = (requestId = randomUUID(), cycleId = cycle) => authorizedReceive(requestId)
      .replace("receive_authorized_weight", "receive_captured_weight").replace(",19.020,0.500)", ",19.020,0.500,'" + cycleId + "')");
    const beforeCycle = query("select count(*) from central_scale.receipts;");
    const cycleRace = await Promise.allSettled(Array.from({ length: 20 }, () => concurrent(captured())));
    assert.equal(cycleRace.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(cycleRace.filter(result => result.status === "rejected" && /already received/.test(result.reason.message)).length, 19);
    assert.equal(Number(query("select count(*) from central_scale.receipts;")), Number(beforeCycle) + 1);
    assert.equal(query("select count(*) from central_scale.capture_claims;"), "1");
    const originalRequest = query("select receipt_request_id from central_scale.capture_claims;");
    assert.equal(query(captured(originalRequest)), "SET\n18.520");
    assert.throws(() => query(captured(originalRequest, randomUUID())), /another weighing cycle/);
    const secondCycleRequest = randomUUID();
    const secondCycle = randomUUID();
    const sameCycleReplays = await Promise.all(Array.from({ length: 20 }, () => concurrent(captured(secondCycleRequest, secondCycle))));
    assert.equal(new Set(sameCycleReplays).size, 1);
    assert.equal(query("select count(*) from central_scale.capture_claims;"), "2");
    query("create trigger reject_test before insert on central_scale.receipt_movements for each row execute function central_scale.reject_test_movement();");
    const failedCycle = randomUUID();
    assert.throws(() => query(captured(randomUUID(), failedCycle)), /Simulated movement failure/);
    assert.equal(query("select count(*) from central_scale.capture_claims;"), "2");
    query("drop trigger reject_test on central_scale.receipt_movements;");
    assert.equal(query(captured(randomUUID(), failedCycle)), "SET\n18.520");
    run("psql", [...args, "-v", "APPLY=true", "-f", "scripts/apply-central-scale-api.sql"]);
    assert.equal(query(`select public.central_scale_receipt_get('${originalRequest}','${actor}')->>'barcode';`).length, 14);
    assert.equal(query(`select public.central_scale_receipt_get('${originalRequest}','${point}') is null;`), "t");
    assert.throws(() => query(`set role authenticated; select public.central_scale_device_profile('${point}');`), /permission denied/);
    assert.throws(() => query(`set role authenticated; select public.central_scale_receipt_get('${originalRequest}','${actor}');`), /permission denied/);
    const bridgeRequest = randomUUID();
    const bridgeSql = captured(bridgeRequest, randomUUID()).replace("central_scale.receive_captured_weight", "public.central_scale_receive")
      .replace("select (", "select ").replace(")).net_kg;", ")->>'net_kg';");
    assert.equal(query(bridgeSql), "SET\n18.520");
    query(`update public.profiles set is_active=false where id='${actor}';`);
    assert.equal(query(`select public.central_scale_receipt_get('${originalRequest}','${actor}') is null;`), "t");
    query(`update public.profiles set is_active=true where id='${actor}';`);
    assert.throws(() => query(captured(authorizedRequest, randomUUID())), /no capture claim/);
    // Same SKU and cycle UUID on two independent PCs/departments must remain separate.
    const otherActor = randomUUID();
    const otherDepartment = randomUUID();
    const otherPoint = randomUUID();
    query(`insert into public.profiles values ('${otherActor}',true);
      insert into public.user_roles values ('${otherActor}','${point}');
      insert into public.production_departments values ('${otherDepartment}','KP02',true,null);
      insert into public.production_department_users values ('${otherActor}','${otherDepartment}','editor');
      insert into public.production_department_products values ('${otherDepartment}','Z04-0002',null);
      insert into central_scale.devices (point_id,is_active,signing_key_hex,max_kg,resolution_kg)
      values ('${otherPoint}',true,'${"cd".repeat(32)}',60,0.001);`);
    const multiRequests = Array.from({ length: 20 }, () => randomUUID());
    const cycleIds = Array.from({ length: 10 }, () => randomUUID());
    const results = await Promise.all(multiRequests.map((id, index) => {
      let sql = captured(id, cycleIds[Math.floor(index / 2)]);
      if (index % 2) sql = sql.replaceAll(actor, otherActor).replaceAll(department, otherDepartment).replaceAll(point, otherPoint);
      return concurrent(sql);
    }));
    assert.equal(results.length, 20);
    for (let index = 0; index < multiRequests.length; index++) {
      const expected = index % 2 ? `${otherActor}|${otherDepartment}|${otherPoint}` : `${actor}|${department}|${point}`;
      assert.equal(query(`select actor_id||'|'||department_id||'|'||point_id from central_scale.receipts where request_id='${multiRequests[index]}';`), expected);
    }
    assert.equal(query(`select count(distinct barcode) from central_scale.barcode_reservations where request_id in (${multiRequests.map(id => `'${id}'`).join(",")});`), "20");
    const historyDate = query(`select production_date from central_scale.barcode_reservations where request_id='${multiRequests[0]}';`);
    const historySql = (reader=actor,dept=department,pc=point,page=0) => `select public.central_scale_receipt_history('${reader}','${dept}','${pc}','${historyDate}',${page},15);`;
    const history = JSON.parse(query(historySql()));
    assert.equal(history.receipts.length, Math.min(15, history.totalCount));
    assert.ok(history.receipts.every(row => row.department_id===department && row.point_id===point));
    const expectedHistory = query(`select count(*),sum(m.quantity_kg) from central_scale.receipts r join central_scale.barcode_reservations b using(request_id)
      join central_scale.receipt_movements m on m.receipt_request_id=r.request_id where r.department_id='${department}' and r.point_id='${point}' and b.production_date='${historyDate}';`).split("|");
    assert.equal(history.totalCount, Number(expectedHistory[0]));
    assert.equal(Number(history.totalNetKg), Number(expectedHistory[1]));
    const secondPage = JSON.parse(query(historySql(actor,department,point,1)));
    assert.ok(secondPage.receipts.every(row => !history.receipts.some(first => first.request_id===row.request_id)));
    assert.throws(() => query(historySql(otherActor)), /Department read access/);
    assert.throws(() => query(historySql(actor,otherDepartment,otherPoint)), /Department read access/);
    assert.throws(() => query(`set role authenticated; ${historySql()}`), /permission denied/);
    query(`update public.profiles set is_active=false where id='${actor}';`);
    assert.throws(() => query(historySql()), /Inactive reader/);
    query(`update public.profiles set is_active=true where id='${actor}';`);
    const resolveSql = requestId => `select public.central_scale_resolve_receipt('${requestId}','${actor}','${department}','${point}','Z04-0002');`;
    const committedResolution = JSON.parse(query(resolveSql(originalRequest)));
    assert.equal(committedResolution.status, "received");
    assert.equal(committedResolution.receipt.request_id, originalRequest);
    const missingRequest = randomUUID();
    assert.equal(JSON.parse(query(resolveSql(missingRequest))).status, "not_received");
    assert.equal(JSON.parse(query(resolveSql(missingRequest))).status, "not_received");
    assert.throws(() => query(captured(missingRequest,randomUUID())), /permanently closed/);
    const pendingRaces = Array.from({length:10},() => randomUUID());
    await Promise.all(pendingRaces.map(async requestId => {
      await Promise.allSettled([concurrent(captured(requestId,randomUUID())),concurrent(resolveSql(requestId))]);
      const state = query(`select (select count(*) from central_scale.receipts where request_id='${requestId}'),
        (select count(*) from central_scale.closed_receipt_requests where request_id='${requestId}');`);
      assert.ok(state==='1|0'||state==='0|1', `request must be received OR closed, not both: ${state}`);
      const settled = JSON.parse(query(resolveSql(requestId)));
      assert.equal(settled.status,state==='1|0' ? "received" : "not_received");
    }));
    const printable = JSON.parse(query(`select public.central_scale_receipt_for_print('${originalRequest}','${actor}','${department}','${point}');`));
    assert.equal(printable.request_id,originalRequest);
    assert.equal(query(`select public.central_scale_receipt_for_print('${originalRequest}','${actor}','${department}','${otherPoint}') is null;`),"t");
    assert.throws(() => query(`select public.central_scale_receipt_for_print('${originalRequest}','${otherActor}','${department}','${point}');`),/Department read access/);
    const beforeBundle = query("select count(*) from central_scale.receipts;");
    run(process.execPath, ["scripts/build-central-scale-install.mjs"]);
    run("psql", [...args, "-f", "output/central-scale/install-central-scale.sql"]);
    assert.equal(query("select count(*) from central_scale.receipts;"), beforeBundle);
    assert.equal(query("select count(*) from public.role_permissions;"), "1");
    assert.equal(query("select barcode from public.production_weight_receipts;"), "OLD-UNCHANGED");
  } finally {
    let stopped = !started;
    if (started) {
      const result = spawnSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { env, stdio: "ignore", windowsHide: true });
      stopped = result.status === 0;
    }
    // Delete only this test's resolved mkdtemp directory, never a database supplied by environment.
    const resolved = realpathSync(directory);
    const temporaryRoot = realpathSync(os.tmpdir());
    const relative = path.relative(temporaryRoot, resolved);
    if (stopped && !relative.startsWith("..") && !path.isAbsolute(relative) && relative.startsWith("kpf-central-numbering-")) {
      rmSync(resolved, { recursive: true });
    }
  }
});
