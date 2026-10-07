import { describe, expect, it } from "vitest";
import { PRICES, cityAdsCost, nicheCost, organicCost } from "@/lib/api";
import { hasAdsData, parseLabsOverview, type LabsOverviewItem } from "@/lib/dataforseo";

// Shape of a real Labs Keyword Overview item ("plumber tampa", Sept 2026).
const items: LabsOverviewItem[] = [
  {
    keyword: "plumber tampa",
    keyword_info: {
      search_volume: 1600, cpc: 44.64, competition: 0.73, competition_level: "HIGH",
      low_top_of_page_bid: 36.25, high_top_of_page_bid: 120.52,
      monthly_searches: [
        { year: 2026, month: 8, search_volume: 1600 },
        { year: 2025, month: 9, search_volume: 1600 },
        { year: 2026, month: 3, search_volume: 1900 },
      ],
    },
    keyword_properties: { keyword_difficulty: 28 },
  },
  { keyword: "stair lift tampa", keyword_info: { search_volume: 10 }, keyword_properties: { keyword_difficulty: 22 } },
];

describe("DataForSEO Labs keyword overview", () => {
  it("maps to the Google Ads metric shape plus difficulty", () => {
    const { metrics, difficulty } = parseLabsOverview(items);
    expect(metrics.get("plumber tampa")).toMatchObject({
      searchVolume: 1600, cpc: 44.64, competition: "HIGH", competitionIndex: 73, lowBid: 36.25, highBid: 120.52,
      trend: [1600, 1900, 1600],
    });
    expect(difficulty.get("plumber tampa")).toBe(28);
    expect(metrics.get("stair lift tampa")).toMatchObject({ searchVolume: 10, cpc: null, competitionIndex: null });
    expect(hasAdsData(metrics.get("stair lift tampa"))).not.toBeNull();
    expect(hasAdsData(undefined)).toBeNull();
  });

  it("is much cheaper than live Google Ads for typical runs", () => {
    expect(nicheCost("labs", 10)).toBeCloseTo(0.011);
    expect(nicheCost("ads")).toBe(PRICES.niche);
    expect(cityAdsCost("labs", 300)).toBeCloseTo(0.04);
    expect(cityAdsCost("ads", 300)).toBe(0.09);
    // Labs includes difficulty, so the KD request isn't paid separately.
    expect(organicCost("kd", 300, "labs")).toBeLessThan(organicCost("kd", 300, "ads") / 2);
  });
});
