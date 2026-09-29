import { z } from "zod";
import { dataForSeoLocationName, findCity } from "@/lib/cities";
import { getSerpTask, hasCredentials, parseSerp } from "@/lib/dataforseo";
import { cleanKeyword } from "@/lib/keywords";
import { mockSerp } from "@/lib/mock";
import { requireUser } from "@/lib/supabase/server";
import type { SerpInfo } from "@/lib/types";

export const maxDuration = 60;

const Body = z.object({
  keyword: z.string().trim().min(2).max(80),
  tasks: z.array(z.object({ cityId: z.string(), taskId: z.string().max(100) })).min(1).max(100),
});

/** Fetch finished queued SERP tasks (free). Returns results, still-pending city ids, and errors. */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const keyword = cleanKeyword(parsed.data.keyword);

  const results: Record<string, SerpInfo> = {};
  const pending: string[] = [];
  const errors: Record<string, string> = {};
  const live = hasCredentials();
  await Promise.all(parsed.data.tasks.map(async ({ cityId, taskId }) => {
    const city = findCity(cityId);
    if (!city) return void (errors[cityId] = "Unknown city");
    const location = dataForSeoLocationName(city);
    if (!live || taskId.startsWith("demo:")) return void (results[cityId] = mockSerp(keyword, location, city).serp);
    const state = await getSerpTask(taskId);
    if (state.state === "done") results[cityId] = parseSerp(keyword, location, city.name, state.items);
    else if (state.state === "pending") pending.push(cityId);
    else errors[cityId] = state.message;
  }));
  return Response.json({ results, pending, errors });
}
