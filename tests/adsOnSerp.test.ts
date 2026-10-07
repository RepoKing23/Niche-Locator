import { describe, expect, it } from "vitest";
import { countAds, parseSerp, type SerpItem } from "@/lib/dataforseo";
import { adsScore, verdictFor } from "@/lib/scoring";

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

  it("ignores 0 ads seen (real 'plumber tampa' SERP check saw none despite a $44.64 CPC)", () => {
    const planner = adsScore({ cpc: 44.64, competitionIndex: 73, adsCount: null });
    const none = adsScore({ cpc: 44.64, competitionIndex: 73, adsCount: 0 });
    expect(none).toBe(planner);
    expect(verdictFor(none, 90, "Live SERP")).toBe("Target");
  });

  it("lets ads seen only raise the score", () => {
    const low = { cpc: 3, competitionIndex: 30 };
    expect(adsScore({ ...low, adsCount: 3 })).toBeGreaterThan(adsScore({ ...low, adsCount: null }));
    const high = { cpc: 44.64, competitionIndex: 73 };
    expect(adsScore({ ...high, adsCount: 1 })).toBeGreaterThanOrEqual(adsScore({ ...high, adsCount: null }));
  });
});
