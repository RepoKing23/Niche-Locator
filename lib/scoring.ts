import type { City } from "./cities";
import type {
  CityRow, Competition, KeywordMetrics, LocalDemand, NicheSnapshot, OrganicLabel, SerpInfo,
} from "./types";

const US_POPULATION = 331_000_000;
/** City-proper population understates the metro that searches for the city's services. */
const METRO_FACTOR = 2;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function organicLabel(difficulty: number | null): OrganicLabel {
  if (difficulty == null) return "Unknown";
  if (difficulty < 30) return "Low";
  if (difficulty < 60) return "Medium";
  return "High";
}

export function competitionFromIndex(index: number | null): Competition | null {
  if (index == null) return null;
  if (index >= 67) return "HIGH";
  if (index >= 34) return "MEDIUM";
  return "LOW";
}

/**
 * Organic difficulty 0-100 from the live top 10.
 * Strong results = not weak (directory/job board/social/big-box). Strong results that
 * mention the city are dedicated local competitors and weigh the most; an established
 * map pack (lots of reviews) adds a little.
 */
export function serpDifficulty(input: {
  organicCount: number;
  weakResults: number;
  cityRelevantStrong: number;
  localPackTopReviews: number | null;
}): number {
  const strong = Math.max(0, input.organicCount - input.weakResults);
  const otherStrong = Math.max(0, strong - input.cityRelevantStrong);
  const reviews = input.localPackTopReviews ?? 0;
  const packPart = reviews > 300 ? 15 : reviews > 100 ? 10 : reviews > 30 ? 5 : 0;
  return Math.round(Math.min(100, 10 + input.cityRelevantStrong * 9 + otherStrong * 3 + packPart));
}

export function yoy(trend: number[]): number | null {
  if (trend.length < 12) return null;
  const first = trend[0];
  const last = trend[trend.length - 1];
  if (!first) return null;
  return Math.round(((last - first) / first) * 100);
}

function sumTrends(trends: number[][]): number[] {
  const len = Math.max(0, ...trends.map((t) => t.length));
  return Array.from({ length: len }, (_, i) =>
    trends.reduce((s, t) => s + (t[t.length - len + i] ?? 0), 0),
  );
}

/** Volume-weighted CPC; falls back to the max CPC when there is no volume. */
function weightedCpc(items: { searchVolume: number | null; cpc: number | null }[]): number | null {
  const priced = items.filter((i) => i.cpc != null);
  if (!priced.length) return null;
  const vol = priced.reduce((s, i) => s + (i.searchVolume ?? 0), 0);
  if (vol === 0) return Math.max(...priced.map((i) => i.cpc!));
  return round2(priced.reduce((s, i) => s + i.cpc! * (i.searchVolume ?? 0), 0) / vol);
}

const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null);

/**
 * Google Ads reports one combined figure for close variants ("stair installer" and
 * "stair installation" come back identical), so drop exact duplicates before summing.
 */
