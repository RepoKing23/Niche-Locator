import { z } from "zod";
import { dataForSeoLocationName, findCity, type City } from "@/lib/cities";
import { DataForSeoError, fetchSerp, hasCredentials } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockSerp } from "@/lib/mock";
import type { SerpInfo } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  keyword: z.string().trim().min(2).max(80),
  cityIds: z.array(z.string()).min(1).max(25),
});

/** Live Google top-10 analysis of one keyword in each requested city. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);
  const cities = parsed.data.cityIds.map(findCity).filter((c): c is City => Boolean(c));
  const live = hasCredentials();

  const results: Record<string, SerpInfo> = {};
  const errors: Record<string, string> = {};
  let cost = 0;
  await Promise.all(
    cities.map(async (city) => {
      const location = dataForSeoLocationName(city);
      try {
        const r = live ? await fetchSerp(keyword, location, city.name) : mockSerp(keyword, location, city);
        results[city.id] = r.serp;
        cost += r.cost;
      } catch (err) {
        console.error(err);
        errors[city.id] = err instanceof DataForSeoError ? err.message : "SERP request failed";
      }
    }),
  );
  return Response.json({ results, errors, cost });
}
