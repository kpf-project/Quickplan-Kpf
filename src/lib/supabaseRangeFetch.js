export async function fetchAllSupabaseRows(buildQuery, {
  chunkSize = 1000,
  onError,
} = {}) {
  const normalizedChunkSize = Math.min(
    Math.max(Number.parseInt(String(chunkSize || ""), 10) || 1000, 1),
    1000
  );
  const rows = [];
  let from = 0;

  while (true) {
    const result = await buildQuery().range(from, from + normalizedChunkSize - 1);

    if (result.error) {
      if (typeof onError === "function") {
        return onError(result.error);
      }
      throw result.error;
    }

    const chunk = result.data || [];
    rows.push(...chunk);

    if (chunk.length < normalizedChunkSize) {
      return rows;
    }

    from += normalizedChunkSize;
  }
}

export async function fetchSupabaseRowsByChunks(values, buildQuery, {
  chunkSize = 80,
  maxEncodedValuesLength = 1800,
  onError,
} = {}) {
  const normalizedValues = Array.from(
    new Set((Array.isArray(values) ? values : []).filter(Boolean))
  );
  const normalizedChunkSize = Math.max(
    Number.parseInt(String(chunkSize || ""), 10) || 80,
    1
  );
  const normalizedMaxEncodedLength = Math.max(
    Number.parseInt(String(maxEncodedValuesLength || ""), 10) || 1800,
    256
  );
  const rows = [];
  const chunks = [];
  let currentChunk = [];
  let currentEncodedLength = 0;
  normalizedValues.forEach((value) => {
    const encodedLength = encodeURIComponent(String(value)).length + 3;
    if (
      currentChunk.length > 0
      && (currentChunk.length >= normalizedChunkSize
        || currentEncodedLength + encodedLength > normalizedMaxEncodedLength)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentEncodedLength = 0;
    }
    currentChunk.push(value);
    currentEncodedLength += encodedLength;
  });
  if (currentChunk.length) chunks.push(currentChunk);

  for (const chunk of chunks) {
    const result = await buildQuery(chunk);

    if (result.error) {
      if (typeof onError === "function") {
        return onError(result.error);
      }
      throw result.error;
    }

    rows.push(...(result.data || []));
  }

  return rows;
}
