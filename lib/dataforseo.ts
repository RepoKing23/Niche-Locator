import { isWeakDomain, normalizeDomain } from "./directories";
import { cleanKeyword } from "./keywords";
import { serpDifficulty } from "./scoring";
import type { Competition, KeywordMetrics, SerpInfo } from "./types";

const API = "https://api.dataforseo.com/v3";
export const US_LOCATION_CODE = 2840;

/** Approximate DataForSEO prices (USD) for cost estimates shown in the UI. */
export const PRICES = {
  serpQueuedTask: 0.0006,
  cityKdRequest: 0.01,
  cityKdPerKeyword: 0.0001,
  googleAdsRequest: 0.09,
  difficultyRequest: 0.0125,
  serpRequest: 0.002,
  labsRequest: 0.01,
  labsPerKeyword: 0.0001,
};

/**
 * Where keyword volume/CPC/competition come from:
 * - "labs": DataForSEO Labs Keyword Overview — Google Ads data refreshed monthly, plus keyword difficulty,
 *   ~$0.01 + $0.0001/keyword (only keywords it has data for are charged). US-level.
 * - "ads": live Google Ads API — flat ~$0.09 per request of up to 1,000 keywords; can target a city.
 */
export type AdsSource = "labs" | "ads";

/** Google Ads live endpoints allow 12 requests/minute per account. */
export const GOOGLE_ADS_MIN_INTERVAL_MS = 5200;

