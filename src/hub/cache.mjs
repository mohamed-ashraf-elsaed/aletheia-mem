// A bounded retrieval-result cache. Every key includes the store revision, so any write that bumps the revision
// invalidates the cache and a stale result can never be returned. Entries are evicted least-recently-used when the
// capacity is exceeded.
export class RetrievalCache {
  constructor({ capacity = 512, revision = () => 0 } = {}) {
    this.capacity = Math.max(1, capacity);
    this.revision = revision;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  key(parts) {
    const normalized = {
      q: String(parts.query ?? "").trim().toLowerCase(),
      project: parts.project ?? null,
      kind: parts.kind ?? null,
      type: parts.type ?? null,
      tool: parts.tool ?? null,
      limit: parts.limit ?? 20,
      since: parts.since ?? null,
      until: parts.until ?? null,
      rev: this.revision(),
    };
    return JSON.stringify(normalized);
  }

  get(cacheKey) {
    const entry = this.map.get(cacheKey);
    if (entry === undefined) { this.misses += 1; return undefined; }
    this.hits += 1;
    this.map.delete(cacheKey);
    this.map.set(cacheKey, entry);
    return entry.value;
  }

  set(cacheKey, value) {
    this.map.delete(cacheKey);
    this.map.set(cacheKey, { value });
    while (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value);
  }

  get hitRate() {
    const total = this.hits + this.misses;
    return total ? this.hits / total : 0;
  }
}
