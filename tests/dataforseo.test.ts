import { describe, expect, it } from "vitest";
import { localKeywords, parseDifficulty, parseSearchVolume, parseSerp, type SearchVolumeItem, type SerpItem } from "@/lib/dataforseo";
import { buildSnapshot } from "@/lib/scoring";
import serpItems from "./fixtures/austin-serp.json";
import svItems from "./fixtures/us-search-volume.json";

describe("parseSearchVolume", () => {
  const metrics = parseSearchVolume(svItems as SearchVolumeItem[]);

  it("maps fields and orders the trend oldest -> newest", () => {
    const m = metrics[0];
    expect(m).toMatchObject({ keyword: "stair installer", searchVolume: 880, cpc: 15.97, competitionIndex: 73 });
    expect(m.trend).toHaveLength(12);
    expect(m.trend[0]).toBe(880); // 2025-09
    expect(m.trend[11]).toBe(480); // 2026-08
  });

  it("keeps keywords Google has no data for", () => {
    expect(metrics[4]).toMatchObject({ searchVolume: null, cpc: null, trend: [] });
  });

  it("snapshot does not double count Google's grouped variants", () => {
    const s = buildSnapshot("stair installer", metrics, 0);
    // installer & installation are one group (880), + contractor 2400 + company 480
    expect(s.nationalVolume).toBe(880 + 2400 + 480);
    expect(s.cpc).toBeCloseTo((15.97 * 880 + 8.01 * 2400 + 12.07 * 480) / 3760, 2);
    expect(s.competitionIndex).toBe(80);
    expect(s.lowBid).toBe(2.81);
    expect(s.highBid).toBe(31.01);
  });
});

describe("parseDifficulty", () => {
  it("reads keyword difficulty items, including nulls", () => {
    const map = parseDifficulty([
      { items: [{ keyword: "stair installer", keyword_difficulty: 8 }, { keyword: "stair installation austin", keyword_difficulty: null }] },
    ]);
    expect(map.get("stair installer")).toBe(8);
    expect(map.get("stair installation austin")).toBeNull();
  });
});

describe("parseSerp (real Austin SERP for 'stair installer')", () => {
  const serp = parseSerp("stair installer", "Austin,Texas,United States", "Austin", serpItems as SerpItem[]);

  it("counts weak results and city-targeted competitors", () => {
    expect(serp.organicCount).toBe(8);
    // ziprecruiter, facebook x2, lowes, indeed, houzz
    expect(serp.weakResults).toBe(6);
    expect(serp.cityRelevant).toBe(0);
    expect(serp.weakDomains).toContain("indeed.com");
  });

  it("reads the map pack", () => {
    expect(serp.localPack).toBe(true);
    expect(serp.localPackTopReviews).toBe(101);
    expect(serp.adsCount).toBe(0);
  });

  it("rates this SERP as easy", () => {
    expect(serp.difficulty).toBeLessThan(30);
  });
});

describe("localKeywords", () => {
  it("adds city-modified versions of each variant", () => {
    expect(localKeywords(["stair installer"], "St. Louis")).toEqual(["stair installer", "stair installer st louis"]);
  });
});
