/**
 * Browser-side DataForSEO fetchers with a shared result cache: every function first reads
 * the cache, only sends uncached cities to the API, and writes new results back, so the
 * same keyword + city is never paid for twice within CACHE_MAX_AGE_DAYS.
 */
import { SERP_BATCH, SERP_PARALLEL, postJson, sleep } from "./api";
import { cacheKey, type CacheKind } from "./cache";
import { chunk } from "./keywords";
import type { Store } from "./store/types";
import type { KeywordMetrics, LocalDemand, SerpInfo } from "./types";

export type FetchOptions = {
  store: Store;
  /** Ignore cached results and pay for fresh data. */
  refresh?: boolean;
  shouldStop?: () => boolean;
};

export type Batch<T> = { results: Record<string, T>; errors: Record<string, string>; cost: number; cached: number };

async function fromCache<T>(opts: FetchOptions, kind: CacheKind, keys: Map<string, string>) {
  if (opts.refresh) return new Map<string, T>();
  try {
    const hits = await opts.store.getCached(kind, [...keys.values()]);
    const byId = new Map<string, T>();
    keys.forEach((key, id) => hits.has(key) && byId.set(id, hits.get(key) as T));
    return byId;
  } catch {
    return new Map<string, T>();
  }
}

async function toCache(opts: FetchOptions, kind: CacheKind, entries: [string, unknown][]) {
  if (!entries.length) return;
  try {
    await opts.store.putCached(kind, entries);
  } catch {
    // Cache is best-effort; results are still returned.
  }
}

// ---------- City keyword difficulty ----------

export async function getCityKd(
  keyword: string, cityIds: string[], opts: FetchOptions,
): Promise<Batch<number | null>> {
  const keys = new Map(cityIds.map((id) => [id, cacheKey.kd(keyword, id)]));
  const hits = await fromCache<number | null>(opts, "kd", keys);
  const out: Batch<number | null> = { results: Object.fromEntries(hits), errors: {}, cost: 0, cached: hits.size };
  const missing = cityIds.filter((id) => !hits.has(id));
  for (const ids of chunk(missing, 1000)) {
    if (opts.shouldStop?.()) break;
    try {
      const r = await postJson<{ results: Record<string, number | null>; cost: number }>("/api/kd", { keyword, cityIds: ids });
      Object.assign(out.results, r.results);
      out.cost += r.cost;
      await toCache(opts, "kd", Object.entries(r.results).map(([id, v]) => [keys.get(id)!, v]));
    } catch (e) {
      ids.forEach((id) => (out.errors[id] = (e as Error).message));
    }
  }
  return out;
}

// ---------- City-level Google Ads ("<keyword> <city>", ~$0.09 per 1,000 cities) ----------

export async function getCityAds(
  keyword: string, cityIds: string[], opts: FetchOptions,
): Promise<Batch<KeywordMetrics | null>> {
  const keys = new Map(cityIds.map((id) => [id, cacheKey.ads(keyword, id)]));
  const hits = await fromCache<KeywordMetrics | null>(opts, "ads", keys);
  const out: Batch<KeywordMetrics | null> = { results: Object.fromEntries(hits), errors: {}, cost: 0, cached: hits.size };
  const missing = cityIds.filter((id) => !hits.has(id));
  for (const ids of chunk(missing, 1000)) {
    if (opts.shouldStop?.()) break;
    try {
      const r = await postJson<{ results: Record<string, KeywordMetrics | null>; cost: number }>("/api/city-ads", { keyword, cityIds: ids });
      Object.assign(out.results, r.results);
      out.cost += r.cost;
      await toCache(opts, "ads", Object.entries(r.results).map(([id, v]) => [keys.get(id)!, v]));
    } catch (e) {
      ids.forEach((id) => (out.errors[id] = (e as Error).message));
    }
  }
  return out;
}

// ---------- Keyword Check: pasted keywords in one city ----------

export type KeywordCheckData = {
  ads: Record<string, KeywordMetrics | null>;
  kd: Record<string, number | null>;
  cost: number;
  cached: number;
};

