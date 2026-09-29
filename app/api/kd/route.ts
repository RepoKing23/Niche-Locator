import { z } from "zod";
import { findCity, type City } from "@/lib/cities";
import { DataForSeoError, MAX_KD_KEYWORDS, cityKeyword, fetchCityDifficulty, hasCredentials } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockCityDifficulty } from "@/lib/mock";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  keyword: z.string().trim().min(2).max(80),
  cityIds: z.array(z.string()).min(1).max(MAX_KD_KEYWORDS * 5),
});

/** City-level keyword difficulty ("<keyword> <city>") from DataForSEO Labs: ~$0.01/request + $0.0001/city. */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);
  const cities = parsed.data.cityIds.map(findCity).filter((c): c is City => Boolean(c));

  if (!hasCredentials()) {
    return Response.json({
      results: Object.fromEntries(cities.map((c) => [c.id, mockCityDifficulty(keyword, c)])),
      cost: 0,
    });
  }
  try {
    const phrases = new Map(cities.map((c) => [c.id, cityKeyword(keyword, c.name)]));
    const { difficulty, cost } = await fetchCityDifficulty([...new Set(phrases.values())]);
    return Response.json({
      results: Object.fromEntries(cities.map((c) => [c.id, difficulty.get(phrases.get(c.id)!) ?? null])),
      cost,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Keyword difficulty request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
