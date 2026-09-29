import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache, cacheKey, fresh } from "@/lib/cache";
import { getCityKd, getLocal } from "@/lib/fetchers";
import { LocalStore, type KV } from "@/lib/store/local";

function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

afterEach(() => vi.unstubAllGlobals());

describe("result cache", () => {
  it("stores null answers and expires old entries", async () => {
    const store = new LocalStore(memoryKV(), new MemoryCache());
    await store.putCached("kd", [["plumber|austin-tx", 7], ["plumber|tiny-vt", null]]);
    const hits = await store.getCached("kd", ["plumber|austin-tx", "plumber|tiny-vt", "plumber|boise-id"]);
    expect([...hits]).toEqual([["plumber|austin-tx", 7], ["plumber|tiny-vt", null]]);
    const old = new Map([["a", { data: 1, at: Date.now() - 31 * 86_400_000 }], ["b", { data: 2, at: Date.now() }]]);
    expect([...fresh(old).keys()]).toEqual(["b"]);
  });

  it("keys local demand by sorted variants", () => {
    expect(cacheKey.local(["b", "a", "a"], "x")).toBe(cacheKey.local(["a", "b"], "x"));
  });

  it("only pays for uncached cities, and a repeat run makes no API call", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { cityIds: string[] };
      calls.push(body);
      return new Response(JSON.stringify({
        results: Object.fromEntries(body.cityIds.map((id) => [id, id === "tiny-vt" ? null : 11])), cost: 0.0102,
      }), { status: 200 });
    }));
    const store = new LocalStore(memoryKV(), new MemoryCache());
    await store.putCached("kd", [["plumber|austin-tx", 7]]);

    const first = await getCityKd("plumber", ["austin-tx", "boise-id", "tiny-vt"], { store });
    expect(calls).toEqual([{ keyword: "plumber", cityIds: ["boise-id", "tiny-vt"] }]);
    expect(first).toMatchObject({ results: { "austin-tx": 7, "boise-id": 11, "tiny-vt": null }, cached: 1, cost: 0.0102 });

    const second = await getCityKd("plumber", ["austin-tx", "boise-id", "tiny-vt"], { store });
    expect(calls).toHaveLength(1);
    expect(second).toMatchObject({ cached: 3, cost: 0 });

    await getCityKd("plumber", ["austin-tx"], { store, refresh: true });
    expect(calls).toHaveLength(2);
  });

  it("reuses cached city demand for free", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      demand: { searchVolume: 70, cpc: 9, lowBid: 2, highBid: 20, competitionIndex: 80, trend: [], cost: 0.09 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = new LocalStore(memoryKV(), new MemoryCache());
    const a = await getLocal(["plumber", "plumber austin"], "austin-tx", { store });
    const b = await getLocal(["plumber austin", "plumber"], "austin-tx", { store });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.cached).toBe(false);
    expect(b).toMatchObject({ cached: true, demand: { searchVolume: 70, cost: 0 } });
  });
});
