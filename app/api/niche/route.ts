import { z } from "zod";
import { DataForSeoError, fetchNiche, hasCredentials } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockNiche } from "@/lib/mock";
import { buildSnapshot } from "@/lib/scoring";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  niche: z.string().trim().min(2).max(80),
  variants: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
});

/** National snapshot of the niche: CPC, bids, ads competition, volume and keyword difficulty. */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a niche and at least one keyword variant." }, { status: 400 });
  const variants = [...new Set(parsed.data.variants.map(cleanKeyword).filter((v) => v.length >= 2))];
  const live = hasCredentials();
  try {
    const { metrics, cost } = live ? await fetchNiche(variants) : mockNiche(variants);
    return Response.json({
      mode: live ? "live" : "demo",
      snapshot: buildSnapshot(cleanKeyword(parsed.data.niche), metrics, cost),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  console.error(err);
  const message = err instanceof DataForSeoError ? err.message : "Could not reach DataForSEO. Try again.";
  return Response.json({ error: message }, { status: 502 });
}
