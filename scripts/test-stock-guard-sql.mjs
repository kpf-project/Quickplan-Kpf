import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.SUPABASE_DB_URL);
if (url.hostname !== "192.168.210.185" || url.port !== "5532") throw new Error("Unexpected target");
const migration = readFileSync("supabase/migrations/20260907030917_guard_stock_issue_cancellation_children.sql", "utf8")
  .replaceAll("public.", "pg_temp.").replace("set search_path = public", "set search_path = pg_temp");
const sql = `begin;
create temp table production_stock_issue_items(id uuid primary key,status text);
create temp table production_weight_receipts(metadata jsonb);
create temp table production_stock_movements(metadata jsonb,movement_type text);
${migration}
insert into production_stock_issue_items values
('00000000-0000-0000-0000-000000000001','confirmed'),
('00000000-0000-0000-0000-000000000002','confirmed'),
('00000000-0000-0000-0000-000000000003','confirmed');
insert into production_weight_receipts values ('{"sourceIssueItemId":"00000000-0000-0000-0000-000000000002"}');
insert into production_stock_movements values ('{"sourceIssueItemId":"00000000-0000-0000-0000-000000000003"}','waste_out');
do $$ declare target uuid; blocked boolean; begin
update production_stock_issue_items set status='voided' where id='00000000-0000-0000-0000-000000000001';
foreach target in array array['00000000-0000-0000-0000-000000000002'::uuid,'00000000-0000-0000-0000-000000000003'::uuid] loop
blocked := false;
begin
update production_stock_issue_items set status='voided' where id=target;
exception when sqlstate 'P0001' then
if sqlerrm not like '%มีประวัติชั่งคืนหรือของเสีย%' then raise; end if;
blocked := true;
end;
if not blocked then raise exception 'Expected child cancellation blocked'; end if;
end loop;
if (select count(*) from production_stock_issue_items where status='confirmed') <> 2 then raise exception 'Unexpected state'; end if;
end $$;
rollback;
select 'PASS: normal cancellation allowed; receipt/waste child blocked; no production rows changed';`;
const result = spawnSync("psql", ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
  input: sql, encoding: "utf8", env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port,
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1), PGCONNECT_TIMEOUT: "8" },
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
