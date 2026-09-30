"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CityPicker from "./CityPicker";
import DataTable, { type ActionContext } from "./DataTable";
import SaveToList from "./SaveToList";
import SnapshotPanel from "./SnapshotPanel";
import { LOCAL_INTERVAL_MS, PRICES, QUEUE_POLL_MS, organicCost, postJson, sleep } from "@/lib/api";
import { cacheKey } from "@/lib/cache";
import { collectQueued, getCityAds, getCityKd, getLiveSerps, getLocal, getQueuedSerps, pendingTasks, type Batch } from "@/lib/fetchers";
import { CITIES, findCity } from "@/lib/cities";
import { cleanKeyword, suggestVariants } from "@/lib/keywords";
import { buildCityRow } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { CityRow, KeywordMetrics, NicheSnapshot, OrganicMode, Report, SavedReportMeta, SerpInfo } from "@/lib/types";

const CITY_SELECTION_KEY = "niche-locator:selected-cities";
const DEFAULT_CITY_IDS = CITIES.slice(0, 50).map((c) => c.id);

type Progress = { label: string; done: number; total: number };

// Last city selection, remembered per browser (read via useSyncExternalStore to stay hydration-safe).
const selectionListeners = new Set<() => void>();
function readSelectionRaw(): string {
  try {
    return localStorage.getItem(CITY_SELECTION_KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribeSelection(cb: () => void) {
  selectionListeners.add(cb);
  return () => selectionListeners.delete(cb);
}
function persistSelection(ids: Set<string>) {
  try {
    localStorage.setItem(CITY_SELECTION_KEY, JSON.stringify([...ids]));
  } catch {
    // Per-browser convenience only.
  }
  selectionListeners.forEach((cb) => cb());
}
function parseSelection(raw: string): Set<string> {
  try {
    const ids = raw ? (JSON.parse(raw) as string[]) : DEFAULT_CITY_IDS;
    return new Set(ids.filter((id) => findCity(id)));
  } catch {
    return new Set(DEFAULT_CITY_IDS);
  }
}


const ORGANIC_MODES: { value: OrganicMode; label: string; hint: string }[] = [
  { value: "kd", label: "City ads + keyword difficulty", hint: "city CPC & competition + Labs difficulty, ~$0.10 per 1,000 cities + $0.0001/city" },
  { value: "queued", label: "+ Queued SERP check", hint: "adds live top-10 analysis & ads seen on Google, ~$0.0006/city, 1–5 min" },
  { value: "live", label: "+ Live SERP check", hint: "same analysis, ~$0.002/city, results in seconds" },
  { value: "estimate", label: "Estimate only", hint: "free — national ads data, size-based organic guess" },
];

export default function NicheLocator({ mode }: { mode: "live" | "demo" }) {
  const [niche, setNiche] = useState("");
  const [variantsText, setVariantsText] = useState("");
  const [variantsEdited, setVariantsEdited] = useState(false);
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [exactLocal, setExactLocal] = useState(false);
  const [organicMode, setOrganicMode] = useState<OrganicMode>("kd");
  const [refresh, setRefresh] = useState(false);
  const [showPicker, setShowPicker] = useState(true);

  const selectionRaw = useSyncExternalStore(subscribeSelection, readSelectionRaw, () => "");
  const selectedCities = useMemo(() => parseSelection(selectionRaw), [selectionRaw]);

  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedReportMeta[]>([]);
  const cancelRef = useRef(false);
  const reportRef = useRef<Report | null>(null);

  /** Updates the report state and a ref in lockstep, so saving after a run sees the latest data. */
  const updateReport = useCallback((fn: (prev: Report | null) => Report | null) => {
    reportRef.current = fn(reportRef.current);
    setReport(reportRef.current);
  }, []);

  const refreshSaved = useCallback(async () => {
    try {
      setSaved(await getStore().listReports());
    } catch {
      // Saved reports are optional; the research flow still works.
    }
  }, []);

  useEffect(() => {
    void (async () => refreshSaved())();
  }, [refreshSaved]);

  const variants = useMemo(
    () => [...new Set(variantsText.split("\n").map(cleanKeyword).filter((v) => v.length >= 2))].slice(0, 20),
    [variantsText],
  );
  const primaryKeyword = variants[Math.min(primaryIdx, variants.length - 1)] ?? "";
  // Keep the picker's order (largest first) for the run.
  const cityIds = useMemo(() => CITIES.filter((c) => selectedCities.has(c.id)).map((c) => c.id), [selectedCities]);

  const onNicheChange = (value: string) => {
    setNiche(value);
    if (!variantsEdited) {
      setVariantsText(suggestVariants(value).join("\n"));
      setPrimaryIdx(0);
    }
  };

  const estCost = PRICES.niche + organicCost(organicMode, cityIds.length) + (exactLocal ? cityIds.length * PRICES.local : 0);
  const estMinutes = exactLocal
    ? Math.ceil((cityIds.length * LOCAL_INTERVAL_MS) / 60000)
    : organicMode === "queued" ? 5 : Math.max(1, Math.ceil(cityIds.length / 400));

  const saveReport = useCallback(async (r: Report) => {
    try {
      await getStore().saveReport(r);
      await refreshSaved();
    } catch (e) {
      setError(`Report not saved: ${(e as Error).message}`);
    }
  }, [refreshSaved]);

  const fetchOpts = useCallback(
    (force = false) => ({ store: getStore(), refresh: force || refresh, shouldStop: () => cancelRef.current }),
    [refresh],
  );

  /** Merge a batch of SERP results into the open report (only if it's for the report's keyword). */
  const applySerpBatch = useCallback((b: Batch<SerpInfo>, keyword: string) => {
    updateReport((prev) => prev && prev.primaryKeyword === keyword ? ({
      ...prev,
      serps: { ...prev.serps, ...b.results },
      errors: { ...Object.fromEntries(Object.entries(prev.errors).filter(([k]) => !(k in b.results))), ...b.errors },
      spent: prev.spent + b.cost,
      cachedHits: (prev.cachedHits ?? 0) + b.cached,
    }) : prev);
  }, [updateReport]);

  /** City-level Google Ads data + city keyword difficulty for every city, in parallel (cache first). */
  const runCityData = useCallback(async (keyword: string, ids: string[], force = false) => {
    const label = "Getting city Google Ads data + keyword difficulty";
    setProgress({ label, done: 0, total: ids.length });
    updateReport((prev) => prev && { ...prev, kdPending: true, adsPending: true });
    const [kd, ads] = await Promise.all([getCityKd(keyword, ids, fetchOpts(force)), getCityAds(keyword, ids, fetchOpts(force))]);
    updateReport((prev) => prev && ({
      ...prev,
      kds: { ...prev.kds, ...kd.results },
      ads: { ...prev.ads, ...ads.results },
      kdPending: false,
      adsPending: false,
      spent: prev.spent + kd.cost + ads.cost,
      cachedHits: (prev.cachedHits ?? 0) + kd.cached + ads.cached,
    }));
    const failed = [...new Set([...Object.keys(kd.errors), ...Object.keys(ads.errors)])].length;
    if (failed) {
      const msg = Object.values(kd.errors)[0] ?? Object.values(ads.errors)[0];
      setError(`City data unavailable for ${failed} cities (${msg}). They keep national/estimated values.`);
    }
    setProgress({ label, done: ids.length, total: ids.length });
  }, [fetchOpts, updateReport]);

  /** SERP checks: live (fast) or queued (cheap). Cache first. */
  const runSerps = useCallback(async (keyword: string, ids: string[], queued: boolean, force = false, demo = false) => {
    let done = 0;
    const label = queued ? "Queued SERP checks (cheaper) — waiting for DataForSEO" : "Checking live Google results";
    setProgress({ label, done, total: ids.length });
    updateReport((prev) => prev && { ...prev, serpPending: true });
    const onBatch = (b: Batch<SerpInfo>) => {
      applySerpBatch(b, keyword);
      done += Object.keys(b.results).length + Object.keys(b.errors).length;
      setProgress({ label, done, total: ids.length });
    };
    if (queued) {
      await getQueuedSerps(keyword, ids, {
        ...fetchOpts(force), pollMs: demo ? QUEUE_POLL_MS.demo : QUEUE_POLL_MS.live, onBatch,
        onQueued: (_n, cost) => updateReport((prev) => prev && { ...prev, spent: prev.spent + cost }),
      });
    } else {
      await getLiveSerps(keyword, ids, { ...fetchOpts(force), onBatch });
    }
    updateReport((prev) => prev && { ...prev, serpPending: false });
  }, [applySerpBatch, fetchOpts, updateReport]);

  /** Exact city-targeted Google Ads data, paced to Google's 12 requests/minute (cached cities are free and instant). */
  const runLocals = useCallback(async (vars: string[], ids: string[], live: boolean, force = false) => {
    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) return;
      setProgress({ label: "Fetching exact city search volume (Google Ads)", done: i, total: ids.length });
      const started = Date.now();
      let cached = false;
      try {
        const r = await getLocal(vars, ids[i], fetchOpts(force));
        cached = r.cached;
        updateReport((prev) => prev && ({
          ...prev,
          locals: { ...prev.locals, [ids[i]]: r.demand },
          spent: prev.spent + r.demand.cost,
          cachedHits: (prev.cachedHits ?? 0) + (r.cached ? 1 : 0),
        }));
      } catch (e) {
        setError(`${findCity(ids[i])?.name}: ${(e as Error).message}`);
      }
      if (live && !cached && i < ids.length - 1) await sleep(Math.max(0, LOCAL_INTERVAL_MS - (Date.now() - started)));
    }
  }, [fetchOpts, updateReport]);

  // Collect queued SERP tasks left over from an earlier session (already paid; results go into the cache).
  useEffect(() => {
    const leftover = pendingTasks.list();
    if (!leftover.length) return;
    void collectQueued(leftover, {
      store: getStore(), pollMs: mode === "demo" ? QUEUE_POLL_MS.demo : QUEUE_POLL_MS.live, onBatch: applySerpBatch,
    });
  }, [mode, applySerpBatch]);

  const finish = useCallback(() => {
    setProgress(null);
    if (reportRef.current) void saveReport(reportRef.current);
  }, [saveReport]);

  const run = async () => {
    setError("");
    if (cleanKeyword(niche).length < 2) return setError("Enter a niche, e.g. “stairway installer”.");
    if (!variants.length) return setError("Add at least one keyword variant.");
    if (!cityIds.length) return setError("Select at least one city.");
    if (mode === "live" && estCost > 5 && !window.confirm(`This run checks ${cityIds.length.toLocaleString()} cities and costs about $${estCost.toFixed(2)}. Continue?`)) return;
    cancelRef.current = false;
    setShowPicker(false);
    setProgress({ label: "Getting national ads & difficulty data", done: 0, total: 1 });
    let snapshot: NicheSnapshot;
    let apiMode: "live" | "demo";
    try {
      const r = await postJson<{ snapshot: NicheSnapshot; mode: "live" | "demo" }>("/api/niche", { niche, variants });
      snapshot = r.snapshot;
      apiMode = r.mode;
    } catch (e) {
      setProgress(null);
      return setError((e as Error).message);
    }
    updateReport(() => ({
      id: crypto.randomUUID(),
      organicMode,
      kds: {},
      ads: {},
      cachedHits: 0,
      mode: apiMode,
      niche: snapshot.niche,
      createdAt: new Date().toISOString(),
      snapshot,
      serps: {},
      locals: {},
      errors: {},
      cityIds,
      primaryKeyword,
      serpSkipped: organicMode === "kd" || organicMode === "estimate",
      spent: snapshot.cost,
    }));
    // City ads + KD first: cheap, city-specific, and the fallback for any city a SERP check can't cover.
    if (organicMode !== "estimate") await runCityData(primaryKeyword, cityIds);
    if (!cancelRef.current && (organicMode === "live" || organicMode === "queued")) {
      await runSerps(primaryKeyword, cityIds, organicMode === "queued", false, apiMode === "demo");
    }
    if (exactLocal && !cancelRef.current) await runLocals(variants, cityIds, apiMode === "live");
    finish();
  };

  /** Free: fill a reopened report with any SERP/KD results collected since it was saved. */
  const fillFromCache = async (r: Report) => {
    const store = getStore();
    const missSerp = r.cityIds.filter((id) => !r.serps[id]);
    const missKd = r.cityIds.filter((id) => r.kds?.[id] === undefined);
    const missAds = r.cityIds.filter((id) => r.ads?.[id] === undefined);
    try {
      const [serps, kds, adsHits] = await Promise.all([
        missSerp.length ? store.getCached("serp", missSerp.map((id) => cacheKey.serp(r.primaryKeyword, id))) : new Map(),
        missKd.length && r.organicMode && r.organicMode !== "estimate"
          ? store.getCached("kd", missKd.map((id) => cacheKey.kd(r.primaryKeyword, id))) : new Map(),
        missAds.length && r.organicMode && r.organicMode !== "estimate"
          ? store.getCached("ads", missAds.map((id) => cacheKey.ads(r.primaryKeyword, id))) : new Map(),
      ]);
      const adHits = Object.fromEntries(missAds.flatMap((id) => {
        const key = cacheKey.ads(r.primaryKeyword, id);
        return adsHits.has(key) ? [[id, adsHits.get(key) as KeywordMetrics | null]] : [];
      }));
      const serpHits = Object.fromEntries(missSerp.flatMap((id) => {
        const v = serps.get(cacheKey.serp(r.primaryKeyword, id));
        return v ? [[id, v as SerpInfo]] : [];
      }));
      const kdHits = Object.fromEntries(missKd.flatMap((id) => {
        const key = cacheKey.kd(r.primaryKeyword, id);
        return kds.has(key) ? [[id, kds.get(key) as number | null]] : [];
      }));
      if (Object.keys(serpHits).length || Object.keys(kdHits).length || Object.keys(adHits).length) {
        updateReport((prev) => prev && prev.id === r.id ? ({
          ...prev,
          serps: { ...prev.serps, ...serpHits },
          errors: Object.fromEntries(Object.entries(prev.errors).filter(([k]) => !(k in serpHits))),
          kds: { ...prev.kds, ...kdHits },
          ads: { ...prev.ads, ...adHits },
        }) : prev);
      }
    } catch {
      // cache is optional
    }
  };

  const openSaved = async (id: string) => {
    setError("");
    try {
      const r = await getStore().loadReport(id);
      if (r) {
        updateReport(() => ({ ...r, serpPending: false, kdPending: false }));
        setShowPicker(false);
        await fillFromCache(r);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rows: CityRow[] = useMemo(() => {
    if (!report) return [];
    return report.cityIds.flatMap((id) => {
      const city = findCity(id);
      if (!city) return [];
      const kd = report.kds?.[id];
      const status = report.serps[id] ? "done"
        : report.errors[id] ? "error"
          : report.serpPending || (report.kdPending && kd === undefined) ? "pending"
            : "skipped";
      return [buildCityRow(city, report.snapshot, report.primaryKeyword, report.serps[id] ?? null, report.locals[id] ?? null,
        status, kd ?? null, report.ads?.[id] ?? null)];
    });
  }, [report]);

  const busy = progress !== null;

  const confirmSpend = (count: number, each: number, what: string) =>
    report?.mode !== "live" || count * each < 1 ||
    window.confirm(`${what} for ${count.toLocaleString()} cities costs about $${(count * each).toFixed(2)}. Continue?`);

  /** Live SERP check for chosen rows; cached results are reused unless "refresh" is ticked. */
  const recheckSerp = async (ids: string[]) => {
    if (!report || !confirmSpend(ids.length, PRICES.serp, "Live SERP checks")) return;
    cancelRef.current = false;
    await runSerps(report.primaryKeyword, ids, false, false, report.mode === "demo");
    finish();
  };

  /** Queued SERP check only for rows that look like high ads + low organic but aren't SERP-confirmed yet. */
  const confirmTargets = async (candidates: CityRow[]) => {
    if (!report) return;
    const ids = candidates.filter((r) => (r.verdict === "Target" || r.verdict === "Target?") && r.status !== "done").map((r) => r.id);
    if (!ids.length) return setError("No unconfirmed Target rows to check.");
    if (!confirmSpend(ids.length, PRICES.serpQueued, "Confirming targets with queued SERP checks")) return;
    cancelRef.current = false;
    await runSerps(report.primaryKeyword, ids, true, false, report.mode === "demo");
    finish();
  };

  const fetchLocal = async (ids: string[]) => {
    if (!report || !confirmSpend(ids.length, PRICES.local, "Exact city volume")) return;
    cancelRef.current = false;
    await runLocals(report.snapshot.variants.map((v) => v.keyword), ids, report.mode === "live");
    finish();
  };

  const exportReport = async (ctx: ActionContext) => {
    if (!report) return;
    try {
      const { buildReportWorkbook, downloadWorkbook, reportFilename } = await import("@/lib/reportWorkbook");
      const wb = buildReportWorkbook({
        niche: report.niche, mode: report.mode, createdAt: report.createdAt, spent: report.spent,
        snapshot: report.snapshot, rows, view: ctx.target, filters: ctx.filters, serps: report.serps,
      });
      await downloadWorkbook(wb, reportFilename(report.niche, report.createdAt));
    } catch (e) {
      ctx.flash(`Report export failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-5">
      {mode === "demo" && (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Demo mode — sample data. Add DataForSEO credentials to <code>.env.local</code> for real results.
        </div>
      )}

      {/* Search form */}
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-medium">
            Niche
            <input className="input mt-1 w-full text-base" placeholder="e.g. stairway installer" value={niche}
              onChange={(e) => onNicheChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && run()} />
            <span className="mt-3 block">Keyword for SERP check</span>
            <select className="input mt-1 w-full" value={primaryIdx} onChange={(e) => setPrimaryIdx(Number(e.target.value))}>
              {variants.map((v, i) => <option key={v} value={i}>{v}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Keyword variants <span className="font-normal text-zinc-500">(one per line — used for ads data)</span>
            <textarea className="input mt-1 h-28 w-full font-mono text-xs" value={variantsText}
              onChange={(e) => { setVariantsText(e.target.value); setVariantsEdited(true); }} />
          </label>
          <div className="flex flex-col justify-between gap-3">
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">City data (ads + organic)</legend>
              {ORGANIC_MODES.map((m) => (
                <label key={m.value} className="flex items-start gap-2">
                  <input type="radio" name="organic-mode" className="mt-1" checked={organicMode === m.value}
                    onChange={() => setOrganicMode(m.value)} />
                  <span>{m.label} <span className="text-xs text-zinc-500">— {m.hint}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={exactLocal} onChange={(e) => setExactLocal(e.target.checked)} />
              <span>
                Fetch exact city search volume &amp; CPC from Google Ads
                <span className="block text-xs text-zinc-500">
                  ~$0.09 and ~5 s per city (Google limits 12 requests/min). Off = estimated from national data; you can fetch it
                  later for selected rows.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
              Refresh — ignore saved results (results under 30 days old are reused for free by default)
            </label>
            <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
              <div>{cityIds.length.toLocaleString()} cities · {variants.length} variants</div>
              <div>
                Est. cost: <b>{mode === "demo" ? "$0 (demo)" : `~$${estCost.toFixed(2)}`}</b> · ~{estMinutes} min
                {!refresh && mode === "live" && <span className="block text-xs text-zinc-500">Less if some cities are already cached.</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy} onClick={run}>{busy ? "Running…" : "Find opportunities"}</button>
              {busy && <button className="btn" onClick={() => { cancelRef.current = true; }}>Stop</button>}
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <button type="button" className="mb-2 text-sm font-medium" onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? "▾" : "▸"} Cities to research ({cityIds.length.toLocaleString()} selected)
          </button>
          {showPicker && (
            <CityPicker selected={selectedCities} onChange={persistSelection}
              footer={<span className="text-zinc-500">Est. {mode === "demo" ? "$0 (demo)" : `$${estCost.toFixed(2)}`}</span>} />
          )}
        </div>

        {saved.length > 0 && (
          <label className="block max-w-md text-sm">
            Saved reports
            <select className="input mt-1 w-full" value="" disabled={busy} onChange={(e) => e.target.value && openSaved(e.target.value)}>
              <option value="">Open a previous report…</option>
              {saved.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.niche} · {r.cityCount.toLocaleString()} cities · {new Date(r.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && <div className="rounded-md bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">{error}</div>}

      {progress && (
        <div className="space-y-1">
          <div className="text-sm">{progress.label} — {progress.done.toLocaleString()}/{progress.total.toLocaleString()}</div>
          <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800">
            <div className="h-2 rounded bg-sky-600 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {report && (
        <>
          {(report.cachedHits ?? 0) > 0 && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
              {report.cachedHits!.toLocaleString()} results reused from earlier checks — free.
            </div>
          )}
          <SnapshotPanel snapshot={report.snapshot} mode={report.mode} spent={report.spent} />
          <DataTable
            key={report.id}
            rows={rows}
            exportName={`${report.niche} niche report`}
            actions={(ctx) => (
              <>
                <button className="btn-primary" onClick={() => exportReport(ctx)}
                  title="Excel workbook: Summary, Shortlist, All Cities, Keyword Variants, SERP Details">
                  Full report (Excel)
                </button>
                <SaveToList count={ctx.target.length} flash={ctx.flash}
                  items={() => ctx.target.map((r) => ({
                    niche: report.niche, cityId: r.id, keyword: r.keyword, row: r, serp: report.serps[r.id] ?? null,
                  }))} />
                {(() => {
                  const n = ctx.target.filter((r) => (r.verdict === "Target" || r.verdict === "Target?") && r.status !== "done").length;
                  return (
                    <button className="btn border-emerald-600 text-emerald-700 dark:text-emerald-400" disabled={busy || !n}
                      onClick={() => confirmTargets(ctx.target)}
                      title="Queued SERP check (~$0.0006/city) only on Target / Target? rows that aren't SERP-checked yet">
                      Confirm targets ({n})
                    </button>
                  );
                })()}
                <button className="btn" disabled={busy || !ctx.target.length} onClick={() => fetchLocal(ctx.target.map((r) => r.id))}
                  title="Google Ads volume/CPC targeted to each city (~$0.09 per city, ~5 s each)">
                  Exact city volume
                </button>
                <button className="btn" disabled={busy || !ctx.target.length} onClick={() => recheckSerp(ctx.target.map((r) => r.id))}
                  title="Live Google top-10 check (~$0.002/city; cached results reused)">
                  Live SERP check
                </button>
              </>
            )}
          />
        </>
      )}
    </div>
  );
}