export function dedupeGrouped(items: KeywordMetrics[]): KeywordMetrics[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.searchVolume || !i.trend.length) return true;
    const sig = `${i.searchVolume}|${i.cpc}|${i.competitionIndex}|${i.trend.join(",")}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/** Combine per-variant metrics into totals (used for national snapshot and city demand). */
export function combineMetrics(all: KeywordMetrics[]) {
  const items = dedupeGrouped(all);
  const lows = nums(items.map((i) => i.lowBid));
  const highs = nums(items.map((i) => i.highBid));
  const idx = nums(items.map((i) => i.competitionIndex));
  const kd = nums(items.map((i) => i.difficulty));
  return {
    searchVolume: items.reduce((s, i) => s + (i.searchVolume ?? 0), 0),
    cpc: weightedCpc(items),
    lowBid: lows.length ? Math.min(...lows) : null,
    highBid: highs.length ? Math.max(...highs) : null,
    competitionIndex: idx.length ? Math.max(...idx) : null,
    difficulty: kd.length ? Math.min(...kd) : null,
    trend: sumTrends(items.map((i) => i.trend)),
  };
}

export function buildSnapshot(niche: string, variants: KeywordMetrics[], cost: number): NicheSnapshot {
  const c = combineMetrics(variants);
  return {
    niche,
    variants,
    cpc: c.cpc ?? 0,
    lowBid: c.lowBid,
    highBid: c.highBid,
    competitionIndex: c.competitionIndex,
    competition: competitionFromIndex(c.competitionIndex),
    nationalVolume: c.searchVolume,
    difficulty: c.difficulty,
    trend: c.trend,
    cost,
  };
}

/**
 * Opportunity score 0-100 — high when advertisers pay a lot and organic results are weak.
 *   30% CPC (log scale, $50 = max) · 20% ads competition · 35% organic ease · 15% local volume (log, 1k = max)
 */
export function opportunityScore(input: {
  cpc: number;
  competitionIndex: number | null;
  organicDifficulty: number | null;
  searchVolume: number;
}): number {
  const cpcPart = clamp01(Math.log1p(input.cpc) / Math.log1p(50));
  const adsPart = clamp01((input.competitionIndex ?? 0) / 100);
  const easePart = clamp01((100 - (input.organicDifficulty ?? 50)) / 100);
  const volPart = clamp01(Math.log10(input.searchVolume + 1) / Math.log10(1001));
  return Math.round(30 * cpcPart + 20 * adsPart + 35 * easePart + 15 * volPart);
}

export function estimateCityVolume(nationalVolume: number, population: number): number {
  return Math.round((nationalVolume * population * METRO_FACTOR) / US_POPULATION);
}

export function buildCityRow(
  city: City,
  snapshot: NicheSnapshot,
  keyword: string,
  serp: SerpInfo | null,
  local: LocalDemand | null,
  status: CityRow["status"],
): CityRow {
  const searchVolume = local ? local.searchVolume : estimateCityVolume(snapshot.nationalVolume, city.population);
  const cityCpc = local?.cpc ?? null;
  const cpc = round2(cityCpc ?? snapshot.cpc);
  const competitionIndex = local?.competitionIndex ?? snapshot.competitionIndex;
  const scale = snapshot.nationalVolume ? searchVolume / snapshot.nationalVolume : 0;
  const trend =
    local && local.trend.length ? local.trend : snapshot.trend.map((v) => Math.round(v * scale));
  const organicDifficulty = serp ? serp.difficulty : null;
  return {
    id: city.id,
    city: city.name,
    state: city.state,
    stateCode: city.stateCode,
    population: city.population,
    tier: city.tier,
    keyword,
    searchVolume,
    volumeSource: local ? "Google Ads (city)" : "Estimated",
    cpc,
    cpcSource: cityCpc != null ? "City" : "National",
    lowBid: local?.lowBid ?? snapshot.lowBid,
    highBid: local?.highBid ?? snapshot.highBid,
    competition: competitionFromIndex(competitionIndex),
    competitionIndex,
    nicheDifficulty: snapshot.difficulty,
    organicDifficulty,
    organic: organicLabel(organicDifficulty),
    weakResults: serp?.weakResults ?? null,
    cityRelevant: serp?.cityRelevant ?? null,
    localPack: serp?.localPack ?? null,
    localPackTopReviews: serp?.localPackTopReviews ?? null,
    adsCount: serp?.adsCount ?? null,
    topDomains: serp?.topDomains ?? [],
    adValue: round2(searchVolume * cpc),
    trend,
    yoy: yoy(trend),
    score: opportunityScore({ cpc, competitionIndex, organicDifficulty, searchVolume }),
    status,
  };
}

/**
 * Updates a saved row with fresh DataForSEO data (live SERP and/or exact city demand)
 * and recomputes everything derived from it. Values missing from the new data keep
 * their previous (national) fallback.
 */
export function refreshRow(row: CityRow, update: { serp?: SerpInfo | null; local?: LocalDemand | null }): CityRow {
  const next: CityRow = { ...row };
  const { serp, local } = update;
  if (serp) {
    Object.assign(next, {
      organicDifficulty: serp.difficulty,
      organic: organicLabel(serp.difficulty),
      weakResults: serp.weakResults,
      cityRelevant: serp.cityRelevant,
      localPack: serp.localPack,
      localPackTopReviews: serp.localPackTopReviews,
      adsCount: serp.adsCount,
      topDomains: serp.topDomains,
      status: "done",
    } satisfies Partial<CityRow>);
  }
  if (local) {
    next.searchVolume = local.searchVolume;
    next.volumeSource = "Google Ads (city)";
    if (local.cpc != null) {
      next.cpc = round2(local.cpc);
      next.cpcSource = "City";
    }
    next.lowBid = local.lowBid ?? row.lowBid;
    next.highBid = local.highBid ?? row.highBid;
    next.competitionIndex = local.competitionIndex ?? row.competitionIndex;
    next.competition = competitionFromIndex(next.competitionIndex);
    if (local.trend.length) next.trend = local.trend;
    next.yoy = yoy(next.trend);
  }
  next.adValue = round2(next.searchVolume * next.cpc);
  next.score = opportunityScore({
    cpc: next.cpc,
    competitionIndex: next.competitionIndex,
    organicDifficulty: next.organicDifficulty,
    searchVolume: next.searchVolume,
  });
  return next;
}

/** How much of a row comes from exact DataForSEO data vs. estimates. */
export function accuracyLabel(row: CityRow): "Exact" | "SERP checked" | "Estimated" {
  if (row.volumeSource === "Google Ads (city)" && row.organicDifficulty != null) return "Exact";
  if (row.organicDifficulty != null) return "SERP checked";
  return "Estimated";
}
