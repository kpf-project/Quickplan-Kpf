const DEFAULT_MAX_ENCODED_FILTER_LENGTH = 2000;

function splitValuesByEncodedLength(values, maxEncodedLength) {
  const batches = [];
  let current = [];
  let currentLength = 0;

  Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean))).forEach((value) => {
    const encodedLength = encodeURIComponent(String(value)).length + 1;
    if (current.length > 0 && currentLength + encodedLength > maxEncodedLength) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(value);
    currentLength += encodedLength;
  });

  if (current.length > 0) batches.push(current);
  return batches;
}

export async function loadProductsCacheMatches(
  supabase,
  { column, values, maxEncodedLength = DEFAULT_MAX_ENCODED_FILTER_LENGTH } = {}
) {
  const batches = splitValuesByEncodedLength(
    values,
    Math.max(1, Number(maxEncodedLength) || DEFAULT_MAX_ENCODED_FILTER_LENGTH)
  );
  if (!batches.length) return { data: [], error: null };

  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from("products_cache")
        .select("sku_code,sku_name")
        .in(column, batch)
    )
  );
  const failed = results.find((result) => result?.error);
  if (failed) return { data: null, error: failed.error };

  return {
    data: results.flatMap((result) => (Array.isArray(result?.data) ? result.data : [])),
    error: null,
  };
}
