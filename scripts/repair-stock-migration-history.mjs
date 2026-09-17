import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";

nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.SUPABASE_DB_URL);
if (url.hostname !== "192.168.210.185" || url.port !== "5532") throw new Error("Unexpected database target");
url.searchParams.set("sslmode", "disable");
const result = spawnSync("supabase", ["migration", "repair", "20260907030917", "--status", "applied", "--db-url", url.toString(), "--yes"], {
  encoding: "utf8",
  env: process.env,
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) throw result.error;
process.exit(result.status ?? 1);
