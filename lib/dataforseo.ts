import { isWeakDomain, normalizeDomain } from "./directories";
import { cleanKeyword } from "./keywords";
import { serpDifficulty } from "./scoring";
import type { Competition, KeywordMetrics, SerpInfo } from "./types";

const API = "https://api.dataforseo.com/v3";
export const US_LOCATION_CODE = 2840;

/** Approximate DataForSEO prices (USD) for cost estimates shown in the UI. */
export const PRICES = {
  googleAdsRequest: 0.09,
  difficultyRequest: 0.0125,
  serpRequest: 0.002,
};

/** Google Ads live endpoints allow 12 requests/minute per account. */
export const GOOGLE_ADS_MIN_INTERVAL_MS = 5200;

export function hasCredentials(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

type ApiTask<T> = { status_code: number; status_message: string; cost?: number; result: T[] | null };
type ApiResponse<T> = { status_code: number; status_message: string; cost?: number; tasks?: ApiTask<T>[] };

/** Errors that retrying won't fix (bad credentials, no balance, invalid task). */
export class DataForSeoError extends Error {}

async function post<T>(path: string, task: Record<string, unknown>): Promise<{ result: T[]; cost: number }> {
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString("base64");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify([task]),
        cache: "no-store",
      });
      if (res.status === 401) throw new DataForSeoError("DataForSEO rejected the login/password.");
      if (res.status === 402) throw new DataForSeoError("DataForSEO account balance is too low.");
      if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse<T>;
      if (json.status_code !== 20000) throw new DataForSeoError(`DataForSEO: ${json.status_message}`);
      const t = json.tasks?.[0];
      if (!t) throw new DataForSeoError("DataForSEO returned no task.");
      // 40202 = rate limit exceeded; worth retrying after a pause.
      if (t.status_code === 40202) throw new Error(t.status_message);
      if (t.status_code !== 20000) throw new DataForSeoError(`DataForSEO: ${t.status_message}`);
      return { result: t.result ?? [], cost: json.cost ?? t.cost ?? 0 };
    } catch (err) {
      lastError = err;
      if (err instanceof DataForSeoError) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastError;
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

/** National Google Ads metrics + Labs keyword difficulty for the niche variants. */
export async function fetchNiche(variants: string[]) {
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
};

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
    adsCount: items.filter((i) => i.type === "paid").length,
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
