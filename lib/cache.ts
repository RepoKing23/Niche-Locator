/** Kinds of DataForSEO results we cache, and how keys are built for them. */
export type CacheKind = "kd" | "serp" | "local";

export const CACHE_MAX_AGE_DAYS = 30;

export const cacheKey = {
  kd: (keyword: string, cityId: string) => `${keyword}|${cityId}`,
  serp: (keyword: string, cityId: string) => `${keyword}|${cityId}`,
  local: (variants: string[], cityId: string) => `${[...new Set(variants)].sort().join(",")}|${cityId}`,
};

export type CacheEntry = { data: unknown; at: number };

/** Low-level key/value backend (IndexedDB in the browser, memory in tests). Keys include the kind. */
export interface CacheBackend {
  getMany(keys: string[]): Promise<Map<string, CacheEntry>>;
  putMany(entries: [string, CacheEntry][]): Promise<void>;
}

export class MemoryCache implements CacheBackend {
  private m = new Map<string, CacheEntry>();
  async getMany(keys: string[]) {
    return new Map(keys.flatMap((k) => (this.m.has(k) ? [[k, this.m.get(k)!] as const] : [])));
  }
  async putMany(entries: [string, CacheEntry][]) {
    entries.forEach(([k, v]) => this.m.set(k, v));
  }
}

/** Keep only entries younger than maxAgeDays. */
export function fresh(entries: Map<string, CacheEntry>, maxAgeDays = CACHE_MAX_AGE_DAYS, now = Date.now()) {
  const cutoff = now - maxAgeDays * 86_400_000;
  return new Map([...entries].filter(([, e]) => e.at >= cutoff));
}
