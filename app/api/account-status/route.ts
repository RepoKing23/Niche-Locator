import { getCredentials } from "@/lib/credentials";
import { DataForSeoError, fetchAccount } from "@/lib/dataforseo";
import { requireUser } from "@/lib/supabase/server";

/** Which DataForSEO login the app is using, where it comes from, and how much credit is left. Free to call. */
export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;
  const creds = await getCredentials();
  if (!creds) return Response.json({ configured: false });
  const base = { configured: true, login: creds.login, source: creds.source };
  try {
    const account = await fetchAccount(creds);
    return Response.json({ ...base, ...account, login: account.login || creds.login });
  } catch (err) {
    console.error(err);
    const message = err instanceof DataForSeoError ? err.message : "Could not reach DataForSEO";
    return Response.json({ ...base, error: message }, { status: 502 });
  }
}
