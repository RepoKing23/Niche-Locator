import { z } from "zod";
import { buildReportWorkbook, reportFilename, type ReportExportInput } from "@/lib/reportWorkbook";

const MAX_ROWS = 250;

// Rows/snapshot are produced by this app's own API; validate the envelope and sizes, not every field.
const Body = z.object({
  niche: z.string().min(1).max(80),
  mode: z.enum(["live", "demo"]),
  createdAt: z.string().max(40),
  spent: z.number().min(0),
  snapshot: z.object({ variants: z.array(z.any()).max(20) }).passthrough(),
  rows: z.array(z.object({ id: z.string(), city: z.string() }).passthrough()).min(1).max(MAX_ROWS),
  view: z.array(z.object({ id: z.string() }).passthrough()).max(MAX_ROWS),
  filters: z.array(z.string().max(200)).max(20),
  serps: z.record(z.string(), z.object({ topDomains: z.array(z.string()).max(20) }).passthrough())
    .refine((s) => Object.keys(s).length <= MAX_ROWS),
});

/** Full multi-sheet Excel report: Summary, Shortlist, All Cities, Keyword Variants, SERP Details. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid report data" }, { status: 400 });
  const input = parsed.data as unknown as ReportExportInput;
  try {
    const buffer = await buildReportWorkbook(input).xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${reportFilename(input.niche, input.createdAt)}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not build the report" }, { status: 500 });
  }
}
