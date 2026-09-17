import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.SUPABASE_DB_URL);
if (url.hostname !== "192.168.210.185" || url.port !== "5532") throw new Error("Unexpected database target");
const file = process.argv[2];
if (!file) throw new Error("SQL file required");
const apply = process.argv.includes("--apply");
const result = spawnSync("psql", ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", `APPLY=${apply}`, "-f", "-"], {
  input: readFileSync(file, "utf8"), encoding: "utf8",
  env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port,
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1), PGCONNECT_TIMEOUT: "8" },
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
