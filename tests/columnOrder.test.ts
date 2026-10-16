import { describe, expect, it } from "vitest";
import { mergeOrder, moveKey } from "@/lib/columnOrder";

describe("column order", () => {
  const defaults = ["score", "verdict", "city", "cpc", "google"];

  it("keeps a saved order, drops removed columns and slots new ones in after their default neighbour", () => {
    expect(mergeOrder(null, defaults)).toEqual(defaults);
    expect(mergeOrder(["cpc", "city", "gone", "score", "google"], defaults)).toEqual(["cpc", "city", "score", "verdict", "google"]);
  });

  it("puts a new first column first", () => {
    expect(mergeOrder(["google", "cpc"], ["score", "google", "cpc"])).toEqual(["score", "google", "cpc"]);
  });

  it("moves by one place or onto another column", () => {
    expect(moveKey(defaults, "cpc", { offset: -1 })).toEqual(["score", "verdict", "cpc", "city", "google"]);
    expect(moveKey(defaults, "score", { offset: -1 })).toBe(defaults);
    expect(moveKey(defaults, "google", { target: "score" })).toEqual(["google", "score", "verdict", "city", "cpc"]);
    expect(moveKey(defaults, "score", { target: "city" })).toEqual(["verdict", "city", "score", "cpc", "google"]);
  });
});
