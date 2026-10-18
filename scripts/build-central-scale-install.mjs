import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const files = ["numbering", "receipts", "authorization", "devices", "capture-guard", "api"]
  .map(name => "scripts/apply-central-scale-" + name + ".sql");
const sections = files.map(file => {
  const source = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  if (!source.startsWith("\\set ON_ERROR_STOP on\nbegin;\n") || !source.endsWith("\\if :APPLY\ncommit;\n\\else\nrollback;\n\\endif\n")) {
    throw new Error("Unexpected transaction wrapper: " + file);
  }
  return "-- Source: " + file + "\n" + source.replace(/^\\set ON_ERROR_STOP on\nbegin;\n/, "")
    .replace(/\\if :APPLY\ncommit;\n\\else\nrollback;\n\\endif\n$/, "");
});
const directory = path.resolve("output/central-scale");
mkdirSync(directory, { recursive: true });
const target = path.join(directory, "install-central-scale.sql");
writeFileSync(target, "-- Install only new central storage. No product/device seeds or role grants. Receiving stays disabled.\nbegin;\n\n"
  + sections.join("\n") + "\nnotify pgrst, 'reload schema';\ncommit;\n", "utf8");
console.log(target);
