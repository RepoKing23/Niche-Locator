import { describe, expect, it } from "vitest";
import { CITIES, areaCodeFor } from "@/lib/cities";
import { COLUMN_DEFS } from "@/lib/reportColumns";

describe("area codes", () => {
  it("knows the local area code of well-known cities", () => {
    expect(areaCodeFor("Tampa", "FL")).toBe("813");
    expect(areaCodeFor("Missoula", "MT")).toBe("406");
    expect(areaCodeFor("Austin", "TX")).toBe("512");
    expect(areaCodeFor("Brooklyn", "NY")).toContain("718");
    expect(areaCodeFor("Washington", "DC")).toContain("202");
  });

  it("falls back to a nearby city's code", () => {
    expect(areaCodeFor("Miramar", "FL")).toBe("954");
    expect(areaCodeFor("Thornton", "CO")).toBe("303");
  });

  it("covers almost every city", () => {
    const missing = CITIES.filter((c) => !/^\d{3}( \/ \d{3}){0,2}$/.test(c.areaCode));
    expect(missing.length / CITIES.length).toBeLessThan(0.05);
  });

  it("is a report column", () => {
    const col = COLUMN_DEFS.find((c) => c.key === "areaCode")!;
    expect(col.value({ city: "Tampa", stateCode: "FL" } as never)).toBe("813");
  });
});
