"use client";

import { useRef, useState } from "react";
import AdsSourcePicker, { useAdsSource } from "./AdsSourcePicker";
import { LOCAL_INTERVAL_MS, PRICES, QUEUE_POLL_MS, sleep } from "@/lib/api";
import { getCityAds, getCityKd, getLiveSerps, getLocal, getQueuedSerps, type Batch } from "@/lib/fetchers";
import { refreshRow, withScores } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { ListItem, SerpInfo } from "@/lib/types";

type Props = {
  /** Saved rows to refresh (the selected rows, or all rows in the list). */
  items: ListItem[];
  mode: "live" | "demo";
  flash: (message: string) => void;
  /** Called with each batch of refreshed items as soon as it is saved. */
  onUpdated: (items: ListItem[]) => void;
};

type Progress = { label: string; done: number; total: number };

/**
 * Runs DataForSEO checks on saved list rows only, so credits are spent on the shortlist
 * instead of every city. Results younger than 30 days are reused from the cache for free.
 */
export default function AccurateRun({ items: allItems, mode, flash, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [doAds, setDoAds] = useState(true);
  const [doKd, setDoKd] = useState(true);
  const [serpMode, setSerpMode] = useState<"off" | "queued" | "live">("queued");
  const [doLocal, setDoLocal] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stopRef = useRef(false);

  const isTarget = (i: ListItem) => {
    const v = withScores(i.row).verdict;
    return v === "Target" || v === "Target?";
  };
  const targetCount = allItems.filter(isTarget).length;
  const items = onlyTargets ? allItems.filter(isTarget) : allItems;
  const n = items.length;
  const keywords = new Set(items.map((i) => i.keyword)).size;
  const source = useAdsSource();
  const labs = source === "labs";
  const cost =
    (doAds ? (labs ? keywords * PRICES.labsRequest + n * PRICES.labsKeyword : keywords * PRICES.cityAdsRequest) : 0) +
    // Labs ads data already includes keyword difficulty.
    (doKd && !(labs && doAds) ? keywords * PRICES.kdRequest + n * PRICES.kdKeyword : 0) +
    (serpMode === "queued" ? n * PRICES.serpQueued : serpMode === "live" ? n * PRICES.serp : 0) +
    (doLocal ? n * PRICES.local : 0);
  const minutes = doLocal && mode === "live" ? Math.ceil((n * LOCAL_INTERVAL_MS) / 60000) : serpMode === "queued" ? 5 : 1;

  const run = async () => {
    if (!n || (!doAds && !doKd && serpMode === "off" && !doLocal)) return;
    stopRef.current = false;
    const store = getStore();
    const opts = { store, refresh, shouldStop: () => stopRef.current, source };
    // Work on a local copy so KD, SERP and volume updates stack on the same row.
    const current = new Map(items.map((i) => [i.id, i]));
    let failures = 0;
    let cachedHits = 0;
    const byKeyword = new Map<string, ListItem[]>();
    items.forEach((i) => byKeyword.set(i.keyword, [...(byKeyword.get(i.keyword) ?? []), i]));

    const save = async (updated: ListItem[]) => {
      if (!updated.length) return;
      await Promise.all(updated.map((i) => store.updateItem(i.id, { row: i.row, serp: i.serp })));
      onUpdated(updated);
    };
    const apply = (keyword: string, cityId: string, fn: (i: ListItem) => ListItem) =>
      (byKeyword.get(keyword) ?? []).filter((i) => i.cityId === cityId).map((i) => {
        const next = fn(current.get(i.id)!);
        current.set(i.id, next);
        return next;
      });

    try {
      if (doAds) {
        setProgress({ label: "City Google Ads data", done: 0, total: n });
        for (const [keyword, group] of byKeyword) {
          if (stopRef.current) break;
          const r = await getCityAds(keyword, [...new Set(group.map((i) => i.cityId))], opts);
          cachedHits += r.cached;
          failures += Object.keys(r.errors).length;
          await save(Object.entries(r.results).flatMap(([cityId, ads]) =>
            ads ? apply(keyword, cityId, (i) => ({ ...i, row: refreshRow(i.row, { cityAds: ads }) })) : []));
        }
      }

      if (doKd && !stopRef.current) {
        setProgress({ label: "City keyword difficulty", done: 0, total: n });
        for (const [keyword, group] of byKeyword) {
          if (stopRef.current) break;
          // After a Labs ads step the KD is already cached, so read it from there.
          const r = await getCityKd(keyword, [...new Set(group.map((i) => i.cityId))], labs && doAds ? { ...opts, refresh: false } : opts);
          cachedHits += r.cached;
          failures += Object.keys(r.errors).length;
          await save(Object.entries(r.results).flatMap(([cityId, kd]) =>
            apply(keyword, cityId, (i) => ({ ...i, row: refreshRow(i.row, { cityKd: kd }) }))));
        }
      }

      if (serpMode !== "off" && !stopRef.current) {
        let done = 0;
        const label = serpMode === "queued" ? "Queued SERP check — waiting for DataForSEO" : "Live SERP check";
        setProgress({ label, done, total: n });
        for (const [keyword, group] of byKeyword) {
          if (stopRef.current) break;
          const onBatch = async (b: Batch<SerpInfo>) => {
            cachedHits += b.cached;
            failures += Object.keys(b.errors).length;
            const updated = Object.entries(b.results).flatMap(([cityId, serp]) =>
              apply(keyword, cityId, (i) => ({ ...i, serp, row: refreshRow(i.row, { serp }) })));
            done += updated.length + Object.keys(b.errors).length;
            setProgress({ label, done, total: n });
            await save(updated);
          };
          const cityIds = [...new Set(group.map((i) => i.cityId))];
          if (serpMode === "queued") {
            await getQueuedSerps(keyword, cityIds, {
              ...opts, pollMs: mode === "demo" ? QUEUE_POLL_MS.demo : QUEUE_POLL_MS.live, onBatch: (b) => void onBatch(b),
            });
          } else {
            await getLiveSerps(keyword, cityIds, { ...opts, onBatch: (b) => void onBatch(b) });
          }
        }
      }

      if (doLocal && !stopRef.current) {
        const list = [...current.values()];
        for (let k = 0; k < list.length; k++) {
          if (stopRef.current) break;
          setProgress({ label: "Exact city volume & CPC (Google Ads)", done: k, total: list.length });
          const started = Date.now();
          const item = current.get(list[k].id)!;
          let cached = false;
          try {
            const variants = [...new Set([item.niche, item.keyword])].filter((v) => v.length >= 2);
            const r = await getLocal(variants, item.cityId, opts);
            cached = r.cached;
            if (cached) cachedHits++;
            const next = { ...item, row: refreshRow(item.row, { local: r.demand }) };
            current.set(item.id, next);
            await save([next]);
          } catch {
            failures++;
          }
          if (mode === "live" && !cached && k < list.length - 1) await sleep(Math.max(0, LOCAL_INTERVAL_MS - (Date.now() - started)));
        }
      }
      const cacheNote = cachedHits ? ` · ${cachedHits} reused from cache (free)` : "";
      flash(stopRef.current
        ? `Stopped. Rows checked so far were saved${cacheNote}.`
        : `Updated ${n} row${n === 1 ? "" : "s"} with DataForSEO data${cacheNote}${failures ? ` · ${failures} checks without data` : ""}.`);
    } finally {
      setProgress(null);
      setOpen(false);
    }
  };

  if (progress) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>{progress.label}: {progress.done}/{progress.total}</span>
        <span className="h-2 w-24 rounded bg-zinc-200 dark:bg-zinc-800">
          <span className="block h-2 rounded bg-sky-600" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
        </span>
        <button className="btn" onClick={() => { stopRef.current = true; }}>Stop</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button className="btn border-emerald-600 text-emerald-700 dark:text-emerald-400" disabled={!n} onClick={() => setOpen((v) => !v)}
        title="Run DataForSEO checks on these saved rows only">
        Accurate data ({n}) ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-96 space-y-2 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="font-semibold">Refresh {n} saved row{n === 1 ? "" : "s"} with DataForSEO</div>
          <label className="flex items-start gap-2 rounded bg-emerald-50 p-2 dark:bg-emerald-900/30">
            <input type="checkbox" className="mt-1" checked={onlyTargets} onChange={(e) => setOnlyTargets(e.target.checked)} />
            <span>Only Target / Target? rows ({targetCount}) <span className="text-zinc-500">— spend only on cities that already look like high ads + low organic</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={doAds} onChange={(e) => setDoAds(e.target.checked)} />
            <span>City Google Ads data <span className="text-zinc-500">— city CPC, bids &amp; competition, {labs ? "~$0.01 per keyword + $0.0001/row (includes difficulty)" : "~$0.09 per keyword (up to 1,000 cities)"}</span></span>
          </label>
          {doAds && <div className="ml-6"><AdsSourcePicker name="ads-source-accurate" compact /></div>}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={doKd} onChange={(e) => setDoKd(e.target.checked)} />
            <span>City keyword difficulty <span className="text-zinc-500">— ~$0.0001/row (+$0.01 per keyword)</span></span>
          </label>
          <div className="space-y-1">
            <div>SERP check <span className="text-zinc-500">— weak sites, local competitors, map pack</span></div>
            {([
              ["queued", "Queued", "~$0.0006/row, results in 1–5 min"],
              ["live", "Live", "~$0.002/row, results in seconds"],
              ["off", "Skip", ""],
            ] as const).map(([v, label, hint]) => (
              <label key={v} className="ml-4 flex items-center gap-2">
                <input type="radio" name="serp-mode" checked={serpMode === v} onChange={() => setSerpMode(v)} />
                {label} {hint && <span className="text-xs text-zinc-500">{hint}</span>}
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={doLocal} onChange={(e) => setDoLocal(e.target.checked)} />
            <span>Exact city volume &amp; CPC <span className="text-zinc-500">— Google Ads, ~$0.09/row, ~5 s each</span></span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
            Refresh — ignore results cached in the last 30 days
          </label>
          <div className="rounded bg-zinc-50 p-2 dark:bg-zinc-800/60">
            Est. cost: <b>{mode === "demo" ? "$0 (demo data)" : `~$${cost.toFixed(3)}`}</b> · ~{minutes} min
            {!refresh && mode === "live" && <span className="block text-xs text-zinc-500">Cached results are free, so it may cost less.</span>}
          </div>
          <button className="btn-primary w-full" disabled={!n || (!doAds && !doKd && serpMode === "off" && !doLocal)} onClick={() => {
            if (mode === "live" && cost > 1 && !window.confirm(`This will cost up to about $${cost.toFixed(2)} in DataForSEO credits. Continue?`)) return;
            void run();
          }}>
            Run accurate check
          </button>
          <p className="text-xs text-zinc-500">Results are saved to the list. Notes are kept.</p>
        </div>
      )}
    </div>
  );
}
