import { z } from "zod";
import { dataForSeoLocationName, findCity, type City } from "@/lib/cities";
import { DataForSeoError, hasCredentials, postSerpTasks } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const Body = z.object({
  keyword: z.string().trim().min(2).max(80),
  cityIds: z.array(z.string()).min(1).max(1000),
});

/** Queue standard-priority SERP tasks (~$0.0006/city). Collect results later via /api/serp/collect. */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);
  const cities = parsed.data.cityIds.map(findCity).filter((c): c is City => Boolean(c));

  if (!hasCredentials()) {
    // Demo: fake task ids; collect returns mock SERPs.
    return Response.json({ tasks: cities.map((c) => ({ cityId: c.id, taskId: `demo:${c.id}` })), errors: {}, cost: 0 });
  }
  try {
    const r = await postSerpTasks(keyword, cities.map((c) => ({ id: c.id, location: dataForSeoLocationName(c) })));
    return Response.json(r);
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Could not queue SERP checks";
    return Response.json({ error: message }, { status: 502 });
  }
}