export function hasCredentials(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

export type ApiTask<T> = {
  id?: string; status_code: number; status_message: string; cost?: number; result: T[] | null;
  data?: { tag?: string };
};
type ApiResponse<T> = { status_code: number; status_message: string; cost?: number; tasks?: ApiTask<T>[] };

/** Errors that retrying won't fix (bad credentials, no balance, invalid task). */
export class DataForSeoError extends Error {}

/** Authenticated request with retries on network errors, 5xx and rate limits. Returns the raw response. */
async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResponse<T>> {
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString("base64");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      if (res.status === 401) throw new DataForSeoError("DataForSEO rejected the login/password.");
      if (res.status === 402) throw new DataForSeoError("DataForSEO account balance is too low.");
      if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse<T>;
      if (json.status_code !== 20000) throw new DataForSeoError(`DataForSEO: ${json.status_message}`);
      // 40202 = rate limit exceeded; worth retrying after a pause.
      if (json.tasks?.some((t) => t.status_code === 40202)) throw new Error("DataForSEO rate limit");
      return json;
    } catch (err) {
      lastError = err;
      if (err instanceof DataForSeoError) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
}

/** POST a single live task and return its result. */
async function post<T>(path: string, task: Record<string, unknown>): Promise<{ result: T[]; cost: number }> {
  const json = await request<T>("POST", path, [task]);
  const t = json.tasks?.[0];
  if (!t) throw new DataForSeoError("DataForSEO returned no task.");
  if (t.status_code !== 20000) throw new DataForSeoError(`DataForSEO: ${t.status_message}`);
  return { result: t.result ?? [], cost: json.cost ?? t.cost ?? 0 };
}

export type SearchVolumeItem = {
  keyword: string;
  search_volume: number | null;
  competition: Competition | null;
  competition_index: number | null;
  cpc: number | null;
  low_top_of_page_bid: number | null;
  high_top_of_page_bid: number | null;
  monthly_searches: { year: number; month: number; search_volume: number | null }[] | null;
};

export function parseSearchVolume(items: SearchVolumeItem[]): KeywordMetrics[] {
  return items.map((i) => ({
    keyword: i.keyword,
    searchVolume: i.search_volume,
    cpc: i.cpc,
    lowBid: i.low_top_of_page_bid,
    highBid: i.high_top_of_page_bid,
    competition: i.competition,
    competitionIndex: i.competition_index,
    trend: [...(i.monthly_searches ?? [])]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(-12)
      .map((m) => m.search_volume ?? 0),
  }));
}

export type DifficultyResult = { items: { keyword: string; keyword_difficulty: number | null }[] | null };

export function parseDifficulty(results: DifficultyResult[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const r of results) for (const i of r.items ?? []) map.set(i.keyword, i.keyword_difficulty);
  return map;
}

// ---- DataForSEO Labs Keyword Overview: Google Ads metrics + keyword difficulty in one cheap call ----

export const MAX_LABS_KEYWORDS = 700;

export type LabsOverviewItem = {
  keyword: string;
  keyword_info?: {
    search_volume?: number | null;
    cpc?: number | null;
    competition?: number | null;
    competition_level?: Competition | null;
    low_top_of_page_bid?: number | null;
    high_top_of_page_bid?: number | null;
    monthly_searches?: { year: number; month: number; search_volume: number | null }[] | null;
  } | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
};

/** Labs items → the same metrics shape as Google Ads (competition 0-1 → index 0-100). */
export function parseLabsOverview(items: LabsOverviewItem[]) {
  const metrics = new Map<string, KeywordMetrics>();
  const difficulty = new Map<string, number | null>();
  for (const i of items) {
    const k = i.keyword.toLowerCase();
    const info = i.keyword_info ?? {};
    difficulty.set(k, i.keyword_properties?.keyword_difficulty ?? null);
    metrics.set(k, {
      keyword: k,
      searchVolume: info.search_volume ?? null,
      cpc: info.cpc ?? null,
      lowBid: info.low_top_of_page_bid ?? null,
      highBid: info.high_top_of_page_bid ?? null,
      competition: info.competition_level ?? null,
      competitionIndex: info.competition == null ? null : Math.round(info.competition * 100),
      trend: [...(info.monthly_searches ?? [])]
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .slice(-12)
        .map((m) => m.search_volume ?? 0),
    });
  }
  return { metrics, difficulty };
}

/** Labs Keyword Overview for up to any number of keywords (700 per request). US-level data. */
export async function fetchLabsOverview(keywords: string[]) {
  const metrics = new Map<string, KeywordMetrics>();
  const difficulty = new Map<string, number | null>();
  let cost = 0;
  for (let i = 0; i < keywords.length; i += MAX_LABS_KEYWORDS) {
    const r = await post<{ items: LabsOverviewItem[] | null }>("/dataforseo_labs/google/keyword_overview/live", {
      keywords: keywords.slice(i, i + MAX_LABS_KEYWORDS), location_code: US_LOCATION_CODE, language_code: "en",
    });
    cost += r.cost;
    const parsed = parseLabsOverview(r.result.flatMap((x) => x.items ?? []));
    parsed.metrics.forEach((v, k) => metrics.set(k, v));
    parsed.difficulty.forEach((v, k) => difficulty.set(k, v));
  }
  return { metrics, difficulty, cost };
}

/** Metrics with no volume, CPC or competition are treated as "no data". */
export const hasAdsData = (m: KeywordMetrics | undefined | null) =>
  m && (m.cpc != null || m.competitionIndex != null || m.searchVolume != null) ? m : null;

/** National Google Ads metrics + keyword difficulty for the niche variants. */
export async function fetchNiche(variants: string[], source: AdsSource = "labs") {
  if (source === "labs") {
    const { metrics, difficulty, cost } = await fetchLabsOverview(variants);
    return {
      metrics: variants.flatMap((v) => {
        const m = metrics.get(v.toLowerCase());
        return m ? [{ ...m, difficulty: difficulty.get(v.toLowerCase()) ?? null }] : [];
      }),
      cost,
    };
  }
  const [sv, kd] = await Promise.all([
    post<SearchVolumeItem>("/keywords_data/google_ads/search_volume/live", {
      keywords: variants, location_code: US_LOCATION_CODE, language_code: "en",
    }),
    post<DifficultyResult>("/dataforseo_labs/google/bulk_keyword_difficulty/live", {
      keywords: variants, location_code: US_LOCATION_CODE, language_code: "en",
    }),
  ]);
  const difficulty = parseDifficulty(kd.result);
  const metrics = parseSearchVolume(sv.result).map((m) => ({
    ...m,
    difficulty: difficulty.get(m.keyword) ?? null,
  }));
  return { metrics, cost: sv.cost + kd.cost };
}

/** Keywords used to measure a city's demand: the plain variants (searched from inside the city) + "variant city". */
export function localKeywords(variants: string[], cityName: string): string[] {
  const city = cleanKeyword(cityName);
  return [...new Set(variants.flatMap((v) => [v, `${v} ${city}`]))].filter(
    (k) => k.length <= 80 && k.split(" ").length <= 10,
  );
}

export async function fetchLocal(variants: string[], cityName: string, location: string) {
  const { result, cost } = await post<SearchVolumeItem>("/keywords_data/google_ads/search_volume/live", {
    keywords: localKeywords(variants, cityName), location_name: location, language_code: "en",
  });
  return { metrics: parseSearchVolume(result), cost };
}

export type SerpItem = {
  type: string;
  domain?: string;
  title?: string;
  url?: string;
  description?: string;
  rating?: { votes_count?: number | null } | null;
  /** Sub-items, e.g. the individual Local Services Ads in a `local_services` block. */
  items?: unknown[] | null;
};

/** Paid placements: text ads plus Local Services Ads ("Google Guaranteed"), common for trades. */
export function countAds(items: SerpItem[]): number {
  return items.reduce((n, i) =>
    n + (i.type === "paid" ? 1 : i.type === "local_services" ? Math.max(1, i.items?.length ?? 0) : 0), 0);
}

export function parseSerp(keyword: string, location: string, cityName: string, items: SerpItem[]): SerpInfo {
  const organic = items.filter((i) => i.type === "organic" && i.domain).slice(0, 10);
  const city = cityName.toLowerCase();
  const citySlug = city.replace(/[^a-z0-9]+/g, "-");
  const mentionsCity = (i: SerpItem) =>
    `${i.title ?? ""} ${i.description ?? ""}`.toLowerCase().includes(city) ||
    (i.url ?? "").toLowerCase().includes(citySlug) ||
    (i.domain ?? "").toLowerCase().includes(citySlug.replace(/-/g, ""));
  const weak = organic.filter((i) => isWeakDomain(i.domain!));
  const strongLocal = organic.filter((i) => !isWeakDomain(i.domain!) && mentionsCity(i));
  const pack = items.filter((i) => i.type === "local_pack" || i.type === "map");
  const reviews = nums(pack.map((i) => i.rating?.votes_count));
  const localPackTopReviews = reviews.length ? Math.max(...reviews) : null;
  return {
    keyword,
    location,
    organicCount: organic.length,
    weakResults: weak.length,
    weakDomains: [...new Set(weak.map((i) => normalizeDomain(i.domain!)))],
    cityRelevant: strongLocal.length,
    localPack: pack.length > 0,
    localPackTopReviews,
    adsCount: countAds(items),
    topDomains: organic.map((i) => normalizeDomain(i.domain!)),
    difficulty: serpDifficulty({
      organicCount: organic.length,
      weakResults: weak.length,
      cityRelevantStrong: strongLocal.length,
      localPackTopReviews,
    }),
  };
}

function nums(xs: (number | null | undefined)[]): number[] {
  return xs.filter((x): x is number => typeof x === "number");
}

export async function fetchSerp(keyword: string, location: string, cityName: string) {
  const { result, cost } = await post<{ items: SerpItem[] | null }>("/serp/google/organic/live/advanced", {
    keyword, location_name: location, language_code: "en", depth: 10,
  });
  return { serp: parseSerp(keyword, location, cityName, result[0]?.items ?? []), cost };
}

/** "stair lift installer" + Austin → "stair lift installer austin" (the phrase people search). */
export function cityKeyword(keyword: string, cityName: string): string {
  return cleanKeyword(`${keyword} ${cityName}`);
}

export const MAX_KD_KEYWORDS = 1000;

/** DataForSEO Labs keyword difficulty for city keywords (null when Labs has no data for a phrase). */
export async function fetchCityDifficulty(keywords: string[]) {
  const difficulty = new Map<string, number | null>();
  let cost = 0;
  for (let i = 0; i < keywords.length; i += MAX_KD_KEYWORDS) {
    const r = await post<DifficultyResult>("/dataforseo_labs/google/bulk_keyword_difficulty/live", {
      keywords: keywords.slice(i, i + MAX_KD_KEYWORDS), location_code: US_LOCATION_CODE, language_code: "en",
    });
    cost += r.cost;
    for (const [k, v] of parseDifficulty(r.result)) difficulty.set(k, v);
  }
  return { difficulty, cost };
}

// ---- Standard-queue SERP checks (~3x cheaper than live; results fetched later for free) ----

export const MAX_TASKS_PER_POST = 100;

export type QueuedTask = { cityId: string; taskId: string };

/** Queue one SERP task per city; `tag` carries the city id back. */
export async function postSerpTasks(keyword: string, cities: { id: string; location: string }[]) {
  const tasks: QueuedTask[] = [];
  const errors: Record<string, string> = {};
  let cost = 0;
  for (let i = 0; i < cities.length; i += MAX_TASKS_PER_POST) {
    const batch = cities.slice(i, i + MAX_TASKS_PER_POST);
    const json = await request<unknown>("POST", "/serp/google/organic/task_post", batch.map((c) => ({
      keyword, location_name: c.location, language_code: "en", depth: 10, tag: c.id,
    })));
    cost += json.cost ?? 0;
    const parsed = parseTaskPost(json.tasks ?? [], batch.map((c) => c.id));
    tasks.push(...parsed.tasks);
    Object.assign(errors, parsed.errors);
  }
  return { tasks, errors, cost };
}

/** 20100 = task created. Tasks come back in request order; `data.tag` confirms the city. */
export function parseTaskPost(apiTasks: ApiTask<unknown>[], cityIds: string[]) {
  const tasks: QueuedTask[] = [];
  const errors: Record<string, string> = {};
  apiTasks.forEach((t, i) => {
    const cityId = t.data?.tag ?? cityIds[i];
    if (t.status_code === 20100 && t.id) tasks.push({ cityId, taskId: t.id });
    else errors[cityId] = t.status_message || "Could not queue SERP check";
  });
  return { tasks, errors };
}

export type SerpTaskState =
  | { state: "done"; items: SerpItem[] }
  | { state: "pending" }
  | { state: "error"; message: string };

/** 20000 = ready; 40601 "Task Handed" / 40602 "Task in Queue" = still running. */
export function parseSerpTask(task: ApiTask<{ items: SerpItem[] | null }> | undefined): SerpTaskState {
  if (!task) return { state: "error", message: "Task not found" };
  if (task.status_code === 20000) return { state: "done", items: task.result?.[0]?.items ?? [] };
  if (task.status_code === 40601 || task.status_code === 40602) return { state: "pending" };
  return { state: "error", message: task.status_message };
}

/** Fetch a queued SERP task's result. Retrieving results is free. */
export async function getSerpTask(taskId: string): Promise<SerpTaskState> {
  try {
    const json = await request<{ items: SerpItem[] | null }>("GET", `/serp/google/organic/task_get/advanced/${encodeURIComponent(taskId)}`);
    return parseSerpTask(json.tasks?.[0]);
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "SERP task fetch failed" };
  }
}

