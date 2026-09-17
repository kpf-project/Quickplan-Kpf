import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routePath = path.resolve(
  "src/app/api/production-piece-rate-settings/route.js"
);

test("piece-rate settings load mappings in bounded batches", () => {
  const source = fs.readFileSync(routePath, "utf8");

  assert.match(source, /const PIECE_RATE_MAPPING_CHUNK_SIZE = 200;/);
  assert.match(source, /productCodes\.slice\(index, index \+ PIECE_RATE_MAPPING_CHUNK_SIZE\)/);
  assert.doesNotMatch(
    source,
    /\.in\("product_code", productCodes\)/
  );
  assert.match(source, /rowsToDelete\.slice\(index, index \+ PIECE_RATE_MAPPING_CHUNK_SIZE\)/);
  assert.doesNotMatch(
    source,
    /\.in\("product_code", rowsToDelete\)/
  );
});
