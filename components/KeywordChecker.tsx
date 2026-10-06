"use client";

import { useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import SaveToList from "./SaveToList";
import { PRICES, QUEUE_POLL_MS } from "@/lib/api";
import { CITIES, type City } from "@/lib/cities";
import { getKeywordCheck, getLiveSerps, getQueuedSerps, type Batch } from "@/lib/fetchers";
import { chunk, cleanKeyword } from "@/lib/keywords";
import { TARGET_ADS, TARGET_EASE, buildKeywordRow } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { CityRow, KeywordMetrics, SerpInfo } from "@/lib/types";

const MAX_KEYWORDS = 500;
const cityLabel = (c: City) => `${c.name}, ${c.stateCode}`;
const CITY_BY_LABEL = new Map(CITIES.map((c) => [cityLabel(c).toLowerCase(), c]));

/** Google Ads accepts keywords up to 80 characters and 10 words. */
const validKeyword = (k: string) => k.length >= 2 && k.length <= 80 && k.split(" ").length <= 10;

type SerpMode = "live" | "queued" | "off";

type Result = {
  city: City;
  keywords: string[];
  ads: Record<string, KeywordMetrics | null>;
  kd: Record<string, number | null>;
  serps: Record<string, SerpInfo>;
  errors: Record<string, string>;
  serpPending: boolean;
  spent: number;
  cached: number;
};

/** Paste keywords + pick a city → are ads strong there, and is organic competition hard? */
export default function KeywordChecker({ mode }: { mode: "live" | "demo" }) {
  const [text, setText] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [serpMode, setSerpMode] = useState<SerpMode>("live");
  const [refresh, setRefresh] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  const parsed = useMemo(() => {
    const all = [...new Set(text.split(/[\n,]+/).map(cleanKeyword).filter(Boolean))];
    return { valid: all.filter(validKeyword).slice(0, MAX_KEYWORDS), invalid: all.filter((k) => !validKeyword(k)), total: all.length };
  }, [text]);
  const city = CITY_BY_LABEL.get(cityInput.trim().toLowerCase()) ?? null;

  const n = parsed.valid.length;
  const requests = Math.max(1, Math.ceil(n / 1000));
  const estCost = n
    ? requests * (PRICES.cityAdsRequest + PRICES.kdRequest) + n * PRICES.kdKeyword +
      (serpMode === "live" ? n * PRICES.serp : serpMode === "queued" ? n * PRICES.serpQueued : 0)
    : 0;

  const run = async () => {
    setError("");
    if (!city) return setError("Pick a target city from the list (e.g. “Tampa, FL”).");
    if (!n) return setError("Paste at least one keyword (one per line).");
    if (mode === "live" && estCost > 2 && !window.confirm(`Checking ${n} keywords costs up to about $${estCost.toFixed(2)}. Continue?`)) return;
    stopRef.current = false;
    const opts = { store: getStore(), refresh, shouldStop: () => stopRef.current };
    const keywords = parsed.valid;
    setResult(null);
    setProgress({ label: `Google Ads data in ${cityLabel(city)} + keyword difficulty`, done: 0, total: keywords.length });
    let base: Result;
    try {
      const d = await getKeywordCheck(keywords, city.id, opts);
      base = {
        city, keywords, ads: d.ads, kd: d.kd, serps: {}, errors: {}, serpPending: serpMode !== "off",
        spent: d.cost, cached: d.cached,
      };
      setResult(base);
    } catch (e) {
      setProgress(null);
      return setError((e as Error).message);
    }

    if (serpMode !== "off") {
      let done = 0;
      const label = serpMode === "live" ? `Live Google results in ${cityLabel(city)}` : "Queued SERP checks — waiting for DataForSEO";
      setProgress({ label, done, total: keywords.length });
      const onBatch = (keyword: string) => (b: Batch<SerpInfo>) => {
        const serp = b.results[city.id];
        const err = b.errors[city.id];
        if (serp || err) done++;
        setProgress({ label, done, total: keywords.length });
        setResult((prev) => prev && ({
          ...prev,
          serps: serp ? { ...prev.serps, [keyword]: serp } : prev.serps,
          errors: err ? { ...prev.errors, [keyword]: err } : prev.errors,
          spent: prev.spent + b.cost,
          cached: prev.cached + b.cached,
        }));
      };
      for (const group of chunk(keywords, serpMode === "live" ? 5 : 20)) {
        if (stopRef.current) break;
        await Promise.all(group.map((k) => serpMode === "live"
          ? getLiveSerps(k, [city.id], { ...opts, onBatch: onBatch(k) })
          : getQueuedSerps(k, [city.id], {
            ...opts, pollMs: mode === "demo" ? QUEUE_POLL_MS.demo : QUEUE_POLL_MS.live, onBatch: onBatch(k),
            onQueued: (_n, cost) => setResult((prev) => prev && { ...prev, spent: prev.spent + cost }),
          })));
      }
      setResult((prev) => prev && { ...prev, serpPending: false });
    }
    setProgress(null);
  };

  const rows: CityRow[] = useMemo(() => {
    if (!result) return [];
    return result.keywords.map((k) => {
      const status = result.serps[k] ? "done" : result.errors[k] ? "error" : result.serpPending ? "pending" : "skipped";
      return buildKeywordRow(result.city, k, result.ads[k] ?? null, result.kd[k] ?? null, result.serps[k] ?? null, status);
    });
  }, [result]);

  const summary = useMemo(() => ({
    strongAds: rows.filter((r) => (r.adsScore ?? 0) >= TARGET_ADS).length,
    noAds: rows.filter((r) => !r.cpc && r.competitionIndex == null).length,
    easy: rows.filter((r) => r.organicDifficulty != null && (r.organicEase ?? 0) >= TARGET_EASE).length,
    hard: rows.filter((r) => r.organicDifficulty != null && (r.organicEase ?? 100) < 40).length,
    targets: rows.filter((r) => r.verdict === "Target").length,
  }), [rows]);

  const busy = progress !== null;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm font-medium md:col-span-2">
          Keywords <span className="font-normal text-zinc-500">(one per line or comma-separated, up to {MAX_KEYWORDS})</span>
          <textarea className="input mt-1 h-48 w-full font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"stair lift installation\nstair lift repair\ncurved stair lift cost\nwheelchair ramp installer"} />
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            {n} keyword{n === 1 ? "" : "s"}{parsed.invalid.length > 0 && ` · ${parsed.invalid.length} skipped (over 80 characters or 10 words)`}
            {parsed.total > MAX_KEYWORDS && ` · only the first ${MAX_KEYWORDS} are checked`}
          </span>
        </label>
        <div className="flex flex-col gap-3">
          <label className="block text-sm font-medium">
            Target city
            <input className="input mt-1 w-full" list="kc-cities" placeholder="Start typing, e.g. Tampa, FL" value={cityInput}
              onChange={(e) => setCityInput(e.target.value)} />
            <datalist id="kc-cities">
              {CITIES.map((c) => <option key={c.id} value={cityLabel(c)} />)}
            </datalist>
            {cityInput && !city && <span className="text-xs text-rose-600">Pick a city from the list.</span>}
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium">Organic check</legend>
            {([
              ["live", "Live SERP check", "real top 10 + ads shown in this city, ~$0.002/keyword"],
              ["queued", "Queued SERP check", "same, ~$0.0006/keyword, 1–5 min"],
              ["off", "Keyword difficulty only", "cheapest, national KD"],
            ] as const).map(([v, label, hint]) => (
              <label key={v} className="flex items-start gap-2">
                <input type="radio" name="kc-serp" className="mt-1" checked={serpMode === v} onChange={() => setSerpMode(v)} />
                <span>{label} <span className="text-xs text-zinc-500">— {hint}</span></span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
            Refresh — ignore results cached in the last 30 days
          </label>
          <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
            Est. cost: <b>{mode === "demo" ? "$0 (demo)" : `~$${estCost.toFixed(3)}`}</b>
            <span className="block text-xs text-zinc-500">Ads data ~$0.09 per 1,000 keywords · cached results are free</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={run}>{busy ? "Checking…" : "Check keywords"}</button>
            {busy && <button className="btn" onClick={() => { stopRef.current = true; }}>Stop</button>}
          </div>
        </div>
      </section>

      {error && <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">{error}</div>}

      {progress && (
        <div className="space-y-1">
          <div className="text-sm">{progress.label} — {progress.done}/{progress.total}</div>
          <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800">
            <div className="h-2 rounded bg-sky-600 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {result && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["City", cityLabel(result.city)],
              ["Strong ads (Ads Score ≥ 60)", `${summary.strongAds} / ${rows.length}`],
              ["No ads data", String(summary.noAds)],
              ["Easy organic (Ease ≥ 60)", String(summary.easy)],
              ["Hard organic (Ease < 40)", String(summary.hard)],
              ["Targets", String(summary.targets)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="text-lg font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </section>
          {result.cached > 0 && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
              {result.cached} results reused from earlier checks — free. Spent this check: ${result.spent.toFixed(3)}
            </div>
          )}
          <DataTable
            key={`${result.city.id}:${result.keywords.length}:${result.keywords[0]}`}
            storageKey="check"
            rows={rows}
            exportName={`keyword check ${cityLabel(result.city)}`}
            actions={(ctx) => (
              <SaveToList count={ctx.target.length} flash={ctx.flash}
                items={() => ctx.target.map((r) => ({
                  niche: r.keyword, cityId: result.city.id, keyword: r.keyword, row: { ...r, id: result.city.id },
                  serp: result.serps[r.keyword] ?? null,
                }))} />
            )}
          />
        </>
      )}
    </div>
  );
}
