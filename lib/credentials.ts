import { supabaseConfigured } from "./supabase/config";

export type Credentials = { login: string; password: string; source: "app" | "env" };

const TABLE = "dataforseo_credentials";
/** Credentials are read on every DataForSEO call; keep them briefly so a run doesn't hit Supabase each time. */
const TTL_MS = 30_000;
let cached: { value: Credentials | null; at: number } | null = null;

export function envCredentials(): Credentials | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return login && password ? { login, password, source: "env" } : null;
}

async function db() {
  const { createServerSupabase } = await import("./supabase/server");
  return createServerSupabase();
}

/** Login + password saved on the Account page, else the env vars, else null (demo mode). */
export async function getCredentials(): Promise<Credentials | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let saved: Credentials | null = null;
  if (supabaseConfigured) {
    try {
      const { data, error } = await (await db()).from(TABLE).select("login, password").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (data?.login && data?.password) saved = { login: data.login, password: data.password, source: "app" };
    } catch (err) {
      // Table not created yet or Supabase unreachable: use the env vars, but don't remember that.
      console.error(err);
      return envCredentials();
    }
  }
  const value = saved ?? envCredentials();
  cached = { value, at: Date.now() };
  return value;
}

/** Save new credentials for everyone, or pass null to go back to the env vars. */
export async function saveCredentials(creds: { login: string; password: string } | null): Promise<void> {
  const client = await db();
  const { error } = creds
    ? await client.from(TABLE).upsert({ id: 1, login: creds.login, password: creds.password, updated_at: new Date().toISOString() })
    : await client.from(TABLE).delete().eq("id", 1);
  if (error) throw new Error(error.message);
  cached = null;
}
