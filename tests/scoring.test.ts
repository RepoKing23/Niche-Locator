import { describe, expect, it } from "vitest";
import { CITIES, STATE_CODES, dataForSeoLocationName, findCity, tierFor } from "@/lib/cities";
import { suggestVariants, coreTerm } from "@/lib/keywords";
import { mockNiche, mockSerp } from "@/lib/mock";
import { TARGET_ADS, adsScore, organicEase, verdictFor, withScores, accuracyLabel, organicSourceOf, buildCityRow, buildSnapshot, estimateCityVolume, estimateOrganicDifficulty, opportunityScore, organicLabel, refreshRow, serpDifficulty } from "@/lib/scoring";

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

describe("scoring: high Google Ads + low organic competition first", () => {
  const score = (cpc: number, idx: number, difficulty: number, volume = 100, adsCount: number | null = null) =>
    opportunityScore({
      adsScore: adsScore({ cpc, competitionIndex: idx, adsCount }),
      organicEase: organicEase(difficulty, "City KD"),
      searchVolume: volume,
    });

  it("Ads Score rises with CPC, competition and ads seen on the SERP", () => {
    const base = adsScore({ cpc: 15, competitionIndex: 60, adsCount: null });
    expect(adsScore({ cpc: 40, competitionIndex: 60, adsCount: null })).toBeGreaterThan(base);
    expect(adsScore({ cpc: 15, competitionIndex: 95, adsCount: null })).toBeGreaterThan(base);
    expect(adsScore({ cpc: 15, competitionIndex: 60, adsCount: 4 })).toBeGreaterThan(adsScore({ cpc: 15, competitionIndex: 60, adsCount: 0 }));
    expect(adsScore({ cpc: 1000, competitionIndex: 100, adsCount: 5 })).toBe(100);
    // Real "plumber tampa" ($44.64, index 73) is high-ads; "plumber new york" ($13.49, index 41) is not.
    expect(adsScore({ cpc: 44.64, competitionIndex: 73, adsCount: null })).toBeGreaterThanOrEqual(TARGET_ADS);
    expect(adsScore({ cpc: 13.49, competitionIndex: 41, adsCount: null })).toBeLessThan(TARGET_ADS);
  });

  it("ranks expensive-ads + easy-organic above every other combination", () => {
    const target = score(40, 80, 15);
    expect(target).toBeGreaterThan(score(3, 20, 15)); // cheap ads, easy organic
    expect(target).toBeGreaterThan(score(40, 80, 75)); // expensive ads, hard organic
    expect(target).toBeGreaterThan(score(3, 20, 75)); // neither
    // Volume only nudges: a big but hard/cheap market doesn't beat a small target.
    expect(target).toBeGreaterThan(score(3, 20, 75, 100_000));
  });

  it("discounts estimated organic difficulty toward neutral", () => {
    expect(organicEase(10, "City KD")).toBe(90);
    expect(organicEase(10, "Estimated")).toBe(70);
    expect(organicEase(90, "Estimated")).toBe(30);
    expect(organicEase(null, null)).toBe(50);
  });

  it("verdict quadrants", () => {
    expect(verdictFor(80, 80, "Live SERP")).toBe("Target");
    expect(verdictFor(80, 80, "City KD")).toBe("Target");
    expect(verdictFor(80, 65, "Estimated")).toBe("Target?");
    expect(verdictFor(80, 30, "Live SERP")).toBe("Ads only");
    expect(verdictFor(30, 80, "Live SERP")).toBe("Easy, low value");
    expect(verdictFor(30, 30, "Live SERP")).toBe("Skip");
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

  it("starts as an estimate, with an estimated organic difficulty", () => {
    expect(accuracyLabel(estimated)).toBe("Estimated");
    expect(estimated.organicSource).toBe("Estimated");
    expect(estimated.organicDifficulty).toBe(estimateOrganicDifficulty(snap.difficulty, city.population));
    expect(estimated.organic).not.toBe("Unknown");
  });

  it("estimates bigger metros as harder than small towns", () => {
    const small = estimateOrganicDifficulty(10, 15_000);
    const big = estimateOrganicDifficulty(10, 2_000_000);
    expect(small).toBeLessThan(big);
    expect(organicLabel(small)).toBe("Low");
    expect(estimateOrganicDifficulty(null, 8_000_000)).toBeLessThanOrEqual(100);
  });

  it("applies a live SERP check", () => {
    const { serp } = mockSerp("stair installer", "Austin,Texas,United States", city);
    const r = refreshRow(estimated, { serp });
    expect(r.organicDifficulty).toBe(serp.difficulty);
    expect(r.weakResults).toBe(serp.weakResults);
    expect(r.status).toBe("done");
    expect(accuracyLabel(r)).toBe("SERP checked");
    const ads = adsScore({ cpc: r.cpc, competitionIndex: r.competitionIndex, adsCount: serp.adsCount });
    expect(r.adsScore).toBe(ads);
    expect(r.organicEase).toBe(organicEase(serp.difficulty, "Live SERP"));
    expect(r.score).toBe(opportunityScore({ adsScore: ads, organicEase: r.organicEase!, searchVolume: r.searchVolume }));
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

describe("organic source precedence (SERP > city KD > estimate)", () => {
  const city = findCity("tampa-fl")!;
  const snap = buildSnapshot("stair lift installer", mockNiche(["stair lift installer"]).metrics, 0);
  const { serp } = mockSerp("stair lift installer", "Tampa,Florida,United States", city);

  it("uses city KD when there is no SERP result", () => {
    const r = buildCityRow(city, snap, "stair lift installer", null, null, "skipped", 22);
    expect(r).toMatchObject({ organicDifficulty: 22, organicSource: "City KD", organic: "Low" });
    expect(accuracyLabel(r)).toBe("KD checked");
  });

  it("falls back to the estimate when KD is null", () => {
    const r = buildCityRow(city, snap, "stair lift installer", null, null, "skipped", null);
    expect(r.organicSource).toBe("Estimated");
  });

  it("prefers the live SERP over KD", () => {
    const r = buildCityRow(city, snap, "stair lift installer", serp, null, "done", 5);
    expect(r).toMatchObject({ organicDifficulty: serp.difficulty, organicSource: "Live SERP" });
  });

  it("refreshRow: KD upgrades an estimate but never replaces a SERP result", () => {
    const est = buildCityRow(city, snap, "stair lift installer", null, null, "skipped");
    expect(refreshRow(est, { cityKd: 12 })).toMatchObject({ organicDifficulty: 12, organicSource: "City KD" });
    const withSerp = refreshRow(est, { serp });
    expect(refreshRow(withSerp, { cityKd: 3 })).toMatchObject({ organicDifficulty: serp.difficulty, organicSource: "Live SERP" });
    expect(refreshRow(est, { cityKd: null }).organicSource).toBe("Estimated");
  });

  it("reads rows saved before organicSource existed", () => {
    const base = buildCityRow(city, snap, "stair lift installer", serp, null, "done");
    const legacyLive = { ...base, organicSource: undefined, organicEstimated: false };
    const legacyEst = { ...base, organicSource: undefined, organicEstimated: true };
    expect(organicSourceOf(legacyLive)).toBe("Live SERP");
    expect(organicSourceOf(legacyEst)).toBe("Estimated");
    expect(refreshRow(legacyEst, {}).organicEstimated).toBeUndefined();
  });
});

describe("city-level Google Ads data", () => {
  const city = findCity("tampa-fl")!;
  const snap = buildSnapshot("plumber", mockNiche(["plumber"]).metrics, 0);
  // Real response for "plumber tampa".
  const tampa = {
    keyword: "plumber tampa", searchVolume: 1600, cpc: 44.64, lowBid: 36.25, highBid: 120.52,
    competition: "HIGH" as const, competitionIndex: 73, trend: Array(12).fill(1600),
  };

  it("replaces national CPC, bids and competition with the city phrase's values", () => {
    const national = buildCityRow(city, snap, "plumber", null, null, "skipped", 28, null);
    const r = buildCityRow(city, snap, "plumber", null, null, "skipped", 28, tampa);
    expect(national.cpcSource).toBe("National");
    expect(r).toMatchObject({ cpc: 44.64, cpcSource: "City keyword", lowBid: 36.25, highBid: 120.52, competitionIndex: 73 });
    expect(r.searchVolume).toBeGreaterThanOrEqual(1600);
    expect(r.volumeSource).toBe("City keyword");
    expect(r.verdict).toBe("Target"); // $44.64 CPC + KD 28 = high ads, low organic
  });

  it("exact city-targeted demand still wins over the city phrase", () => {
    const local = { searchVolume: 3000, cpc: 50, lowBid: 20, highBid: 150, competitionIndex: 90, trend: [], cost: 0 };
    const r = buildCityRow(city, snap, "plumber", null, local, "skipped", 28, tampa);
    expect(r).toMatchObject({ cpc: 50, cpcSource: "City", competitionIndex: 90, searchVolume: 3000, volumeSource: "Google Ads (city)" });
  });

  it("refreshRow applies city ads to national rows but never overrides exact city data", () => {
    const national = buildCityRow(city, snap, "plumber", null, null, "skipped", 28, null);
    expect(refreshRow(national, { cityAds: tampa })).toMatchObject({ cpc: 44.64, cpcSource: "City keyword" });
    const exact = refreshRow(national, { local: { searchVolume: 3000, cpc: 50, lowBid: null, highBid: null, competitionIndex: 90, trend: [], cost: 0 } });
    expect(refreshRow(exact, { cityAds: tampa })).toMatchObject({ cpc: 50, cpcSource: "City" });
  });

  it("withScores upgrades rows saved before scores existed", () => {
    const r = buildCityRow(city, snap, "plumber", null, null, "skipped", 28, tampa);
    const legacy = { ...r, adsScore: undefined, organicEase: undefined, verdict: undefined };
    expect(withScores(legacy)).toMatchObject({ adsScore: r.adsScore, organicEase: r.organicEase, verdict: r.verdict, score: r.score });
  });
});
