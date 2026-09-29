import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";

/** Per-request Supabase client bound to the auth cookies. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes them.
        }
      },
    },
  });
}

/**
 * Guard for API routes that spend DataForSEO credits. Returns a 401 response when
 * Supabase is configured and the request has no signed-in user; null when allowed.
 */
export async function requireUser(): Promise<Response | null> {
  if (!supabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  return null;
}

export async function currentUserEmail(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
