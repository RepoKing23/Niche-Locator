import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safeNext";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/lists")).toBe("/lists");
    expect(safeNext("/check?city=tampa")).toBe("/check?city=tampa");
  });

  it("falls back for missing, external or looping targets", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/auth/callback")).toBe("/");
    expect(safeNext(undefined, "/account")).toBe("/account");
  });
});
