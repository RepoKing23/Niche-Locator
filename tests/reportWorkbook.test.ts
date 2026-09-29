import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CITIES, dataForSeoLocationName } from "@/lib/cities";
import { mockNiche, mockSerp } from "@/lib/mock";
import { COLUMN_DEFS } from "@/lib/reportColumns";
import { buildListWorkbook, buildReportWorkbook, buildTableWorkbook, reportFilename, type ReportExportInput } from "@/lib/reportWorkbook";
import { buildCityRow, buildSnapshot } from "@/lib/scoring";
import type { ListItem, SerpInfo } from "@/lib/types";

function makeInput(overrides: Partial<ReportExportInput> = {}): ReportExportInput {
  const keyword = "stair installer";
  const { metrics } = mockNiche([keyword, "stair contractor"]);
  const snapshot = buildSnapshot(keyword, metrics, 0);
  const cities = CITIES.slice(0, 12);
  const serps: Record<string, SerpInfo> = {};
  for (const c of cities) serps[c.id] = mockSerp(keyword, dataForSeoLocationName(c), c).serp;
  const rows = cities.map((c) => buildCityRow(c, snapshot, keyword, serps[c.id], null, "done"));
  return {
    niche: keyword, mode: "demo", createdAt: "2026-09-28T12:00:00.000Z", spent: 0.1234,
    snapshot, rows, view: rows, filters: [], serps, ...overrides,
  };
}

async function roundTrip(input: ReportExportInput) {
  const buf = await buildReportWorkbook(input).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}

describe("buildReportWorkbook", () => {
  it("contains the summary, cities, variants and SERP sheets", async () => {
    const wb = await roundTrip(makeInput());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "All Cities", "Keyword Variants", "SERP Details"]);
  });

  it("writes every city with all columns, sorted by score, with number formats and links", async () => {
    const input = makeInput();
    const ws = (await roundTrip(input)).getWorksheet("All Cities")!;
    expect(ws.getRow(1).values).toEqual([undefined, ...COLUMN_DEFS.map((c) => c.label)]);
    expect(ws.rowCount).toBe(input.rows.length + 1);
    const scores = Array.from({ length: input.rows.length }, (_, i) => Number(ws.getRow(i + 2).getCell(1).value));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const cpcCol = COLUMN_DEFS.findIndex((c) => c.key === "cpc") + 1;
    expect(ws.getRow(2).getCell(cpcCol).numFmt).toBe("$#,##0.00");
    const link = ws.getRow(2).getCell(COLUMN_DEFS.length).value as { hyperlink: string };
    expect(link.hyperlink).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
  });

  it("summarises the niche and lists the top 10 opportunities", async () => {
    const input = makeInput();
    const ws = (await roundTrip(input)).getWorksheet("Summary")!;
    const text: string[] = [];
    ws.eachRow((r) => text.push((r.values as unknown[]).filter(Boolean).join(" | ")));
    expect(text[0]).toBe("Niche report: stair installer");
    expect(text.some((t) => t.includes("DEMO data"))).toBe(true);
    const headerIdx = text.findIndex((t) => t.startsWith("City | State | Score"));
    const best = [...input.rows].sort((a, b) => b.score - a.score)[0];
    expect(text[headerIdx + 1]).toContain(best.city);
    expect(text.slice(headerIdx + 1, headerIdx + 11).every((t) => t.length > 0)).toBe(true);
  });

  it("adds a Shortlist sheet only when the table was narrowed", async () => {
    const input = makeInput();
    const view = input.rows.slice(0, 3);
    const wb = await roundTrip({ ...input, view, filters: ["CPC ≥ $5"] });
    expect(wb.worksheets.map((w) => w.name)).toContain("Shortlist");
    expect(wb.getWorksheet("Shortlist")!.rowCount).toBe(4);
  });

  it("lists SERP details and keyword variants", async () => {
    const input = makeInput();
    const wb = await roundTrip(input);
    expect(wb.getWorksheet("SERP Details")!.rowCount).toBe(input.rows.length + 1);
    expect(wb.getWorksheet("Keyword Variants")!.getRow(2).getCell(1).value).toBe("stair installer");
  });

  it("names the file after the niche and date", () => {
    expect(reportFilename("Stairway Installer", "2026-09-28T12:00:00Z")).toBe("stairway-installer-niche-report-2026-09-28.xlsx");
  });
});

describe("buildListWorkbook", () => {
  it("exports saved rows with niche and notes, across niches", async () => {
    const input = makeInput();
    const items: ListItem[] = input.rows.slice(0, 4).map((row, i) => ({
      id: `item-${i}`, listId: "l1", niche: i % 2 ? "plumber" : "stair installer", cityId: row.id, keyword: row.keyword,
      row, serp: input.serps[row.id], note: i === 0 ? "call first" : "", createdAt: "2026-09-29T10:00:00.000Z",
    }));
    const buf = await buildListWorkbook("Stairs TX", items, "selected").xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Rows", "SERP Details"]);
    const rows = wb.getWorksheet("Rows")!;
    expect(rows.getRow(1).getCell(1).value).toBe("Niche");
    expect(rows.getRow(1).getCell(2).value).toBe("Note");
    expect(rows.rowCount).toBe(5);
    const notes: unknown[] = [];
    rows.eachRow((r, n) => n > 1 && notes.push(r.getCell(2).value));
    expect(notes).toContain("call first");
    expect(wb.getWorksheet("Summary")!.getRow(1).getCell(1).value).toBe("Keyword list: Stairs TX");
  });

  it("builds a single-sheet table workbook", () => {
    const wb = buildTableWorkbook("My table", ["A", "B"], [[1, "x"], [2, null]]);
    expect(wb.worksheets[0].rowCount).toBe(3);
  });
});