/** City-targeted Google Ads data + keyword difficulty for pasted keywords (cache first). */
export async function getKeywordCheck(keywords: string[], cityId: string, opts: FetchOptions): Promise<KeywordCheckData> {
  // Cached under existing kinds with distinct keys: city-targeted ads → "local", keyword KD → "kd" (US-wide).
  const adsKeys = new Map(keywords.map((k) => [k, `check:${k}|${cityId}`]));
  const kdKeys = new Map(keywords.map((k) => [k, `${k}|us`]));
  const [adsHits, kdHits] = await Promise.all([
    fromCache<KeywordMetrics | null>(opts, "local", adsKeys),
    fromCache<number | null>(opts, "kd", kdKeys),
  ]);
  const out: KeywordCheckData = {
    ads: Object.fromEntries(adsHits), kd: Object.fromEntries(kdHits), cost: 0,
    cached: [...adsHits.keys()].filter((k) => kdHits.has(k)).length,
  };
  const missing = keywords.filter((k) => !adsHits.has(k) || !kdHits.has(k));
  for (const batch of chunk(missing, 1000)) {
    if (opts.shouldStop?.()) break;
    const r = await postJson<{ keywords: string[]; ads: Record<string, KeywordMetrics | null>; kd: Record<string, number | null>; cost: number }>(
      "/api/keyword-check", { keywords: batch, cityId, withKd: batch.some((k) => !kdHits.has(k)) },
    );
    out.cost += r.cost;
    for (const k of r.keywords) {
      out.ads[k] = r.ads[k] ?? null;
      if (k in r.kd || !kdHits.has(k)) out.kd[k] = r.kd[k] ?? null;
    }
    await toCache(opts, "local", r.keywords.map((k) => [adsKeys.get(k) ?? `check:${k}|${cityId}`, r.ads[k] ?? null]));
    await toCache(opts, "kd", r.keywords.filter((k) => !kdHits.has(k)).map((k) => [kdKeys.get(k) ?? `${k}|us`, r.kd[k] ?? null]));
  }
  return out;
}

// ---------- Live SERP (fast, ~$0.002/city) ----------

export async function getLiveSerps(
  keyword: string, cityIds: string[], opts: FetchOptions & { onBatch: (b: Batch<SerpInfo>) => void },
) {
  const keys = new Map(cityIds.map((id) => [id, cacheKey.serp(keyword, id)]));
  const hits = await fromCache<SerpInfo>(opts, "serp", keys);
  if (hits.size) opts.onBatch({ results: Object.fromEntries(hits), errors: {}, cost: 0, cached: hits.size });
  const missing = cityIds.filter((id) => !hits.has(id));
  for (const wave of chunk(chunk(missing, SERP_BATCH), SERP_PARALLEL)) {
    if (opts.shouldStop?.()) return;
    await Promise.all(wave.map(async (ids) => {
      try {
        const r = await postJson<{ results: Record<string, SerpInfo>; errors: Record<string, string>; cost: number }>(
          "/api/serp", { keyword, cityIds: ids },
        );
        await toCache(opts, "serp", Object.entries(r.results).map(([id, s]) => [keys.get(id)!, s]));
        opts.onBatch({ ...r, cached: 0 });
      } catch (e) {
        opts.onBatch({ results: {}, errors: Object.fromEntries(ids.map((id) => [id, (e as Error).message])), cost: 0, cached: 0 });
      }
    }));
  }
}

// ---------- Queued SERP (~$0.0006/city, results in ~1–5 min) ----------

export type PendingSerpTask = { keyword: string; cityId: string; taskId: string; queuedAt: number };

const PENDING_KEY = "niche-locator:pending-serp";
const QUEUE_TIMEOUT_MS = 30 * 60_000;

/** Queued tasks survive reloads here so paid results are always collected (into the cache). */
export const pendingTasks = {
  list(): PendingSerpTask[] {
    try {
      const all = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingSerpTask[];
      // Results are kept by DataForSEO for 30 days; drop anything older.
      return all.filter((t) => Date.now() - t.queuedAt < 29 * 86_400_000);
    } catch {
      return [];
    }
  },
  save(tasks: PendingSerpTask[]) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(tasks));
    } catch {
      // best-effort
    }
  },
  add(tasks: PendingSerpTask[]) {
    this.save([...this.list(), ...tasks]);
  },
  remove(taskIds: string[]) {
    const drop = new Set(taskIds);
    this.save(this.list().filter((t) => !drop.has(t.taskId)));
  },
};

