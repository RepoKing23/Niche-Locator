import { describe, expect, it } from "vitest";
import { toCsv, toTsv } from "@/lib/export";

describe("export", () => {
  it("escapes CSV values", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], [1.5, null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n1.5,');
  });
  it("keeps TSV cells on one line", () => {
    expect(toTsv(["a", "b"], [["line1\nline2", "t\tab"]])).toBe("a\tb\nline1 line2\tt ab");
  });
});
