import { z } from "zod";
import { dataForSeoLocationName, findCity } from "@/lib/cities";
import { DataForSeoError, fetchLocal, hasCredentials } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockLocal } from "@/lib/mock";
import { combineMetrics } from "@/lib/scoring";
import type { LocalDemand } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  variants: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
  cityId: z.string(),
});

/**
 * Exact Google Ads demand targeted to one city (one API request per city; Google Ads allows
 * 12 requests/minute, so the browser paces these calls).
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const city = findCity(parsed.data.cityId);
  if (!city) return Response.json({ error: "Unknown city" }, { status: 400 });
  const variants = parsed.data.variants.map(cleanKeyword);
  try {
    const { metrics, cost } = hasCredentials()
      ? await fetchLocal(variants, city.name, dataForSeoLocationName(city))
      : mockLocal(variants, city);
    const c = combineMetrics(metrics);
    const demand: LocalDemand = {
      searchVolume: c.searchVolume,
      cpc: c.cpc,
      lowBid: c.lowBid,
      highBid: c.highBid,
      competitionIndex: c.competitionIndex,
      trend: c.trend,
      cost,
    };
    return Response.json({ demand });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Google Ads request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