// ---- City-level Google Ads data for "<keyword> <city>" phrases (flat ~$0.09 per 1,000 phrases) ----

/**
 * Google Ads CPC, bids, competition and volume for city phrases; phrases without ads data map to null.
 * With Labs, keyword difficulty for the same phrases comes back too (no separate KD request needed).
 */
export async function fetchCityAds(keywords: string[], source: AdsSource = "labs") {
  const ads = new Map<string, KeywordMetrics | null>();
  if (source === "labs") {
    const { metrics, difficulty, cost } = await fetchLabsOverview(keywords);
    for (const k of keywords) ads.set(k, hasAdsData(metrics.get(k)));
    return { ads, difficulty: new Map(keywords.map((k) => [k, difficulty.get(k) ?? null])), cost };
  }
  let cost = 0;
  for (let i = 0; i < keywords.length; i += MAX_KD_KEYWORDS) {
    const batch = keywords.slice(i, i + MAX_KD_KEYWORDS);
    const r = await post<SearchVolumeItem>("/keywords_data/google_ads/search_volume/live", {
      keywords: batch, location_code: US_LOCATION_CODE, language_code: "en",
    });
    cost += r.cost;
    const byKeyword = new Map(parseSearchVolume(r.result).map((m) => [m.keyword.toLowerCase(), m]));
    for (const k of batch) {
      const m = byKeyword.get(k) ?? null;
      ads.set(k, hasAdsData(m));
    }
  }
  return { ads, difficulty: null, cost };
}

