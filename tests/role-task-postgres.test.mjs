import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { TASK_PERMISSIONS } from "../src/lib/taskPermissions.js";

test("isolated PostgreSQL: preserve grants, reject rerun, atomic save rollback and stale edits", { timeout: 120000 }, async (t) => {
  if (spawnSync("initdb", ["--version"], { windowsHide: true }).error) return t.skip("PostgreSQL initdb not installed");
  const root = realpathSync(os.tmpdir());
  const directory = mkdtempSync(path.join(root, "kpf-role-task-"));
  const data = path.join(directory, "data");
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "3" };
  function run(command, args, input, success = true) {
    const result = spawnSync(command, args, { env, input, encoding: "utf8", windowsHide: true });
    if (success) assert.equal(result.status, 0, result.stderr || result.stdout);
    else assert.notEqual(result.status, 0, "expected operation to fail");
    return result.stdout.trim();
  }
  const sql = (query, success = true) => run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-tA"], query, success);
  const actor = "00000000-0000-4000-8000-000000000001";
  const role = "00000000-0000-4000-8000-000000000002";
  const admin = "00000000-0000-4000-8000-000000000003";
  let started = false;
  try {
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]);
    const start = spawnSync("pg_ctl", ["-D", data, "-l", path.join(directory, "server.log"), "-o", "-h 127.0.0.1 -p " + port, "-w", "start"], { env, stdio: "ignore", windowsHide: true });
    assert.equal(start.status, 0, "temporary PostgreSQL start");
    started = true;
    sql(`create role anon; create role authenticated; create role service_role;
      create table roles(id uuid primary key default gen_random_uuid(),role_key text unique,name text unique,description text,is_system boolean default false,created_by uuid,updated_by uuid);
      create table permissions(id uuid primary key default gen_random_uuid(),perm_key text unique,label text,path text unique,group_key text);
      create table role_permissions(role_id uuid references roles,permission_id uuid references permissions,created_by uuid,primary key(role_id,permission_id));
      create table user_roles(user_id uuid,role_id uuid references roles);
      create table audit_logs(id bigserial,actor_id uuid,action text,target_table text,target_id uuid,metadata jsonb);
      insert into roles(id,role_key,name,is_system) values('${admin}','admin','Admin',true),('${role}','operator','Operator',false);
      insert into user_roles values('${actor}','${admin}');
      insert into permissions(perm_key,label,path) values('production-line-attendance-view','Old view','/old');
      insert into role_permissions select '${role}',id,null from permissions;`);
    sql(readFileSync(new URL("../scripts/install-role-task-permissions.sql", import.meta.url), "utf8"));
    const expected = Object.values(TASK_PERMISSIONS).filter((entry) => entry.legacyKeys.includes("production-line-attendance-view")).length;
    assert.equal(Number(sql(`select count(*) from role_permissions where role_id='${role}'`)), expected + 1);
    const before = sql(`select array_agg(permission_id order by permission_id)::text from role_permissions where role_id='${role}'`);
    sql(readFileSync(new URL("../scripts/install-role-task-permissions.sql", import.meta.url), "utf8"), false);
    assert.equal(sql(`select array_agg(permission_id order by permission_id)::text from role_permissions where role_id='${role}'`), before);
    assert.equal(sql("select has_function_privilege('anon','save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[])','EXECUTE')"), "f");
    const call = (name, ids, baseline = before) => `select save_role_permissions_atomic('${actor}','${role}',null,'${name}',null,'${ids}'::uuid[],'${baseline}'::uuid[]);`;
    sql(call("Changed", "{00000000-0000-4000-8000-000000009999}"), false);
    assert.equal(sql(`select name from roles where id='${role}'`), "Operator");
    sql(call("Changed", "{}", "{}"), false);
    assert.equal(sql(`select array_agg(permission_id order by permission_id)::text from role_permissions where role_id='${role}'`), before);
    sql("create function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit failed'; end $$; create trigger audit_fail before insert on audit_logs for each row execute function fail_audit();");
    sql(call("Changed", "{}"), false);
    assert.equal(sql(`select name from roles where id='${role}'`), "Operator");
    assert.equal(sql(`select array_agg(permission_id order by permission_id)::text from role_permissions where role_id='${role}'`), before);
    sql("drop trigger audit_fail on audit_logs;");
    sql(call("Changed", "{}"));
    assert.equal(sql(`select count(*) from role_permissions where role_id='${role}'`), "0");
    sql(call("Stale", before), false);
    assert.equal(sql(`select name from roles where id='${role}'`), "Changed");
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    const resolved = realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), root.toLowerCase());
    assert.ok(path.basename(resolved).startsWith("kpf-role-task-"));
    rmSync(resolved, { recursive: true, force: true });
  }
});