/** Poll queued tasks until all are collected (or timeout / stop). Collected results are cached. */
export async function collectQueued(
  tasks: PendingSerpTask[],
  opts: FetchOptions & { pollMs: number; onBatch: (b: Batch<SerpInfo>, keyword: string) => void; onWaiting?: (left: number) => void },
) {
  let left = [...tasks];
  const started = Date.now();
  while (left.length && !opts.shouldStop?.()) {
    const done = new Set<string>();
    for (const byKeyword of groupBy(left, (t) => t.keyword)) {
      for (const batch of chunk(byKeyword, 100)) {
        try {
          const r = await postJson<{ results: Record<string, SerpInfo>; pending: string[]; errors: Record<string, string> }>(
            "/api/serp/collect",
            { keyword: batch[0].keyword, tasks: batch.map(({ cityId, taskId }) => ({ cityId, taskId })) },
          );
          await toCache(opts, "serp", Object.entries(r.results).map(([id, s]) => [cacheKey.serp(batch[0].keyword, id), s]));
          const finished = batch.filter((t) => t.cityId in r.results || t.cityId in r.errors);
          finished.forEach((t) => done.add(t.taskId));
          pendingTasks.remove(finished.map((t) => t.taskId));
          if (finished.length) opts.onBatch({ results: r.results, errors: r.errors, cost: 0, cached: 0 }, batch[0].keyword);
        } catch {
          // Network hiccup: try again next round.
        }
      }
    }
    left = left.filter((t) => !done.has(t.taskId));
    if (!left.length) break;
    if (Date.now() - started > QUEUE_TIMEOUT_MS) {
      for (const group of groupBy(left, (t) => t.keyword)) {
        opts.onBatch({
          results: {}, cost: 0, cached: 0,
          errors: Object.fromEntries(group.map((t) => [t.cityId, "Still queued at DataForSEO — results will be picked up later"])),
        }, group[0].keyword);
      }
      return;
    }
    opts.onWaiting?.(left.length);
    await sleep(opts.pollMs);
  }
}

export async function getQueuedSerps(
  keyword: string, cityIds: string[],
  opts: FetchOptions & { pollMs: number; onBatch: (b: Batch<SerpInfo>) => void; onQueued?: (n: number, cost: number) => void; onWaiting?: (left: number) => void },
) {
  const keys = new Map(cityIds.map((id) => [id, cacheKey.serp(keyword, id)]));
  const hits = await fromCache<SerpInfo>(opts, "serp", keys);
  if (hits.size) opts.onBatch({ results: Object.fromEntries(hits), errors: {}, cost: 0, cached: hits.size });
  // Reuse tasks already queued (and paid for) in an earlier session.
  const already = pendingTasks.list().filter((t) => t.keyword === keyword && cityIds.includes(t.cityId) && !hits.has(t.cityId));
  const alreadyIds = new Set(already.map((t) => t.cityId));
  const missing = cityIds.filter((id) => !hits.has(id) && !alreadyIds.has(id));
  const queued: PendingSerpTask[] = [...already];
  for (const ids of chunk(missing, 1000)) {
    if (opts.shouldStop?.()) break;
    try {
      const r = await postJson<{ tasks: { cityId: string; taskId: string }[]; errors: Record<string, string>; cost: number }>(
        "/api/serp/queue", { keyword, cityIds: ids },
      );
      const fresh = r.tasks.map((t) => ({ ...t, keyword, queuedAt: Date.now() }));
      pendingTasks.add(fresh);
      queued.push(...fresh);
      opts.onQueued?.(fresh.length, r.cost);
      if (Object.keys(r.errors).length) opts.onBatch({ results: {}, errors: r.errors, cost: 0, cached: 0 });
    } catch (e) {
      opts.onBatch({ results: {}, errors: Object.fromEntries(ids.map((id) => [id, (e as Error).message])), cost: 0, cached: 0 });
    }
  }
  await collectQueued(queued, opts);
}

// ---------- Exact city demand (Google Ads, ~$0.09/city) ----------

export async function getLocal(
  variants: string[], cityId: string, opts: FetchOptions,
): Promise<{ demand: LocalDemand; cached: boolean }> {
  const key = cacheKey.local(variants, cityId);
  const hits = await fromCache<LocalDemand>(opts, "local", new Map([[cityId, key]]));
  const hit = hits.get(cityId);
  if (hit) return { demand: { ...hit, cost: 0 }, cached: true };
  const r = await postJson<{ demand: LocalDemand }>("/api/local", { variants, cityId });
  await toCache(opts, "local", [[key, r.demand]]);
  return { demand: r.demand, cached: false };
}

function groupBy<T>(items: T[], key: (t: T) => string): T[][] {
  const m = new Map<string, T[]>();
  items.forEach((i) => m.set(key(i), [...(m.get(key(i)) ?? []), i]));
  return [...m.values()];
}