// ---- Keyword Check: pasted keywords, Google Ads data targeted to one city ----

/** Google Ads accepts keywords up to 80 characters and 10 words. */
export function validAdsKeyword(k: string): boolean {
  return k.length >= 2 && k.length <= 80 && k.split(" ").length <= 10;
}

/**
 * Google Ads volume, CPC, bids and competition for the keywords as searched *inside* the city
 * (location-targeted). Flat ~$0.09 per request of up to 1,000 keywords. Missing = null.
 */
export async function fetchKeywordsInCity(keywords: string[], location: string) {
  const ads = new Map<string, KeywordMetrics | null>();
  let cost = 0;
  for (let i = 0; i < keywords.length; i += MAX_KD_KEYWORDS) {
    const batch = keywords.slice(i, i + MAX_KD_KEYWORDS);
    const r = await post<SearchVolumeItem>("/keywords_data/google_ads/search_volume/live", {
      keywords: batch, location_name: location, language_code: "en",
    });
    cost += r.cost;
    const byKeyword = new Map(parseSearchVolume(r.result).map((m) => [m.keyword.toLowerCase(), m]));
    for (const k of batch) {
      const m = byKeyword.get(k) ?? null;
      ads.set(k, m && (m.cpc != null || m.competitionIndex != null || m.searchVolume != null) ? m : null);
    }
  }
  return { ads, cost };
}
