// Each report-center mount owns its cache; never persist report data in storage.
export function createReportRequestCache(maxEntries = 12) {
  const entries = new Map();
  const pending = new Map();
  let generation = 0;
  return {
    get(key) { return entries.get(key); },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    clear() { generation += 1; entries.clear(); pending.clear(); },
    async load(key, loader) {
      if (pending.has(key)) return pending.get(key);
      const currentGeneration = generation;
      const request = Promise.resolve().then(loader).then((value) => {
        if (currentGeneration !== generation) throw new Error("Report session changed; reload the report");
        if (currentGeneration === generation) {
          entries.delete(key);
          entries.set(key, value);
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        return value;
      }).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
  };
}
