// Test-only adapter: all writes go to a disposable localhost PostgreSQL cluster.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import vm from "node:vm";
import crypto from "node:crypto";
import { buildPackingUnits, quantityInBase, supplementPackingUnits } from "../../src/lib/packingUnits.js";
import { legacyPackingHistory } from "../../src/lib/packingHistory.js";
import { loadPackingProductPage } from "../../src/lib/packing-product-page.js";
import { fetchAllSupabaseRows } from "../../src/lib/supabaseRangeFetch.js";
import { lotFromWorkDate } from "../../src/lib/nonWagePackingOutput.js";
import { toBangkokDateKey } from "../../src/lib/bangkokDate.js";
import { validatePieceRateWorkDate } from "../../src/lib/piece-rate-work-date.js";
import { buildFgPackingReportRows } from "../../src/features/production-line/utils/buildFgPackingReportRows.js";

export async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
export async function createPackingTestBackend() {
  const root = realpathSync(tmpdir()), directory = mkdtempSync(path.join(root, "kpf-packing-browser-db-"));
  const port = await freePort();
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "3" };
  delete env.PGPASSWORD;
  assert.equal(env.PGHOST, "127.0.0.1");
  const run = (bin, args, input) => spawnSync(bin, args, { input, env, encoding: "utf8", windowsHide: true });
  const sql = query => {
    const result = run("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], query);
    if (result.status !== 0) throw Object.assign(Error(result.stderr), { code: result.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] || "XX000" });
    return result.stdout.trim();
  };
  let started = false;
  const close = () => {
    if (started) run("pg_ctl", ["-D", path.join(directory, "data"), "-m", "immediate", "-w", "stop"]);
    assert.equal(path.dirname(realpathSync(directory)).toLowerCase(), root.toLowerCase());
    assert.ok(path.basename(directory).startsWith("kpf-packing-browser-db-"));
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    assert.equal(run("initdb", ["-D", path.join(directory, "data"), "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]).status, 0);
    assert.equal(spawnSync("pg_ctl", ["-D", path.join(directory, "data"), "-l", path.join(directory, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], { env, stdio: "ignore", windowsHide: true }).status, 0);
    started = true;
    const actor = "00000000-0000-4000-8000-000000000001", departmentId = "00000000-0000-4000-8000-000000000002";
    const date = toBangkokDateKey(), lot = lotFromWorkDate(date);
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
      create function is_admin() returns boolean language sql as 'select false';
      create function has_permission(text) returns boolean language sql as 'select false';
      create table profiles(id uuid primary key,username text,is_active boolean); insert into profiles values('${actor}','qa-only',true);
      create table production_departments(id uuid primary key,code text,name text,is_active boolean,deleted_at timestamptz);
      insert into production_departments values('${departmentId}','KP13','แผนกทดสอบเท่านั้น',true,null);
      create table production_department_products(department_id uuid,sku_code text);
      insert into production_department_products values('${departmentId}','QA-PAIL'),('${departmentId}','QA-PACK');
      create table products_cache(sku_code text primary key,sku_name text,iccat_code text,uom_name text,image_url text,is_active boolean);
      insert into products_cache values('QA-PAIL','สินค้าปี๊บทดสอบ ไม่ใช่สินค้าบริษัท','04','ลัง',null,true),('QA-PACK','สินค้าซองทดสอบ ไม่ใช่สินค้าบริษัท','04','ลัง',null,true);
      create table pallet_trade_code_barcodes(goods_code text,sku_code text,product_barcode text);
      create table production_non_wage_packing_outputs(id uuid,work_date date,created_at timestamptz);
      create table production_wip_can_issue_details(movement_id uuid);`);
    for (const file of ["20260817125140_add_fg_wip_end_of_day_flow.sql", "20260818073041_add_wip_can_issue_flow.sql", "20260826075346_add_wip_opening_balance_flow.sql", "20260826093659_make_fg_wip_carryover_optional.sql"]) sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
    sql(readFileSync("scripts/install-packing-workspace.sql", "utf8"));
    sql(`grant usage on schema public to service_role; grant select on all tables in schema public to service_role;
      select record_fg_wip_end_of_day('qa-original','qa-original','${date}',null,'${lot}','QA-PAIL','สินค้าทดสอบ','QA-PAIL','ลัง',12,1,'QA-PAIL','สินค้าทดสอบ','QA-PAIL',42,'${actor}','qa-only');
      select record_wip_opening_balance_batch('qa-opening','${date}','[{"productCode":"QA-PAIL","productName":"สินค้าทดสอบ","barcode":"QA-PAIL","lotNo":"${lot}","quantity":52}]','${actor}','qa-only');`);
    const literal = value => value === null || value === undefined ? "null" : typeof value === "boolean" || typeof value === "number" ? String(value) : `'${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll("'", "''")}'${typeof value === "object" ? "::jsonb" : ""}`;
    const identifier = name => { assert.match(name, /^[a-z_][a-z_0-9]*$/); return `"${name}"`; };
    function query(table) {
      identifier(table);
      const filters = [], orders = []; let offset = 0, limit = Infinity, one = false, patch = null;
      function condition(key, expression) {
        if (key.startsWith("products_cache.")) filters.push(`exists(select 1 from products_cache j where j.sku_code=${identifier(table)}.sku_code and j.${identifier(key.slice(15))} ${expression})`);
        else filters.push(`${identifier(key)} ${expression}`);
        return api;
      }
      const api = {
        select() { return this; }, eq(key, value) { return condition(key, `= ${literal(value)}`); },
        in(key, values) { return condition(key, values.length ? `in (${values.map(literal).join(",")})` : "in (null)"); },
        is(key, value) { return condition(key, `is ${literal(value)}`); }, gt(key, value) { return condition(key, `> ${literal(value)}`); },
        lte(key, value) { return condition(key, `<= ${literal(value)}`); }, gte(key, value) { return condition(key, `>= ${literal(value)}`); },
        order(key, options) { orders.push(`${identifier(key)} ${options?.ascending === false ? "desc" : "asc"}`); return this; },
        limit(value) { limit = value; return this; }, range(from, to) { offset = from; limit = to - from + 1; return this; },
        maybeSingle() { one = true; return this; }, single() { one = true; return this; }, update(value) { patch = value; return this; },
        or(value) { const term = value.match(/"%([^%]*)%"/)?.[1] || ""; filters.push(`(sku_code ilike ${literal(`%${term}%`)} or sku_name ilike ${literal(`%${term}%`)})`); return this; },
        then(resolve, reject) {
          try {
            const where = filters.length ? `where ${filters.join(" and ")}` : "";
            const statement = patch ? `update ${identifier(table)} set ${Object.entries(patch).map(([key, value]) => `${identifier(key)}=${literal(value)}`).join(",")} ${where} returning *` : `select * from ${identifier(table)} ${where}${orders.length ? ` order by ${orders.join(",")}` : ""}`;
            const rows = JSON.parse(sql(`begin; set local role service_role; select coalesce(json_agg(q),'[]'::json) from (${patch ? "select 1" : statement}) q; rollback;`) || "[]");
            if (patch) sql(`begin; set local role service_role; ${statement}; commit;`);
            const slice = rows.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
            return Promise.resolve({ data: one ? slice[0] || null : slice, count: rows.length, error: null }).then(resolve, reject);
          } catch (error) { return Promise.resolve({ data: null, error: { code: error.code, message: error.message } }).then(resolve, reject); }
        },
      };
      return api;
    }
    const db = { from: query, rpc(name, params) {
      try {
        identifier(name);
        const call = `public.${name}(${Object.entries(params).map(([key, value]) => `${identifier(key)}=>${literal(value)}`).join(",")})`;
        const statement = name === "packing_workspace_sources" ? `select coalesce(json_agg(q),'[]'::json) from ${call} q` : `select to_jsonb(${call})`;
        return { data: JSON.parse(sql(`begin; set local role service_role; ${statement}; commit;`)), error: null };
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    } };
    class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    const tradeRows = [
      { SKU_CODE: "QA-PAIL", SKU_NAME: "สินค้าปี๊บทดสอบ ไม่ใช่สินค้าบริษัท", GOODS_CODE: "QA-PAIL", ICCAT_CODE: "04", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 12 },
      { SKU_CODE: "QA-PACK", SKU_NAME: "สินค้าซองทดสอบ ไม่ใช่สินค้าบริษัท", GOODS_CODE: "QA-PACK", ICCAT_CODE: "04", UTQ_NAME: "ซอง", UTQ_QTY: 1, UTQ_NAME_1: "แพ็ค", UTQ_QTY_1: 10, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 100 },
    ];
    const dependencies = { ApiError, getSupabaseAdmin: () => db, createHash: crypto.createHash, crypto, URL, URLSearchParams, Response,
      process: { env: { PACKING_WORKSPACE_ENABLED: "true" } },
      requireTaskPermission: async () => ({ userId: actor, isAdmin: true, permissions: [] }),
      fetchGatewayJson: async (_url, params) => ({ ok: true, data: { data: tradeRows.filter(row => !params.get("skuCodes") || row.SKU_CODE === params.get("skuCodes")), pagination: { totalPages: 1 } } }),
      buildPackingUnits, quantityInBase, supplementPackingUnits, readPackingUnitSetting: async () => null, legacyPackingHistory, loadPackingProductPage, fetchAllSupabaseRows, lotFromWorkDate, toBangkokDateKey, validatePieceRateWorkDate, buildFgPackingReportRows,
    };
    function load(file, names, extra = {}) {
      const context = vm.createContext({ ...dependencies, ...extra });
      const source = readFileSync(file, "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
      vm.runInContext(source + `\nthis.exports={${names.join(",")}};`, context);
      return context.exports;
    }
    const scope = load("src/lib/scale/live-access.js", ["loadWeightScaleLiveDepartmentScope"]);
    const workspace = load("src/lib/packing-workspace-service.js", ["readPackingWorkspace", "savePackingWorkspace"], scope);
    const old = load("src/features/production-line/services/fgWipService.js", ["listFgProducts", "listAvailableWipCans", "issueWipCans", "createFgWipDocument", "listFgWipDocuments"]);
    const dispatch = async (url, method = "GET", body) => {
      const request = new Request(url, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const parsed = new URL(url), pathname = parsed.pathname;
      if (pathname === "/api/auth/permissions") return Response.json({ is_admin: true, permissions: [], task_permissions_enabled: true });
      if (pathname === "/api/auth/profile") return Response.json({ profile: { username: "QA-ONLY", department: "ฐานทดสอบ" } });
      if (pathname === "/api/attendance/non-wage-packing-output") {
        if (method === "POST") return workspace.savePackingWorkspace(request, body);
        if (parsed.searchParams.get("version") === "2") return workspace.readPackingWorkspace(request, parsed.searchParams);
        return Response.json({ data: [] });
      }
      if (pathname.endsWith("/fg-wip/products")) return Response.json(await old.listFgProducts(request));
      if (pathname.endsWith("/fg-wip/issues")) return Response.json(method === "POST" ? await old.issueWipCans(request, body) : await old.listAvailableWipCans(request));
      if (pathname.endsWith("/fg-wip")) return Response.json(method === "POST" ? await old.createFgWipDocument(request, body) : await old.listFgWipDocuments(request));
      throw new ApiError(404, `Unconfigured test endpoint ${pathname}`);
    };
    return { close, sql, dispatch, actor, departmentId, date, lot };
  } catch (error) { close(); throw error; }
}
