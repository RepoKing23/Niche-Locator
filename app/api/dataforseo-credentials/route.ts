import { z } from "zod";
import { saveCredentials } from "@/lib/credentials";
import { DataForSeoError, fetchAccount } from "@/lib/dataforseo";
import { supabaseConfigured } from "@/lib/supabase/config";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  login: z.string().trim().min(1).max(200),
  password: z.string().trim().min(1).max(200),
});

const NO_SUPABASE = "Saving a DataForSEO login in the app needs Supabase. Set the env vars instead.";

/** Check a new DataForSEO login + API password, then save it for the whole app. */
export async function POST(request: Request) {
  if (!supabaseConfigured) return Response.json({ error: NO_SUPABASE }, { status: 400 });
  const denied = await requireUser();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter the API login and API password." }, { status: 400 });
  try {
    // user_data is free, so testing the login first costs nothing.
    const account = await fetchAccount(parsed.data);
    await saveCredentials(parsed.data);
    return Response.json({ configured: true, source: "app", ...account, login: account.login || parsed.data.login });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message
      : err instanceof Error ? `Could not save: ${err.message}` : "Could not save the login";
    return Response.json({ error: message }, { status: 400 });
  }
}

/** Forget the saved login and go back to the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars. */
export async function DELETE() {
  if (!supabaseConfigured) return Response.json({ error: NO_SUPABASE }, { status: 400 });
  const denied = await requireUser();
  if (denied) return denied;
  try {
    await saveCredentials(null);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message : "Could not remove the login" }, { status: 400 });
  }
}
