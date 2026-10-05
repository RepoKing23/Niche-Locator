import { describe, expect, it } from "vitest";
import { businessName, domainIdea, serviceWord } from "@/lib/businessName";

describe("business name generator", () => {
  it("builds short city + service names", () => {
    expect(businessName("stair lift installer", "Tampa")).toBe("Tampa Stair Lift Pros");
    expect(businessName("stairway installer", "Austin")).toBe("Austin Stairway Pros");
    expect(businessName("plumber", "Boise")).toBe("Boise Plumbing Pros");
    expect(businessName("roofer", "St. Louis")).toBe("St Louis Roofing Pros");
  });

  it("drops the suffix when the name would be too long", () => {
    const n = businessName("stair lift installer", "Colorado Springs");
    expect(n).toBe("Colorado Springs Stair Lift");
    expect(n.length).toBeLessThanOrEqual(28);
  });

  it("maps trade nouns and keeps other services as typed", () => {
    expect(serviceWord("electrician")).toBe("Electric");
    expect(serviceWord("gutter installation")).toBe("Gutter");
    expect(serviceWord("water heater repair")).toBe("Water Heater");
  });

  it("makes a matching .com idea", () => {
    expect(domainIdea("St Louis Roofing Pros")).toBe("stlouisroofingpros.com");
  });

  it("drops search-intent words", () => {
    expect(businessName("curved stair lift cost", "Tampa")).toBe("Tampa Curved Stair Lift Pros");
    expect(businessName("best plumber near me", "Boise")).toBe("Boise Plumbing Pros");
    expect(businessName("how to build stairs", "Tampa")).toBe("Tampa Build Stairs Pros");
  });
});
