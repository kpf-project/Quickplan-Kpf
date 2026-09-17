import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("production stock issue page does not render mojibake Thai copy", () => {
  const source = readRepoFile(
    "src/features/production-line/components/ProductionStockIssuePageClient.js"
  );

  assert.doesNotMatch(
    source,
    /[àâÃ�]/,
    "issue page source should not contain mojibake characters"
  );
  assert.match(
    source,
    /เบิกสำเร็จ: บาร์โค้ด/,
    "single issue success message should be stored as readable Thai"
  );
  assert.match(
    source,
    /เบิกสำเร็จ \$\{successCount\} รายการ/,
    "batch issue success message should be stored as readable Thai"
  );
});
