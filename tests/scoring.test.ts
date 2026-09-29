import { describe, expect, it } from "vitest";
import { CITIES, STATE_CODES, dataForSeoLocationName, findCity, tierFor } from "@/lib/cities";
import { suggestVariants, coreTerm } from "@/lib/keywords";
import { mockNiche, mockSerp } from "@/lib/mock";
import { accuracyLabel, buildCityRow, buildSnapshot, estimateCityVolume, opportunityScore, organicLabel, refreshRow, serpDifficulty } from "@/lib/scoring";

describe("keywords", () => {
  it("derives variants from the niche", () => {
    expect(coreTerm("Stairway Installer")).toBe("stairway");
    expect(suggestVariants("stairway installer")).toEqual([
      "stairway installer", "stairway installation", "stairway contractor", "stairway company",
    ]);
  });
});

describe("cities", () => {
  it("has unique ids and thousands of cities sorted by population", () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(3500);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    expect(CITIES[0].name).toBe("New York");
    for (let i = 1; i < CITIES.length; i++) expect(CITIES[i - 1].population).toBeGreaterThanOrEqual(CITIES[i].population);
  });

  it("covers every state with at least 10 local markets (DC is one market)", () => {
    const counts = new Map<string, number>();
    CITIES.forEach((c) => counts.set(c.stateCode, (counts.get(c.stateCode) ?? 0) + 1));
    expect(STATE_CODES).toHaveLength(51);
    for (const s of STATE_CODES) {
      if (s === "DC") expect(counts.get(s)).toBe(1);
      else expect(counts.get(s)).toBeGreaterThanOrEqual(10);
    }
  });

  it("resolves well-known cities with Google-style names and market tiers", () => {
    expect(findCity("austin-tx")).toMatchObject({ state: "Texas", tier: "Major" });
    expect(findCity("st-louis-mo")).toBeDefined();
    expect(findCity("washington-dc")).toMatchObject({ name: "Washington" });
    expect(findCity("new-york-ny")).toBeDefined();
    expect(dataForSeoLocationName(findCity("austin-tx")!)).toBe("Austin,Texas,United States");
    expect(CITIES.every((c) => !/[(),]/.test(c.name))).toBe(true);
    expect(tierFor(60_000)).toBe("Mid");
    expect(tierFor(12_000)).toBe("Small");
  });
});

describe("scoring", () => {
  const base = { cpc: 15, competitionIndex: 70, organicDifficulty: 20, searchVolume: 100 };

  it("rises with CPC and ads competition, falls with organic difficulty", () => {
    const s = opportunityScore(base);
    expect(opportunityScore({ ...base, cpc: 30 })).toBeGreaterThan(s);
    expect(opportunityScore({ ...base, competitionIndex: 95 })).toBeGreaterThan(s);
    expect(opportunityScore({ ...base, organicDifficulty: 70 })).toBeLessThan(s);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(opportunityScore({ cpc: 1000, competitionIndex: 100, organicDifficulty: 0, searchVolume: 1e6 })).toBe(100);
  });

  it("serp difficulty grows with strong city-targeted results", () => {
    const easy = serpDifficulty({ organicCount: 10, weakResults: 8, cityRelevantStrong: 0, localPackTopReviews: 10 });
    const hard = serpDifficulty({ organicCount: 10, weakResults: 1, cityRelevantStrong: 8, localPackTopReviews: 500 });
    expect(organicLabel(easy)).toBe("Low");
    expect(organicLabel(hard)).toBe("High");
  });

  it("builds a city row with estimated volume when no local data", () => {
    const city = findCity("austin-tx")!;
    const { metrics } = mockNiche(["stair installer", "stair contractor"]);
    const snap = buildSnapshot("stair installer", metrics, 0);
    const { serp } = mockSerp("stair installer", "Austin,Texas,United States", city);
    const row = buildCityRow(city, snap, "stair installer", serp, null, "done");
    expect(row.volumeSource).toBe("Estimated");
    expect(row.searchVolume).toBe(estimateCityVolume(snap.nationalVolume, city.population));
    expect(row.cpcSource).toBe("National");
    expect(row.organicDifficulty).toBe(serp.difficulty);
    expect(row.adValue).toBeCloseTo(row.searchVolume * row.cpc, 1);
  });
});

describe("refreshRow (accurate check on saved rows)", () => {
  const city = findCity("austin-tx")!;
  const snap = buildSnapshot("stair installer", mockNiche(["stair installer"]).metrics, 0);
  const estimated = buildCityRow(city, snap, "stair installer", null, null, "skipped");

  it("starts as an estimate", () => {
    expect(accuracyLabel(estimated)).toBe("Estimated");
    expect(estimated.organicDifficulty).toBeNull();
  });

  it("applies a live SERP check", () => {
    const { serp } = mockSerp("stair installer", "Austin,Texas,United States", city);
    const r = refreshRow(estimated, { serp });
    expect(r.organicDifficulty).toBe(serp.difficulty);
    expect(r.weakResults).toBe(serp.weakResults);
    expect(r.status).toBe("done");
    expect(accuracyLabel(r)).toBe("SERP checked");
    expect(r.score).toBe(opportunityScore({ cpc: r.cpc, competitionIndex: r.competitionIndex, organicDifficulty: serp.difficulty, searchVolume: r.searchVolume }));
  });

  it("applies exact city demand, keeping national CPC when the city has none", () => {
    const { serp } = mockSerp("stair installer", "Austin,Texas,United States", city);
    const withSerp = refreshRow(estimated, { serp });
    const r = refreshRow(withSerp, {
      local: { searchVolume: 70, cpc: null, lowBid: 4, highBid: 20, competitionIndex: 90, trend: Array(12).fill(70), cost: 0 },
    });
    expect(r).toMatchObject({ searchVolume: 70, volumeSource: "Google Ads (city)", cpc: withSerp.cpc, cpcSource: withSerp.cpcSource, competition: "HIGH" });
    expect(r.adValue).toBeCloseTo(70 * withSerp.cpc, 2);
    expect(accuracyLabel(r)).toBe("Exact");
    const priced = refreshRow(withSerp, { local: { searchVolume: 70, cpc: 18.5, lowBid: null, highBid: null, competitionIndex: null, trend: [], cost: 0 } });
    expect(priced).toMatchObject({ cpc: 18.5, cpcSource: "City", lowBid: withSerp.lowBid });
  });
});
