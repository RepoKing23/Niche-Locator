import ExcelJS from "exceljs";
import { z } from "zod";

const Body = z.object({
  sheetName: z.string().max(31).default("Niche report"),
  headers: z.array(z.string()).min(1).max(40),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(20000),
});

/** Builds an .xlsx file from the table rows the user currently sees. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { sheetName, headers, rows } = parsed.data;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.replace(/[\\/?*[\]:]/g, " ") || "Report", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v) => (v == null ? "" : v)));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="niche-report.xlsx"',
    },
  });
}
