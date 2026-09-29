/** Browser helpers for the app's DataForSEO API routes. */

/** Approximate DataForSEO cost per unit (USD) for estimates shown in the UI. */
export const PRICES = { niche: 0.1, serp: 0.002, local: 0.09 };
/** Google Ads live endpoints allow 12 requests/minute per account. */
export const LOCAL_INTERVAL_MS = 5200;
export const SERP_BATCH = 20;
export const SERP_PARALLEL = 5;

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Full reload so the proxy re-checks the (expired) session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401) window.location.assign("/login");
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
