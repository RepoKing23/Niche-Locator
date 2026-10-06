import { describe, expect, it } from "vitest";
import { countAds, parseSerp, type SerpItem } from "@/lib/dataforseo";
import { TARGET_ADS, adsScore, verdictFor } from "@/lib/scoring";

describe("ads on the SERP", () => {
  it("counts text ads and Local Services Ads", () => {
    const items: SerpItem[] = [
      { type: "local_services", items: [{}, {}, {}] },
      { type: "paid", domain: "a.com" },
      { type: "paid", domain: "b.com" },
      { type: "organic", domain: "c.com" },
    ];
    expect(countAds(items)).toBe(5);
    expect(parseSerp("plumber", "Tampa,Florida,United States", "Tampa", items).adsCount).toBe(5);
    expect(countAds([{ type: "local_services" }])).toBe(1);
  });

  it("cuts the Ads Score when a SERP check found no ads", () => {
    const planner = adsScore({ cpc: 44.64, competitionIndex: 73, adsCount: null });
    const none = adsScore({ cpc: 44.64, competitionIndex: 73, adsCount: 0 });
    expect(planner).toBeGreaterThanOrEqual(TARGET_ADS);
    expect(Math.abs(none - planner * 0.6)).toBeLessThanOrEqual(1);
    expect(verdictFor(none, 90, "Live SERP")).not.toBe("Target");
  });
});
