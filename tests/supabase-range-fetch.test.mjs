import test from "node:test";
import assert from "node:assert/strict";

import { fetchSupabaseRowsByChunks } from "../src/lib/supabaseRangeFetch.js";

test("แบ่งค่า IN query เป็นชุดย่อยเพื่อไม่ให้ PostgREST URL ยาวเกิน", async () => {
  const values = Array.from({ length: 205 }, (_, index) => `SKU-${index + 1}`);
  const receivedChunks = [];

  const rows = await fetchSupabaseRowsByChunks(
    values,
    async (chunk) => {
      receivedChunks.push(chunk);
      return { data: chunk.map((sku) => ({ sku })), error: null };
    },
    { chunkSize: 80 }
  );

  assert.deepEqual(receivedChunks.map((chunk) => chunk.length), [80, 80, 45]);
  assert.equal(rows.length, 205);
  assert.equal(rows[204].sku, "SKU-205");
});

test("แบ่งชุดก่อนถึงขีดจำกัดเมื่อค่า IN มีข้อความที่ URL encode แล้วยาว", async () => {
  const values = Array.from({ length: 12 }, (_, index) => `สินค้า-${index + 1}-${"ยาว".repeat(20)}`);
  const receivedChunks = [];

  await fetchSupabaseRowsByChunks(
    values,
    async (chunk) => {
      receivedChunks.push(chunk);
      return { data: chunk, error: null };
    },
    { chunkSize: 80, maxEncodedValuesLength: 500 }
  );

  assert.ok(receivedChunks.length > 1);
  receivedChunks.forEach((chunk) => {
    const encodedLength = chunk.reduce(
      (sum, value) => sum + encodeURIComponent(String(value)).length + 3,
      0
    );
    assert.ok(encodedLength <= 500 || chunk.length === 1);
  });
});
