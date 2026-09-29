import { describe, expect, it } from "vitest";
import { cityKeyword, parseSerp, parseSerpTask, parseTaskPost, type ApiTask, type SerpItem } from "@/lib/dataforseo";
import { findCity } from "@/lib/cities";
import { mockCityDifficulty } from "@/lib/mock";
import { CITIES } from "@/lib/cities";

// Shapes from a real task_post / task_get call (Tampa, "stair lift installer").
const created: ApiTask<unknown> = {
  id: "09291641-2647-0066-0000-a05b8faf7e54", status_code: 20100, status_message: "Task Created.", cost: 0.0006,
  result: null, data: { tag: "tampa-fl" },
};

describe("queued SERP tasks", () => {
  it("maps created tasks back to cities by tag, and reports failures", () => {
    const failed: ApiTask<unknown> = { status_code: 40501, status_message: "Invalid Field: 'location_name'.", result: null, data: { tag: "nowhere-xx" } };
    const r = parseTaskPost([created, failed], ["tampa-fl", "nowhere-xx"]);
    expect(r.tasks).toEqual([{ cityId: "tampa-fl", taskId: created.id }]);
    expect(r.errors).toEqual({ "nowhere-xx": "Invalid Field: 'location_name'." });
  });

  it("recognises done / pending / error task states", () => {
    const items: SerpItem[] = [{ type: "organic", domain: "www.leafhome.com", title: "Stair lift installation in Tampa, FL" }];
    expect(parseSerpTask({ status_code: 20000, status_message: "Ok.", result: [{ items }] })).toEqual({ state: "done", items });
    expect(parseSerpTask({ status_code: 40602, status_message: "Task In Queue.", result: null }).state).toBe("pending");
    expect(parseSerpTask({ status_code: 40601, status_message: "Task Handed.", result: null }).state).toBe("pending");
    expect(parseSerpTask({ status_code: 40400, status_message: "Not Found.", result: null })).toEqual({ state: "error", message: "Not Found." });
    expect(parseSerpTask(undefined).state).toBe("error");
  });

  it("scores a SERP full of city-targeted local competitors as hard", () => {
    // Real Tampa result: every organic hit is a stair-lift company targeting Tampa.
    const items: SerpItem[] = [
      { type: "local_pack", domain: "mychairlift.com", rating: { votes_count: 70 } },
      { type: "local_pack", domain: "www.nextdayaccess.com", rating: { votes_count: 77 } },
      ...["Stair lift installation in Tampa, FL", "Tampa Bay, FL Stairlifts", "Stair Lift & Platform Lift Installation Serving Tampa, Florida",
        "Stair Lifts - Next Day Access (Tampa, FL)", "Find Stairlifts and Chair Stair Lifts in Tampa - Florida"].map((title, i) => ({
        type: "organic", domain: `site${i}.com`, title,
      })),
      { type: "organic", domain: "stairliftspro.com", title: "Florida's Stairlift Leader" },
    ];
    const serp = parseSerp("stair lift installer", "Tampa,Florida,United States", "Tampa", items);
    expect(serp.cityRelevant).toBe(5);
    expect(serp.difficulty).toBeGreaterThanOrEqual(60);
  });
});

describe("city keyword difficulty", () => {
  it("builds the searched phrase", () => {
    expect(cityKeyword("plumber", "St. Louis")).toBe("plumber st louis");
  });

  it("demo KD has partial coverage like the real API", () => {
    const vals = CITIES.slice(0, 300).map((c) => mockCityDifficulty("plumber", c));
    const nulls = vals.filter((v) => v === null).length;
    expect(nulls).toBeGreaterThan(60);
    expect(nulls).toBeLessThan(180);
    expect(vals.every((v) => v === null || (v >= 0 && v <= 100))).toBe(true);
    expect(mockCityDifficulty("plumber", findCity("austin-tx")!)).toBe(mockCityDifficulty("plumber", findCity("austin-tx")!));
  });
});
