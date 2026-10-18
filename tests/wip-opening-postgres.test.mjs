import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";

test("isolated PostgreSQL: opening atomicity, unit separation, permission and concurrent duplicate guards", { timeout: 120000 }, async t => {
  if (spawnSync("initdb", ["--version"], { windowsHide: true }).error) return t.skip("PostgreSQL initdb not installed");
  const directory = mkdtempSync(path.join(os.tmpdir(), "kpf-wip-opening-"));
  const data = path.join(directory, "data");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "3" };
  function run(command, args) {
    const result = spawnSync(command, args, { env, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim();
  }
  const args = ["-X", "-v", "ON_ERROR_STOP=1", "-tA"];
  const query = sql => run("psql", [...args, "-c", sql]);
  function concurrent(sql) {
    return new Promise((resolve, reject) => {
      const child = spawn("psql", args, { env, windowsHide: true });
      let output = "", errors = "";
      child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { errors += chunk; });
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
      child.stdin.end(sql);
    });
  }
  const actor = randomUUID(), viewer = randomUUID(), department = randomUUID(), otherDepartment = randomUUID(), role = randomUUID(), permission = randomUUID();
  const entries = quantities => quantities.map(([unit, quantity]) => ({ productCode: "WKB-0064", lotNo: "131026", unit, quantity, notes: "counted" }));
  const call = (request, rows, dept = department, user = actor, date = "2026-10-13") => `set role service_role; select public.record_central_wip_opening('${request}','${user}','${dept}','${date}','${JSON.stringify(rows)}'::jsonb);`;
  let started = false;
  try {
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]);
    const start = spawnSync("pg_ctl", ["-D", data, "-l", path.join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { env, stdio: "ignore", windowsHide: true });
    assert.equal(start.status, 0, "temporary PostgreSQL must start"); started = true;
    query(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(id uuid primary key,is_active boolean);
      create table public.roles(id uuid primary key,role_key text);
      create table public.user_roles(user_id uuid,role_id uuid);
      create table public.permissions(id uuid primary key default gen_random_uuid(),perm_key text unique,label text,path text,group_key text);
      create table public.role_permissions(role_id uuid,permission_id uuid);
      create table public.production_departments(id uuid primary key,is_active boolean,deleted_at timestamptz);
      create table public.production_department_users(user_id uuid,department_id uuid,role text);
      create table public.production_department_products(department_id uuid,sku_code text);
      create table public.products_cache(sku_code text primary key,sku_name text,iccat_code text);
      create table public.production_wip_opening_balance_movements(quantity_in integer);
      insert into public.production_wip_opening_balance_movements values(23);
      insert into public.profiles values('${actor}',true),('${viewer}',true);
      insert into public.roles values('${role}','operator'); insert into public.user_roles values('${actor}','${role}');
      insert into public.permissions(id,perm_key) values('${permission}','wip-opening-manage'); insert into public.role_permissions values('${role}','${permission}');
      insert into public.production_departments values('${department}',true,null),('${otherDepartment}',true,null);
      insert into public.production_department_users values('${actor}','${department}','editor'),('${actor}','${otherDepartment}','editor');
      insert into public.production_department_products values('${department}','WKB-0064'),('${otherDepartment}','WKB-0064');
      insert into public.products_cache values('WKB-0064','WIP actual master name','03');`);
    run("psql", [...args, "-f", "scripts/install-wip-opening-central.sql"]);
    const request = randomUUID(), rows = entries([["pack", 10], ["sachet", 7], ["kg", 5.2]]);
    const replays = await Promise.all(Array.from({ length: 10 }, () => concurrent(call(request, rows))));
    assert.equal(new Set(replays.map(value => JSON.parse(value.split("\n").at(-1)).documentId)).size, 1);
    assert.equal(query("select count(*) from production_wip_opening_documents;"), "1");
    assert.equal(query("select string_agg(unit || ':' || quantity,',' order by unit) from production_wip_opening_entries;"), "kg:5.200,pack:10.000,sachet:7.000");
    assert.throws(() => query(call(request, entries([["pack", 11]]))), /different data/);
    assert.throws(() => query(call(randomUUID(), entries([["pack", 10]]))), /unique constraint/);
    assert.throws(() => query(call(randomUUID(), entries([["pail", 2], ["pack", 1]]))), /unique constraint/);
    assert.equal(query("select count(*) from production_wip_opening_entries where unit='pail';"), "0", "whole batch rolled back");
    assert.throws(() => query(call(randomUUID(), entries([["pail", 1.5]]))), /Invalid unit quantity/);
    assert.throws(() => query(call(randomUUID(), entries([["pail", 1]]), department, viewer)), /permission required/);
    assert.throws(() => query(call(randomUUID(), entries([["pail", 1]]), department, actor, "2026-10-12")), /date already fixed/);
    assert.throws(() => query(call(randomUUID(), [{ ...rows[0], productCode: "FAKE" }])), /not assigned/);
    assert.throws(() => query("set role authenticated; select public.record_central_wip_opening(null,null,null,null,null);"), /permission denied/);
    assert.throws(() => query("set role service_role; delete from public.production_wip_opening_entries;"), /permission denied/);
    const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => concurrent(call(randomUUID(), entries([["pail", 2]])))));
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    query(call(randomUUID(), rows, otherDepartment));
    assert.equal(query("select count(*) from production_wip_opening_entries;"), "7");
    run("psql", [...args, "-f", "scripts/install-wip-opening-central.sql"]);
    assert.equal(query("select quantity_in from production_wip_opening_balance_movements;"), "23");
    assert.equal(query("select count(*) from production_wip_opening_entries;"), "7", "install rerun preserves stock");
  } finally {
    let stopped = !started;
    if (started) stopped = spawnSync("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { env, stdio: "ignore", windowsHide: true }).status === 0;
    const resolved = realpathSync(directory), relative = path.relative(realpathSync(os.tmpdir()), resolved);
    if (stopped && relative.startsWith("kpf-wip-opening-") && !relative.startsWith("..") && !path.isAbsolute(relative)) rmSync(resolved, { recursive: true });
  }
});
