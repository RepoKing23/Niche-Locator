import { z } from "zod";
import { DataForSeoError, fetchKeywordIdeas, hasCredentials, validAdsKeyword } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockKeywordIdeas } from "@/lib/mock";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({ keyword: z.string().trim().min(2).max(80) });

/** Keyword ideas (long-tail suggestions + related searches) for one keyword, from DataForSEO Labs. */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);
  if (!validAdsKeyword(keyword)) return Response.json({ error: "Invalid keyword" }, { status: 400 });

  if (!hasCredentials()) return Response.json({ keyword, ...mockKeywordIdeas(keyword) });
  try {
    return Response.json({ keyword, ...(await fetchKeywordIdeas(keyword)) });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Keyword suggestions request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
