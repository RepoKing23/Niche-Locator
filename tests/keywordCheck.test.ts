import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "@/lib/cache";
import { findCity } from "@/lib/cities";
import { getKeywordCheck } from "@/lib/fetchers";
import { mockSerp } from "@/lib/mock";
import { buildKeywordRow } from "@/lib/scoring";
import { LocalStore, type KV } from "@/lib/store/local";

const tampa = findCity("tampa-fl")!;
// Real-style Google Ads data for a keyword searched in Tampa.
const strong = {
  keyword: "plumber", searchVolume: 1600, cpc: 44.64, lowBid: 36.25, highBid: 120.52,
  competition: "HIGH" as const, competitionIndex: 73, trend: Array(12).fill(1600),
};

function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

afterEach(() => vi.unstubAllGlobals());

describe("keyword check rows", () => {
  it("strong ads + low KD = Target", () => {
    const r = buildKeywordRow(tampa, "plumber", strong, 12, null, "skipped");
    expect(r).toMatchObject({ id: "plumber", city: "Tampa", cpc: 44.64, cpcSource: "City", volumeSource: "Google Ads (city)", organicSource: "City KD" });
    expect(r.adsScore).toBeGreaterThanOrEqual(60);
    expect(r.verdict).toBe("Target");
  });

  it("no ads data = no ads market, never a target", () => {
    const r = buildKeywordRow(tampa, "how to fix a stair", null, 5, null, "skipped");
    expect(r).toMatchObject({ cpc: 0, competitionIndex: null, searchVolume: 0 });
    expect(r.adsScore).toBe(0);
    expect(r.verdict).toBe("Easy, low value");
  });

  it("a live SERP check overrides KD and adds ads seen on Google", () => {
    const { serp } = mockSerp("plumber", "Tampa,Florida,United States", tampa);
    const r = buildKeywordRow(tampa, "plumber", strong, 12, serp, "done");
    expect(r).toMatchObject({ organicDifficulty: serp.difficulty, organicSource: "Live SERP", adsCount: serp.adsCount });
  });

  it("unknown organic stays neutral", () => {
    const r = buildKeywordRow(tampa, "plumber", strong, null, null, "skipped");
    expect(r.organicDifficulty).toBeNull();
    expect(r.organicEase).toBe(50);
    expect(r.verdict).toBe("Ads only");
  });
});

describe("getKeywordCheck", () => {
  it("only pays for uncached keywords (live Google Ads)", async () => {
    const calls: { keywords: string[]; withKd: boolean }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      return new Response(JSON.stringify({
        keywords: body.keywords,
        ads: Object.fromEntries(body.keywords.map((k: string) => [k, k === "rare thing" ? null : strong])),
        kd: Object.fromEntries(body.keywords.map((k: string) => [k, 10])),
        cost: 0.1,
      }), { status: 200 });
    }));
    const store = new LocalStore(memoryKV(), new MemoryCache());
    const first = await getKeywordCheck(["plumber", "rare thing"], "tampa-fl", { store, source: "ads" });
    expect(first).toMatchObject({ cost: 0.1, cached: 0, ads: { "rare thing": null }, kd: { plumber: 10 } });
    const second = await getKeywordCheck(["plumber", "rare thing", "water heater repair"], "tampa-fl", { store, source: "ads" });
    expect(calls[1]).toEqual({ keywords: ["water heater repair"], cityId: "tampa-fl", withKd: true, source: "ads" });
    expect(second.cached).toBe(2);
    // Same keywords in another city: ads are city-specific, KD is reused.
    await getKeywordCheck(["plumber"], "boise-id", { store, source: "ads" });
    expect(calls[2]).toEqual({ keywords: ["plumber"], cityId: "boise-id", withKd: false, source: "ads" });
    // Labs data is for the local phrase, so it is cached separately per city.
    await getKeywordCheck(["plumber"], "tampa-fl", { store });
    expect(calls[3]).toEqual({ keywords: ["plumber"], cityId: "tampa-fl", withKd: true, source: "labs" });
    await getKeywordCheck(["plumber"], "tampa-fl", { store });
    expect(calls).toHaveLength(4);
  });
});
