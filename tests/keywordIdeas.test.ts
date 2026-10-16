import { describe, expect, it } from "vitest";
import { parseKeywordIdeas } from "@/lib/dataforseo";
import { mockKeywordIdeas } from "@/lib/mock";
import { LocalStore, type KV } from "@/lib/store/local";
import { sortIdeas, withCityData } from "@/components/KeywordIdeas";

describe("keyword ideas", () => {
  it("lists suggestions before related keywords, without the seed, duplicates or invalid keywords", () => {
    const ideas = parseKeywordIdeas(
      "stair lift",
      [
        { keyword: "Stair Lift", keyword_info: { search_volume: 9000 } },
        { keyword: "stair lift cost", keyword_info: { search_volume: 2400, cpc: 6.5, competition: 0.95, competition_level: "HIGH" }, keyword_properties: { keyword_difficulty: 31 } },
        { keyword: "a b c d e f g h i j k stair lift", keyword_info: { search_volume: 10 } },
      ],
      [
        { keyword_data: { keyword: "stair lift cost", keyword_info: { search_volume: 2400 } } },
        { keyword_data: { keyword: "chair lift for stairs", keyword_info: { search_volume: 1900, cpc: null } } },
        { keyword_data: null },
      ],
    );
    expect(ideas).toEqual([
      { keyword: "stair lift cost", kind: "suggestion", searchVolume: 2400, cpc: 6.5, competition: "HIGH", competitionIndex: 95, difficulty: 31 },
      { keyword: "chair lift for stairs", kind: "related", searchVolume: 1900, cpc: null, competition: null, competitionIndex: null, difficulty: null },
    ]);
  });

  it("has demo ideas that never repeat the seed", () => {
    const { ideas } = mockKeywordIdeas("plumber");
    expect(ideas.length).toBeGreaterThan(5);
    expect(ideas.map((i) => i.keyword)).not.toContain("plumber");
  });
});

describe("keyword templates (LocalStore)", () => {
  const m = new Map<string, string>();
  const kv: KV = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };

  it("saves, replaces by name (any case) and deletes", async () => {
    const store = new LocalStore(kv);
    const a = await store.saveTemplate("Stairs", ["stair lift", "stair repair"]);
    await store.saveTemplate("Plumbing", ["plumber"]);
    const b = await store.saveTemplate("stairs", ["stair lift"]);
    expect(b.id).toBe(a.id);
    expect((await store.listTemplates()).map((t) => [t.name, t.keywords])).toEqual([
      ["Plumbing", ["plumber"]], ["Stairs", ["stair lift"]],
    ]);
    await store.deleteTemplate(a.id);
    expect((await store.listTemplates()).map((t) => t.name)).toEqual(["Plumbing"]);
  });
});

describe("sorting keyword ideas", () => {
  const idea = (keyword: string, searchVolume: number | null, difficulty: number | null) =>
    ({ keyword, kind: "suggestion", searchVolume, cpc: null, competition: null, competitionIndex: null, difficulty }) as const;
  const ideas = [idea("b", 100, null), idea("a", null, 40), idea("c", 900, 10)];

  it("sorts either way with missing values last, and keeps the original order without a sort", () => {
    expect(sortIdeas(ideas, { key: "searchVolume", dir: "desc" }).map((i) => i.keyword)).toEqual(["c", "b", "a"]);
    expect(sortIdeas(ideas, { key: "searchVolume", dir: "asc" }).map((i) => i.keyword)).toEqual(["b", "c", "a"]);
    expect(sortIdeas(ideas, { key: "organic", dir: "asc" }).map((i) => i.keyword)).toEqual(["c", "a", "b"]);
    expect(sortIdeas(ideas, { key: "keyword", dir: "asc" }).map((i) => i.keyword)).toEqual(["a", "b", "c"]);
    expect(sortIdeas(ideas, null)).toBe(ideas);
  });
});

describe("keyword ideas in a city", () => {
  it("shows the city numbers Keyword Check would find, and flags ideas without city data", () => {
    const ideas = [
      { keyword: "stair lift repair", kind: "suggestion", searchVolume: 1900, cpc: 18, competition: "HIGH", competitionIndex: 90, difficulty: 17 },
      { keyword: "stair lift self installation", kind: "suggestion", searchVolume: 70, cpc: 7.65, competition: "HIGH", competitionIndex: 88, difficulty: 0 },
    ] as const;
    const out = withCityData([...ideas], {
      ads: {
        "stair lift repair": { keyword: "stair lift repair tampa", searchVolume: 30, cpc: 12.5, lowBid: null, highBid: null, competition: "MEDIUM", competitionIndex: 50, trend: [] },
        "stair lift self installation": null,
      },
      kd: { "stair lift repair": 8, "stair lift self installation": null },
    });
    expect(out[0]).toMatchObject({ searchVolume: 30, cpc: 12.5, competition: "MEDIUM", competitionIndex: 50, difficulty: 8, noData: false });
    expect(out[1]).toMatchObject({ searchVolume: null, cpc: null, competition: null, difficulty: null, noData: true });
  });
});
