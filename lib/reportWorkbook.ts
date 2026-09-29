import ExcelJS from "exceljs";
import { downloadBlob, type Cell } from "./export";
import { COLUMN_DEFS, googleUrl, type ColumnDef } from "./reportColumns";
import type { CityRow, ListItem, NicheSnapshot, SerpInfo } from "./types";

export type ReportExportInput = {
  niche: string;
  mode: "live" | "demo";
  createdAt: string;
  spent: number;
  snapshot: NicheSnapshot;
  /** Every city in the report. */
  rows: CityRow[];
  /** Rows as filtered/sorted (or selected) in the UI; becomes the Shortlist sheet when `filters` is non-empty. */
  view: CityRow[];
  /** Human-readable active filters / selection, e.g. "CPC ≥ $5", "Selected rows: 4". */
  filters: string[];
  serps: Record<string, SerpInfo>;
};

const COLORS = {
  header: "FF1E3A5F",
  headerText: "FFFFFFFF",
  good: "FFD1FAE5",
  mid: "FFFEF3C7",
  bad: "FFFFE4E6",
  title: "FF0369A1",
  muted: "FF71717A",
};

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: COLORS.headerText } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
  row.eachCell((c) => (c.fill = fill(COLORS.header)));
}

function autoWidth(ws: ExcelJS.Worksheet, min = 8, max = 50) {
  ws.columns.forEach((col) => {
    let longest = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const text = v && typeof v === "object" && "text" in v ? String(v.text) : String(v ?? "");
      longest = Math.max(longest, Math.min(max, text.length + 2));
    });
    col.width = longest;
  });
}

function toneFor(key: string, r: CityRow): string | null {
  if (key === "score") return r.score >= 65 ? COLORS.good : r.score >= 45 ? COLORS.mid : COLORS.bad;
  if (key === "organic") {
    return r.organic === "Low" ? COLORS.good : r.organic === "Medium" ? COLORS.mid : r.organic === "High" ? COLORS.bad : null;
  }
  if (key === "competition") {
    return r.competition === "HIGH" ? COLORS.good : r.competition === "MEDIUM" ? COLORS.mid : r.competition === "LOW" ? COLORS.bad : null;
  }
  return null;
}

/** A formatted city table: header notes, number formats, colored score/competition cells, SERP hyperlinks. */
function addCityTable(ws: ExcelJS.Worksheet, rows: CityRow[], columns: ColumnDef[]) {
  const header = ws.addRow(columns.map((c) => c.label));
  styleHeader(header);
  columns.forEach((c, i) => (header.getCell(i + 1).note = c.help));

  for (const r of rows) {
    const row = ws.addRow(columns.map((c) => c.value(r) ?? ""));
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.numFmt) cell.numFmt = c.numFmt;
      const tone = toneFor(c.key, r);
      if (tone) cell.fill = fill(tone);
      if (c.key === "google") {
        cell.value = { text: "Open SERP", hyperlink: googleUrl(r) };
        cell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    });
  }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  autoWidth(ws);
  const trendIdx = columns.findIndex((c) => c.key === "trend");
  if (trendIdx >= 0) ws.getColumn(trendIdx + 1).width = 40;
  const googleIdx = columns.findIndex((c) => c.key === "google");
  if (googleIdx >= 0) ws.getColumn(googleIdx + 1).width = 12;
}

