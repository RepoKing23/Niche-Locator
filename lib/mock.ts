import type { City } from "./cities";
import { localKeywords, parseSerp, type SerpItem } from "./dataforseo";
import { WEAK_DOMAINS } from "./directories";
import type { Competition, KeywordMetrics } from "./types";

/** Deterministic pseudo-random 0..1 from a string (FNV-1a). */
function rand(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function fakeMetrics(keyword: string, baseVolume: number, baseCpc: number): KeywordMetrics {
  const r = rand(keyword);
  const searchVolume = r < 0.15 ? null : Math.max(10, Math.round((baseVolume * (0.3 + r * 1.4)) / 10) * 10);
  const competitionIndex = Math.round(20 + rand(`${keyword}c`) * 80);
  const competition: Competition = competitionIndex >= 67 ? "HIGH" : competitionIndex >= 34 ? "MEDIUM" : "LOW";
  const cpc = Math.round(baseCpc * (0.6 + rand(`${keyword}p`) * 0.9) * 100) / 100;
  const season = rand(`${keyword}s`) * 0.4;
  return {
    keyword,
    searchVolume,
    cpc: searchVolume == null ? null : cpc,
    lowBid: Math.round(cpc * 0.3 * 100) / 100,
    highBid: Math.round(cpc * 1.6 * 100) / 100,
    competition,
    competitionIndex,
    trend: Array.from({ length: 12 }, (_, m) =>
      Math.round((searchVolume ?? 0) * (1 + season * Math.sin((m / 12) * Math.PI * 2))),
    ),
  };
}

/** Fake national snapshot so the whole app works before DataForSEO credentials are added. */
export function mockNiche(variants: string[]) {
  const metrics = variants.map((v) => ({
    ...fakeMetrics(v, 400 + rand(`${v}n`) * 3000, 4 + rand(v.split(" ")[0]) * 22),
    difficulty: Math.round(rand(`${v}k`) * 45),
  }));
  return { metrics, cost: 0 };
}

export function mockLocal(variants: string[], city: City) {
  const metrics = localKeywords(variants, city.name).map((k) =>
    fakeMetrics(k, (city.population / 1_000_000) * 40, 4 + rand(k.split(" ")[0]) * 22),
  );
  return { metrics, cost: 0 };
}

export function mockSerp(keyword: string, location: string, city: City) {
  const weakCount = Math.floor(rand(`${keyword}${city.id}w`) * 8);
  const localCount = Math.floor(rand(`${keyword}${city.id}l`) * (10 - weakCount));
  const slug = city.name.toLowerCase().replace(/[^a-z]/g, "");
  const weak = [...WEAK_DOMAINS].sort((a, b) => rand(city.id + a) - rand(city.id + b)).slice(0, weakCount);
  const items: SerpItem[] = [
    ...Array.from({ length: 3 }, (_, i) => ({
      type: "local_pack",
      domain: `${slug}-pro-${i}.com`,
      rating: { votes_count: Math.round(rand(`${city.id}r${i}`) * 250) },
    })),
    ...weak.map((d) => ({ type: "organic", domain: d, title: `${keyword} - ${d}` })),
    ...Array.from({ length: localCount }, (_, i) => ({
      type: "organic",
      domain: `${slug}${keyword.split(" ")[0]}${i}.com`,
      title: `${keyword} in ${city.name}, ${city.stateCode}`,
    })),
    ...Array.from({ length: 10 - weakCount - localCount }, (_, i) => ({
      type: "organic",
      domain: `national-${keyword.split(" ")[0]}-${i}.com`,
      title: `Best ${keyword} guide`,
    })),
    ...Array.from({ length: Math.floor(rand(`${city.id}ads`) * 4) }, () => ({ type: "paid", domain: "ad.com" })),
  ];
  return { serp: parseSerp(keyword, location, city.name, items), cost: 0 };
}
