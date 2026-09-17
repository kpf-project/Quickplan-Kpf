import assert from "node:assert/strict";
import test from "node:test";

test("schedule inbox splits long product filters before querying PostgREST", async () => {
  const queryModule = await import("../src/lib/scheduleInboxProducts.js").catch(() => ({}));
  assert.equal(typeof queryModule.loadProductsCacheMatches, "function");

  const values = [
    "แผ่นแครกเกอร์โบตั๋น",
    "แป้งหมัก",
    "ครีมรสวนิลาบิสกิต",
    "ฟิล์มยืดเอ็มเสตรช",
  ];
  const maxEncodedLength = 250;
  const supabase = {
    from(table) {
      assert.equal(table, "products_cache");
      return {
        select(columns) {
          assert.equal(columns, "sku_code,sku_name");
          return {
            async in(column, batch) {
              assert.equal(column, "sku_name");
              const encodedLength = batch.reduce(
                (total, value) => total + encodeURIComponent(value).length + 1,
                0
              );
              if (encodedLength > maxEncodedLength) {
                return { data: null, error: new Error("HeadersOverflowError") };
              }
              return {
                data: batch.map((value, index) => ({
                  sku_code: `SKU-${value.length}-${index}`,
                  sku_name: value,
                })),
                error: null,
              };
            },
          };
        },
      };
    },
  };

  const result = await queryModule.loadProductsCacheMatches(supabase, {
    column: "sku_name",
    values,
    maxEncodedLength,
  });

  assert.equal(result.error, null);
  assert.deepEqual(
    result.data.map((row) => row.sku_name),
    values
  );
});