function addSummary(wb: ExcelJS.Workbook, input: ReportExportInput, bestFirst: CityRow[]) {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: COLORS.title } } });
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 22;
  for (let i = 3; i <= 7; i++) ws.getColumn(i).width = 16;

  const title = ws.addRow([`Niche report: ${input.niche}`]);
  title.font = { bold: true, size: 18, color: { argb: COLORS.title } };
  ws.addRow([
    `Generated ${new Date(input.createdAt).toLocaleString("en-US")} · ${input.mode === "live" ? "Live DataForSEO data" : "DEMO data (not real)"}`,
  ]).font = { color: { argb: COLORS.muted } };
  ws.addRow([]);

  const section = (text: string) => {
    ws.addRow([]);
    const r = ws.addRow([text]);
    r.font = { bold: true, size: 13, color: { argb: COLORS.title } };
  };
  const kv = (label: string, value: string | number | null, numFmt?: string) => {
    const r = ws.addRow([label, value ?? "—"]);
    r.getCell(1).font = { bold: true };
    if (numFmt) r.getCell(2).numFmt = numFmt;
    r.getCell(2).alignment = { horizontal: "left" };
  };

  const s = input.snapshot;
  section("Niche snapshot (United States)");
  kv("Monthly searches (US)", s.nationalVolume, "#,##0");
  kv("Average CPC", s.cpc, "$#,##0.00");
  kv("Top-of-page bid low", s.lowBid, "$#,##0.00");
  kv("Top-of-page bid high", s.highBid, "$#,##0.00");
  kv("Ads competition", s.competition ? `${s.competition} (${s.competitionIndex})` : null);
  kv("Keyword difficulty (US)", s.difficulty);
  kv("Keyword variants", s.variants.map((v) => v.keyword).join(", "));

  section("Coverage");
  kv("Cities analysed", input.rows.length);
  const count = (l: string) => input.rows.filter((r) => r.organic === l).length;
  kv("Low organic competition", count("Low"));
  kv("Medium organic competition", count("Medium"));
  kv("High organic competition", count("High"));
  kv("Cities with exact Google Ads volume", input.rows.filter((r) => r.volumeSource !== "Estimated").length);
  kv("API spend", input.spent, "$#,##0.000");

  section("Top 10 opportunities");
  const head = ws.addRow(["City", "State", "Score", "CPC", "Monthly searches", "Organic diff.", "Organic comp."]);
  styleHeader(head);
  for (const r of bestFirst.slice(0, 10)) {
    const row = ws.addRow([r.city, r.stateCode, r.score, r.cpc, r.searchVolume, r.organicDifficulty ?? "", r.organic]);
    row.getCell(3).fill = fill(toneFor("score", r)!);
    row.getCell(4).numFmt = "$#,##0.00";
    row.getCell(5).numFmt = "#,##0";
    const organicTone = toneFor("organic", r);
    if (organicTone) row.getCell(7).fill = fill(organicTone);
  }

  section("Filters used for the Shortlist sheet");
  if (input.filters.length) input.filters.forEach((f) => ws.addRow([f]));
  else ws.addRow(["None — Shortlist not included"]);

  section("How to read this report");
  [
    "Opportunity (0-100) = 30% CPC + 20% ads competition + 35% organic ease + 15% local search volume.",
    "Organic Diff. (0-100) comes from the live Google top 10 in each city: directories, job boards, social and big-box sites are weak;",
    "  results from businesses targeting the city are strong; a map pack with many reviews adds difficulty. Below 30 = Low, 60+ = High.",
    "Volume Source 'Estimated' = national volume × city population (fetch exact city volume in the app for Google Ads city data).",
    "CPC Source 'National' = the city had no CPC data, so the US average is used.",
    "Hover over the column headers in the All Cities sheet for a description of each column.",
  ].forEach((t) => ws.addRow([t]));
}

function addVariants(wb: ExcelJS.Workbook, snapshot: NicheSnapshot) {
  const ws = wb.addWorksheet("Keyword Variants");
  const months = Math.max(0, ...snapshot.variants.map((v) => v.trend.length));
  const header = ws.addRow([
    "Keyword", "US Monthly Searches", "CPC", "Bid Low", "Bid High", "Ads Competition", "Ads Index", "Keyword Difficulty",
    ...Array.from({ length: months }, (_, i) => `Month ${i + 1}`),
  ]);
  styleHeader(header);
  for (const v of snapshot.variants) {
    const row = ws.addRow([
      v.keyword, v.searchVolume ?? "", v.cpc ?? "", v.lowBid ?? "", v.highBid ?? "", v.competition ?? "",
      v.competitionIndex ?? "", v.difficulty ?? "", ...v.trend,
    ]);
    row.getCell(2).numFmt = "#,##0";
    [3, 4, 5].forEach((i) => (row.getCell(i).numFmt = "$#,##0.00"));
  }
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  autoWidth(ws);
}

function addSerpDetails(wb: ExcelJS.Workbook, pairs: { row: CityRow; serp: SerpInfo | null | undefined }[]) {
  const ws = wb.addWorksheet("SERP Details");
  const header = ws.addRow([
    "City", "State", "Keyword", "Organic Results", "Weak in Top 10", "Weak Domains", "Local Competitors",
    "Map Pack", "Map Pack Max Reviews", "Ads on SERP", "Organic Diff.",
    ...Array.from({ length: 10 }, (_, i) => `Top ${i + 1}`),
  ]);
  styleHeader(header);
  for (const { row: r, serp: s } of pairs) {
    if (!s) continue;
    ws.addRow([
      r.city, r.stateCode, s.keyword, s.organicCount, s.weakResults, s.weakDomains.join(", "), s.cityRelevant,
      s.localPack ? "Yes" : "No", s.localPackTopReviews ?? "", s.adsCount, s.difficulty,
      ...s.topDomains.slice(0, 10),
    ]);
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 21 } };
  autoWidth(ws, 8, 40);
}

