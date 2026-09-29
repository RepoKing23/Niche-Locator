"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CityPicker from "./CityPicker";
import DataTable, { type ActionContext } from "./DataTable";
import SaveToList from "./SaveToList";
import SnapshotPanel from "./SnapshotPanel";
import { LOCAL_INTERVAL_MS, PRICES, SERP_BATCH, SERP_PARALLEL, postJson, sleep } from "@/lib/api";
import { CITIES, findCity } from "@/lib/cities";
import { chunk, cleanKeyword, suggestVariants } from "@/lib/keywords";
import { buildCityRow } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { CityRow, LocalDemand, NicheSnapshot, Report, SavedReportMeta, SerpInfo } from "@/lib/types";

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


export default function NicheLocator({ mode }: { mode: "live" | "demo" }) {
  const [niche, setNiche] = useState("");
  const [variantsText, setVariantsText] = useState("");
  const [variantsEdited, setVariantsEdited] = useState(false);
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [exactLocal, setExactLocal] = useState(false);
  const [liveSerp, setLiveSerp] = useState(true);
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

  const estCost = PRICES.niche + (liveSerp ? cityIds.length * PRICES.serp : 0) + (exactLocal ? cityIds.length * PRICES.local : 0);
  const estMinutes = exactLocal
    ? Math.ceil((cityIds.length * LOCAL_INTERVAL_MS) / 60000)
    : Math.max(1, Math.ceil(cityIds.length / (SERP_BATCH * SERP_PARALLEL) / 4));

  const saveReport = useCallback(async (r: Report) => {
    try {
      await getStore().saveReport(r);
      await refreshSaved();
    } catch (e) {
      setError(`Report not saved: ${(e as Error).message}`);
    }
  }, [refreshSaved]);

  /** Live SERP checks, SERP_BATCH cities per request, SERP_PARALLEL requests in flight. */
  const runSerps = useCallback(async (keyword: string, ids: string[]) => {
    const batches = chunk(ids, SERP_BATCH);
    let done = 0;
    setProgress({ label: "Checking live Google results", done, total: ids.length });
    for (const group of chunk(batches, SERP_PARALLEL)) {
      if (cancelRef.current) return;
      await Promise.all(
        group.map(async (batch) => {
          try {
            const r = await postJson<{ results: Record<string, SerpInfo>; errors: Record<string, string>; cost: number }>(
              "/api/serp", { keyword, cityIds: batch },
            );
            updateReport((prev) => prev && ({
              ...prev,
              serps: { ...prev.serps, ...r.results },
              errors: { ...Object.fromEntries(Object.entries(prev.errors).filter(([k]) => !(k in r.results))), ...r.errors },
              spent: prev.spent + r.cost,
            }));
          } catch (e) {
            const msg = (e as Error).message;
            updateReport((prev) => prev && ({ ...prev, errors: { ...prev.errors, ...Object.fromEntries(batch.map((id) => [id, msg])) } }));
          }
          done += batch.length;
          setProgress({ label: "Checking live Google results", done, total: ids.length });
        }),
      );
    }
  }, [updateReport]);

  /** Exact city-targeted Google Ads data, paced to Google's 12 requests/minute. */
  const runLocals = useCallback(async (vars: string[], ids: string[], live: boolean) => {
    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) return;
      setProgress({ label: "Fetching exact city search volume (Google Ads)", done: i, total: ids.length });
      const started = Date.now();
      try {
        const r = await postJson<{ demand: LocalDemand }>("/api/local", { variants: vars, cityId: ids[i] });
        updateReport((prev) => prev && ({
          ...prev,
          locals: { ...prev.locals, [ids[i]]: r.demand },
          spent: prev.spent + r.demand.cost,
        }));
      } catch (e) {
        setError(`${findCity(ids[i])?.name}: ${(e as Error).message}`);
      }
      if (live && i < ids.length - 1) await sleep(Math.max(0, LOCAL_INTERVAL_MS - (Date.now() - started)));
    }
  }, [updateReport]);

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
      mode: apiMode,
      niche: snapshot.niche,
      createdAt: new Date().toISOString(),
      snapshot,
      serps: {},
      locals: {},
      errors: {},
      cityIds,
      primaryKeyword,
      serpSkipped: !liveSerp,
      spent: snapshot.cost,
    }));
    if (liveSerp) await runSerps(primaryKeyword, cityIds);
    if (exactLocal) await runLocals(variants, cityIds, apiMode === "live");
    finish();
  };

  const openSaved = async (id: string) => {
    setError("");
    try {
      const r = await getStore().loadReport(id);
      if (r) {
        updateReport(() => r);
        setShowPicker(false);
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
      const status = report.serps[id] ? "done" : report.errors[id] ? "error" : report.serpSkipped ? "skipped" : "pending";
      return [buildCityRow(city, report.snapshot, report.primaryKeyword, report.serps[id] ?? null, report.locals[id] ?? null, status)];
    });
  }, [report]);

  const busy = progress !== null;

  const confirmSpend = (count: number, each: number, what: string) =>
    report?.mode !== "live" || count * each < 1 ||
    window.confirm(`${what} for ${count.toLocaleString()} cities costs about $${(count * each).toFixed(2)}. Continue?`);

  const recheckSerp = async (ids: string[]) => {
    if (!report || !confirmSpend(ids.length, PRICES.serp, "Re-checking SERPs")) return;
    cancelRef.current = false;
    await runSerps(report.primaryKeyword, ids);
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
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={liveSerp} onChange={(e) => setLiveSerp(e.target.checked)} />
              <span>
                Live SERP check for every city
                <span className="block text-xs text-zinc-500">
                  ~$0.002 per city. Off = cheap estimate-only scan (~$0.10 total): save the cities you like to a list and run
                  <b> Accurate data</b> on just those.
                </span>
              </span>
            </label>
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
            <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
              <div>{cityIds.length.toLocaleString()} cities · {variants.length} variants</div>
              <div>
                Est. cost: <b>{mode === "demo" ? "$0 (demo)" : `~$${estCost.toFixed(2)}`}</b> · ~{estMinutes} min
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
                <button className="btn" disabled={busy || !ctx.target.length} onClick={() => fetchLocal(ctx.target.map((r) => r.id))}
                  title="Google Ads volume/CPC targeted to each city (~$0.09 per city, ~5 s each)">
                  Exact city volume
                </button>
                <button className="btn" disabled={busy || !ctx.target.length} onClick={() => recheckSerp(ctx.target.map((r) => r.id))}>
                  Re-check SERP
                </button>
              </>
            )}
          />
        </>
      )}
    </div>
  );
}
