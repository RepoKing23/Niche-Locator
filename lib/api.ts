/** Browser helpers for the app's DataForSEO API routes. */

/** Approximate DataForSEO cost per unit (USD) for estimates shown in the UI. */
export const PRICES = {
  niche: 0.1,
  serp: 0.002,
  serpQueued: 0.0006,
  kdRequest: 0.01,
  kdKeyword: 0.0001,
  /** Google Ads search_volume: flat per request of up to 1,000 phrases. */
  cityAdsRequest: 0.09,
  local: 0.09,
  /** DataForSEO Labs Keyword Overview (ads metrics + KD): per request + per keyword returned. */
  labsRequest: 0.01,
  labsKeyword: 0.0001,
};

/** Niche snapshot cost by ads data source (Labs = one overview call; Google Ads = ads + KD calls). */
export const nicheCost = (source: "labs" | "ads", variants = 10) =>
  source === "labs" ? PRICES.labsRequest + variants * PRICES.labsKeyword : PRICES.niche;

/** City ads data for n city phrases (Labs includes keyword difficulty). */
export const cityAdsCost = (source: "labs" | "ads", n: number) =>
  n === 0 ? 0 : source === "labs" ? Math.ceil(n / 700) * PRICES.labsRequest + n * PRICES.labsKeyword
    : Math.ceil(n / 1000) * PRICES.cityAdsRequest;

/** Estimated DataForSEO cost of city ads + organic data for n cities (before cache hits). */
export function organicCost(mode: "kd" | "queued" | "live" | "estimate", n: number, source: "labs" | "ads" = "labs"): number {
  if (mode === "estimate" || n === 0) return 0;
  const requests = Math.ceil(n / 1000);
  const kd = cityAdsCost(source, n) + (source === "labs" ? 0 : requests * PRICES.kdRequest + n * PRICES.kdKeyword);
  if (mode === "kd") return kd;
  return kd + n * (mode === "queued" ? PRICES.serpQueued : PRICES.serp);
}

/** Polling interval for queued SERP tasks. */
export const QUEUE_POLL_MS = { live: 20_000, demo: 800 };
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
