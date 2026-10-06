import type { City } from "./cities";
import type {
  CityRow, Competition, KeywordMetrics, LocalDemand, NicheSnapshot, OrganicLabel, OrganicSource, SerpInfo, Verdict,
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

/** Score thresholds for the verdict quadrants. */
export const TARGET_ADS = 60;
export const TARGET_EASE = 60;

/**
 * Ads Score 0-100 — how valuable this market is to advertisers:
 *   50% CPC (log scale, $50 = max) · 30% Google Ads competition index · 20% paid ads seen on the live SERP (3+ = max).
 * Without a SERP check, the SERP weight is shared by CPC and competition.
 */
export function adsScore(input: { cpc: number; competitionIndex: number | null; adsCount: number | null }): number {
  const cpcPart = clamp01(Math.log1p(input.cpc) / Math.log1p(50));
  const compPart = clamp01((input.competitionIndex ?? 0) / 100);
  if (input.adsCount == null) return Math.round(100 * (0.625 * cpcPart + 0.375 * compPart));
  // The live SERP check found no ads in this city: Keyword Planner bidding alone isn't proof of an ads market.
  if (input.adsCount === 0) return Math.round(100 * 0.6 * (0.625 * cpcPart + 0.375 * compPart));
  return Math.round(100 * (0.5 * cpcPart + 0.3 * compPart + 0.2 * clamp01(input.adsCount / 3)));
}

/**
 * Organic Ease 0-100 = 100 − organic difficulty. Estimated (size-based) values are pulled halfway
 * toward 50 so a guess never looks like a sure win; unknown = 50.
 */
export function organicEase(difficulty: number | null, source: OrganicSource | null): number {
  if (difficulty == null) return 50;
  const ease = clamp01((100 - difficulty) / 100) * 100;
  return Math.round(source === "Estimated" ? 50 + (ease - 50) * 0.5 : ease);
}

/** Opportunity 0-100 — ranks on the two goals: 45% Ads Score + 45% Organic Ease + 10% volume (log, 1k = max). */
export function opportunityScore(input: { adsScore: number; organicEase: number; searchVolume: number }): number {
  const volPart = clamp01(Math.log10(input.searchVolume + 1) / Math.log10(1001));
  return Math.round(0.45 * input.adsScore + 0.45 * input.organicEase + 10 * volPart);
}

export function verdictFor(ads: number, ease: number, source: OrganicSource | null): Verdict {
  const highAds = ads >= TARGET_ADS;
  const easy = ease >= TARGET_EASE;
  if (highAds && easy) return source === "Live SERP" || source === "City KD" ? "Target" : "Target?";
  if (highAds) return "Ads only";
  if (easy) return "Easy, low value";
  return "Skip";
}

/** (Re)compute Ads Score, Organic Ease, Opportunity and Verdict from a row's data (also upgrades old saved rows). */
export function withScores(row: CityRow): CityRow {
  const source = organicSourceOf(row);
  const ads = adsScore({ cpc: row.cpc, competitionIndex: row.competitionIndex, adsCount: row.adsCount });
  const ease = organicEase(row.organicDifficulty, source);
  return {
    ...row,
    adsScore: ads,
    organicEase: ease,
    verdict: verdictFor(ads, ease, source),
    score: opportunityScore({ adsScore: ads, organicEase: ease, searchVolume: row.searchVolume }),
  };
}

/**
 * Organic difficulty estimate used before a live SERP check (free, from data we already have):
 * 10 + half the niche's national keyword difficulty + up to 35 for market size
 * (log scale: 10k people ≈ 0, 8M ≈ 35). Bigger metros have more established local competitors.
 */
export function estimateOrganicDifficulty(nicheDifficulty: number | null, population: number): number {
  const size = clamp01(Math.log10(Math.max(population, 10_000) / 10_000) / Math.log10(800));
  return Math.round(Math.min(100, 10 + 0.5 * (nicheDifficulty ?? 20) + 35 * size));
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
  /** DataForSEO Labs keyword difficulty for "<keyword> <city>" (null = no data). */
  cityKd: number | null = null,
  /** Google Ads data for "<keyword> <city>" (null = no ads data). */
  cityAds: KeywordMetrics | null = null,
): CityRow {
  // Ads data precedence: exact city-targeted (local) > "<keyword> <city>" phrase (cityAds) > national.
  const estimated = estimateCityVolume(snapshot.nationalVolume, city.population);
  const geoVolume = cityAds?.searchVolume ?? 0;
  const searchVolume = local ? local.searchVolume : Math.max(estimated, geoVolume);
  const volumeSource: CityRow["volumeSource"] = local ? "Google Ads (city)" : geoVolume > estimated ? "City keyword" : "Estimated";
  const cpcRaw = local?.cpc ?? cityAds?.cpc ?? null;
  const cpcSource: CityRow["cpcSource"] = local?.cpc != null ? "City" : cityAds?.cpc != null ? "City keyword" : "National";
  const cpc = round2(cpcRaw ?? snapshot.cpc);
  const competitionIndex = local?.competitionIndex ?? cityAds?.competitionIndex ?? snapshot.competitionIndex;
  const scale = snapshot.nationalVolume ? searchVolume / snapshot.nationalVolume : 0;
  const trend =
    local && local.trend.length ? local.trend
      : volumeSource === "City keyword" && cityAds?.trend.length ? cityAds.trend
        : snapshot.trend.map((v) => Math.round(v * scale));
  const organicSource: OrganicSource = serp ? "Live SERP" : cityKd != null ? "City KD" : "Estimated";
  const organicDifficulty = serp
    ? serp.difficulty
    : cityKd ?? estimateOrganicDifficulty(snapshot.difficulty, city.population);
  return withScores({
    id: city.id,
    city: city.name,
    state: city.state,
    stateCode: city.stateCode,
    population: city.population,
    tier: city.tier,
    keyword,
    searchVolume,
    volumeSource,
    cpc,
    cpcSource,
    lowBid: local?.lowBid ?? cityAds?.lowBid ?? snapshot.lowBid,
    highBid: local?.highBid ?? cityAds?.highBid ?? snapshot.highBid,
    competition: competitionFromIndex(competitionIndex),
    competitionIndex,
    nicheDifficulty: snapshot.difficulty,
    organicDifficulty,
    organicSource,
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
    score: 0,
    status,
  });
}

/**
 * Updates a saved row with fresh DataForSEO data (live SERP and/or exact city demand)
 * and recomputes everything derived from it. Values missing from the new data keep
 * their previous (national) fallback.
 */
export function refreshRow(
  row: CityRow,
  update: { serp?: SerpInfo | null; local?: LocalDemand | null; cityKd?: number | null; cityAds?: KeywordMetrics | null },
): CityRow {
  const next: CityRow = { ...row, organicSource: organicSourceOf(row) ?? undefined };
  delete next.organicEstimated;
  const { serp, local, cityKd, cityAds } = update;
  // "<keyword> <city>" ads data upgrades national values, never exact city-targeted ones.
  if (cityAds && row.cpcSource !== "City") {
    if (cityAds.cpc != null) {
      next.cpc = round2(cityAds.cpc);
      next.cpcSource = "City keyword";
    }
    if (cityAds.competitionIndex != null) next.competitionIndex = cityAds.competitionIndex;
    next.competition = competitionFromIndex(next.competitionIndex);
    next.lowBid = cityAds.lowBid ?? next.lowBid;
    next.highBid = cityAds.highBid ?? next.highBid;
    if (row.volumeSource !== "Google Ads (city)" && (cityAds.searchVolume ?? 0) > next.searchVolume) {
      next.searchVolume = cityAds.searchVolume!;
      next.volumeSource = "City keyword";
      if (cityAds.trend.length) next.trend = cityAds.trend;
      next.yoy = yoy(next.trend);
    }
  }
  // City KD replaces an estimate, never a live SERP result.
  if (cityKd != null && !serp && next.organicSource !== "Live SERP") {
    next.organicDifficulty = cityKd;
    next.organicSource = "City KD";
    next.organic = organicLabel(cityKd);
  }
  if (serp) {
    Object.assign(next, {
      organicDifficulty: serp.difficulty,
      organicSource: "Live SERP",
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
  return withScores(next);
}

/** Organic source of a row, including rows saved before `organicSource` existed. */
export function organicSourceOf(row: CityRow): OrganicSource | null {
  if (row.organicDifficulty == null) return null;
  if (row.organicSource) return row.organicSource;
  return row.organicEstimated ? "Estimated" : "Live SERP";
}

/** How much of a row comes from exact DataForSEO data vs. estimates. */
export function accuracyLabel(row: CityRow): "Exact" | "SERP checked" | "KD checked" | "Estimated" {
  const source = organicSourceOf(row);
  if (source === "Live SERP") return row.volumeSource === "Google Ads (city)" ? "Exact" : "SERP checked";
  if (source === "City KD") return "KD checked";
  return "Estimated";
}

/**
 * Keyword Check row: one pasted keyword in one city. Ads data is Google Ads targeted to the city;
 * organic difficulty comes from the live SERP when checked, otherwise the keyword's KD.
 * No ads data means CPC 0 / no competition, so the Ads Score honestly shows "no ads market".
 */
export function buildKeywordRow(
  city: City,
  keyword: string,
  ads: KeywordMetrics | null,
  kd: number | null,
  serp: SerpInfo | null,
  status: CityRow["status"],
): CityRow {
  const searchVolume = ads?.searchVolume ?? 0;
  const cpc = round2(ads?.cpc ?? 0);
  const competitionIndex = ads?.competitionIndex ?? null;
  const organicSource: OrganicSource | undefined = serp ? "Live SERP" : kd != null ? "City KD" : undefined;
  const organicDifficulty = serp ? serp.difficulty : kd;
  const trend = ads?.trend ?? [];
  return withScores({
    id: keyword,
    city: city.name,
    state: city.state,
    stateCode: city.stateCode,
    population: city.population,
    tier: city.tier,
    keyword,
    searchVolume,
    volumeSource: ads ? "Google Ads (city)" : "Estimated",
    cpc,
    cpcSource: ads?.cpc != null ? "City" : "National",
    lowBid: ads?.lowBid ?? null,
    highBid: ads?.highBid ?? null,
    competition: competitionFromIndex(competitionIndex),
    competitionIndex,
    nicheDifficulty: kd,
    organicDifficulty,
    organicSource,
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
    score: 0,
    status,
  });
}
