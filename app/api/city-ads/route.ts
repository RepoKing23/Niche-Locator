import { z } from "zod";
import { findCity, type City } from "@/lib/cities";
import { DataForSeoError, MAX_KD_KEYWORDS, cityKeyword, fetchCityAds, hasCredentials } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockCityAds, mockCityDifficulty } from "@/lib/mock";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  keyword: z.string().trim().min(2).max(80),
  cityIds: z.array(z.string()).min(1).max(MAX_KD_KEYWORDS * 5),
  source: z.enum(["labs", "ads"]).default("labs"),
});

/**
 * City-level Google Ads data (CPC, bids, competition, volume) for "<keyword> <city>" phrases.
 * Labs (default): ~$0.01 + $0.0001/phrase and also returns keyword difficulty (`kd`).
 * Google Ads live: one request covers up to 1,000 cities for a flat ~$0.09.
 */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);
  const cities = parsed.data.cityIds.map(findCity).filter((c): c is City => Boolean(c));

  if (!hasCredentials()) {
    return Response.json({
      results: Object.fromEntries(cities.map((c) => [c.id, mockCityAds(keyword, c)])),
      kd: parsed.data.source === "labs" ? Object.fromEntries(cities.map((c) => [c.id, mockCityDifficulty(keyword, c)])) : undefined,
      cost: 0,
    });
  }
  try {
    const phrases = new Map(cities.map((c) => [c.id, cityKeyword(keyword, c.name)]));
    const { ads, difficulty, cost } = await fetchCityAds([...new Set(phrases.values())], parsed.data.source);
    return Response.json({
      results: Object.fromEntries(cities.map((c) => [c.id, ads.get(phrases.get(c.id)!) ?? null])),
      kd: difficulty ? Object.fromEntries(cities.map((c) => [c.id, difficulty.get(phrases.get(c.id)!) ?? null])) : undefined,
      cost,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "City ads request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
