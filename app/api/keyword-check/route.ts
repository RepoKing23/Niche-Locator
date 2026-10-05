import { z } from "zod";
import { dataForSeoLocationName, findCity } from "@/lib/cities";
import {
  DataForSeoError, fetchCityDifficulty, fetchKeywordsInCity, hasCredentials, validAdsKeyword,
} from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockKeywordDifficulty, mockKeywordInCity } from "@/lib/mock";
import { requireUser } from "@/lib/supabase/server";
import type { KeywordMetrics } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  keywords: z.array(z.string()).min(1).max(1000),
  cityId: z.string(),
  /** Skip KD when it's already cached on the client. */
  withKd: z.boolean().default(true),
});

/**
 * Keyword Check: for pasted keywords in one city, return Google Ads data targeted to that city
 * (~$0.09 per 1,000 keywords) and DataForSEO Labs keyword difficulty (~$0.01 + $0.0001/keyword).
 */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const city = findCity(parsed.data.cityId);
  if (!city) return Response.json({ error: "Unknown city" }, { status: 400 });
  const keywords = [...new Set(parsed.data.keywords.map(cleanKeyword))].filter(validAdsKeyword);
  if (!keywords.length) return Response.json({ error: "No valid keywords (2–80 characters, up to 10 words)." }, { status: 400 });

  let ads: Record<string, KeywordMetrics | null>;
  let kd: Record<string, number | null> = {};
  let cost = 0;
  try {
    if (!hasCredentials()) {
      ads = Object.fromEntries(keywords.map((k) => [k, mockKeywordInCity(k, city)]));
      if (parsed.data.withKd) kd = Object.fromEntries(keywords.map((k) => [k, mockKeywordDifficulty(k)]));
    } else {
      const [a, d] = await Promise.all([
        fetchKeywordsInCity(keywords, dataForSeoLocationName(city)),
        parsed.data.withKd ? fetchCityDifficulty(keywords) : Promise.resolve({ difficulty: new Map<string, number | null>(), cost: 0 }),
      ]);
      ads = Object.fromEntries(a.ads);
      kd = Object.fromEntries(d.difficulty);
      cost = a.cost + d.cost;
    }
    return Response.json({ keywords, ads, kd, cost });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Keyword check failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
