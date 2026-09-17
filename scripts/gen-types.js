const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    env[key] = value;
  }
  return env;
};

const envFromFile = readEnvFile(path.join(process.cwd(), ".env.local"));
const dbUrl = process.env.SUPABASE_DB_URL || envFromFile.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL (set it in .env.local or environment).");
  process.exit(1);
}

const args = [
  "supabase",
  "gen",
  "types",
  "typescript",
  "--db-url",
  dbUrl,
  "--schema",
  "public",
];

let output;
try {
  if (process.platform === "win32") {
    output = execSync(
      'call npx.cmd supabase gen types typescript --db-url "%SUPABASE_DB_URL%" --schema public',
      {
        encoding: "utf8",
        env: { ...process.env, SUPABASE_DB_URL: dbUrl },
        stdio: ["ignore", "pipe", "inherit"],
      }
    );
  } else {
    output = execFileSync("npx", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  }
} catch (error) {
  console.error("Failed to generate Supabase types from SUPABASE_DB_URL.");
  process.exit(Number.isInteger(error.status) ? error.status : 1);
}

const outputPath = path.join(process.cwd(), "src", "types", "supabase.ts");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