export function buildReportWorkbook(input: ReportExportInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Niche Locator";
  wb.created = new Date(input.createdAt);

  const bestFirst = [...input.rows].sort((a, b) => b.score - a.score);
  addSummary(wb, input, bestFirst);

  // Shortlist only when the user narrowed the table (filters or selected rows).
  if (input.filters.length && input.view.length) {
    addCityTable(wb.addWorksheet("Shortlist", { properties: { tabColor: { argb: "FF10B981" } } }), input.view, COLUMN_DEFS);
  }
  addCityTable(wb.addWorksheet("All Cities"), bestFirst, COLUMN_DEFS);
  addVariants(wb, input.snapshot);
  addSerpDetails(wb, bestFirst.map((row) => ({ row, serp: input.serps[row.id] })));
  return wb;
}

export function reportFilename(niche: string, createdAt: string): string {
  const slug = niche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "niche";
  return `${slug}-niche-report-${createdAt.slice(0, 10)}.xlsx`;
}

/** Extra columns for saved list rows, which can mix niches. */
const LIST_COLUMNS: ColumnDef[] = [
  { key: "niche", label: "Niche", defaultVisible: true, help: "Niche researched", value: () => null },
  { key: "note", label: "Note", defaultVisible: true, help: "Your note", value: () => null },
  { key: "saved", label: "Saved", defaultVisible: true, help: "Date saved to the list", value: () => null },
];

/** Workbook for a keyword list: Summary, Rows (all columns + niche/note/date) and SERP Details. */
export function buildListWorkbook(listName: string, items: ListItem[], scope: "all" | "selected"): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Niche Locator";
  const sorted = [...items].sort((a, b) => b.row.score - a.row.score);

  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: COLORS.title } } });
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 22;
  for (let i = 3; i <= 7; i++) ws.getColumn(i).width = 16;
  ws.addRow([`Keyword list: ${listName}`]).font = { bold: true, size: 18, color: { argb: COLORS.title } };
  ws.addRow([`Exported ${new Date().toLocaleString("en-US")} · ${scope === "all" ? "all rows" : "selected rows only"}`])
    .font = { color: { argb: COLORS.muted } };
  ws.addRow([]);
  const kv = (k: string, v: string | number) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { horizontal: "left" };
  };
  kv("Rows", items.length);
  const niches = [...new Set(items.map((i) => i.niche))];
  kv("Niches", niches.join(", "));
  kv("States", [...new Set(items.map((i) => i.row.stateCode))].sort().join(", "));
  ws.addRow([]);
  ws.addRow(["Top 10 by opportunity score"]).font = { bold: true, size: 13, color: { argb: COLORS.title } };
  styleHeader(ws.addRow(["City", "State", "Niche", "Score", "CPC", "Monthly searches", "Organic comp."]));
  for (const i of sorted.slice(0, 10)) {
    const r = ws.addRow([i.row.city, i.row.stateCode, i.niche, i.row.score, i.row.cpc, i.row.searchVolume, i.row.organic]);
    r.getCell(4).fill = fill(toneFor("score", i.row)!);
    r.getCell(5).numFmt = "$#,##0.00";
    r.getCell(6).numFmt = "#,##0";
  }

  const rowsWs = wb.addWorksheet("Rows");
  const extra = new Map(sorted.map((i) => [i.row, i]));
  const columns: ColumnDef[] = [
    ...LIST_COLUMNS.map((c) => ({
      ...c,
      value: (r: CityRow) => {
        const i = extra.get(r)!;
        return c.key === "niche" ? i.niche : c.key === "note" ? i.note : i.createdAt.slice(0, 10);
      },
    })),
    ...COLUMN_DEFS,
  ];
  addCityTable(rowsWs, sorted.map((i) => i.row), columns);
  rowsWs.views = [{ state: "frozen", xSplit: 5, ySplit: 1 }];

  addSerpDetails(wb, sorted.map((i) => ({ row: i.row, serp: i.serp })));
  return wb;
}

export function listFilename(listName: string): string {
  const slug = listName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
  return `${slug}-keyword-list-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

/** Single-sheet workbook of exactly the columns/rows shown in a table. */
export function buildTableWorkbook(sheetName: string, headers: string[], rows: Cell[][]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  styleHeader(ws.addRow(headers));
  for (const r of rows) ws.addRow(r.map((v) => (v == null ? "" : v)));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  autoWidth(ws);
  return wb;
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Browser only: write the workbook and trigger a download. */
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX_TYPE }), filename);
}
