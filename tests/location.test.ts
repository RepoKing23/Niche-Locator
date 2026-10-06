import { describe, expect, it } from "vitest";
import { businessName } from "@/lib/businessName";
import { googleQuery, mentionsPlace, stripPlace } from "@/lib/location";

describe("keywords that already contain the place", () => {
  it("doesn't double the city/state in the Google query", () => {
    expect(googleQuery("stair lift cost missoula mt", "Missoula", "MT", "Montana")).toBe("stair lift cost missoula mt");
    expect(googleQuery("plumber missoula", "Missoula", "MT", "Montana")).toBe("plumber missoula MT");
    expect(googleQuery("plumber missoula montana", "Missoula", "MT", "Montana")).toBe("plumber missoula montana");
    expect(googleQuery("plumber", "Missoula", "MT", "Montana")).toBe("plumber Missoula MT");
    expect(googleQuery("roofer st louis", "St. Louis", "MO", "Missouri")).toBe("roofer st louis MO");
  });

  it("matches state codes only as whole words", () => {
    expect(mentionsPlace("mtn bike repair", "Missoula", "MT", "Montana")).toEqual({ city: false, state: false });
    expect(mentionsPlace("Plumber, Missoula MT", "Missoula", "MT", "Montana")).toEqual({ city: true, state: true });
  });

  it("strips the place from a keyword", () => {
    expect(stripPlace("stair lift cost missoula mt", "Missoula", "MT", "Montana")).toBe("stair lift cost");
    expect(stripPlace("best roofer in st. louis missouri", "St. Louis", "MO", "Missouri")).toBe("best roofer in");
  });

  it("business names don't repeat the city", () => {
    expect(businessName("stair lift cost missoula mt", "Missoula", "MT", "Montana")).toBe("Missoula Stair Lift Pros");
    expect(businessName("plumber missoula", "Missoula", "MT", "Montana")).toBe("Missoula Plumbing Pros");
    expect(businessName("plumber", "Missoula", "MT", "Montana")).toBe("Missoula Plumbing Pros");
  });
});
