"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ResultsTable from "./ResultsTable";
import SnapshotPanel from "./SnapshotPanel";
import { CITIES, STATE_CODES, findCity } from "@/lib/cities";
import { downloadBlob } from "@/lib/export";
import { chunk, cleanKeyword, suggestVariants } from "@/lib/keywords";
import { buildCityRow } from "@/lib/scoring";
import type { CityRow, LocalDemand, NicheSnapshot, Report, SerpInfo } from "@/lib/types";

const PRICES = { niche: 0.1, serp: 0.002, local: 0.09 };
const LOCAL_INTERVAL_MS = 5200; // Google Ads: 12 requests/minute
const STORAGE_KEY = "niche-locator:reports";
const MAX_SAVED = 8;

type Progress = { label: string; done: number; total: number };

function readSavedRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseSaved(raw: string): Report[] {
  try {
    return JSON.parse(raw) as Report[];
  } catch {
    return [];
  }
}

const savedListeners = new Set<() => void>();
function subscribeSaved(cb: () => void) {
  savedListeners.add(cb);
  return () => savedListeners.delete(cb);
}

function persist(reports: Report[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, MAX_SAVED)));
  } catch {
    // Storage full or blocked — saved reports are a convenience only.
  }
  savedListeners.forEach((cb) => cb());
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function NicheLocator({ mode }: { mode: "live" | "demo" }) {
  const [niche, setNiche] = useState("");
  const [variantsText, setVariantsText] = useState("");
  const [variantsEdited, setVariantsEdited] = useState(false);
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [states, setStates] = useState<string[]>([]);
  const [minPop, setMinPop] = useState(0);
  const [maxCities, setMaxCities] = useState(50);
  const [exactLocal, setExactLocal] = useState(false);

  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const savedRaw = useSyncExternalStore(subscribeSaved, readSavedRaw, () => "[]");
  const saved = useMemo(() => parseSaved(savedRaw), [savedRaw]);
  const cancelRef = useRef(false);
  const reportRef = useRef<Report | null>(null);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const variants = useMemo(
    () => [...new Set(variantsText.split("\n").map(cleanKeyword).filter((v) => v.length >= 2))].slice(0, 20),
    [variantsText],
  );
  const primaryKeyword = variants[Math.min(primaryIdx, variants.length - 1)] ?? "";

  const cities = useMemo(
    () =>
      CITIES.filter((c) => (!states.length || states.includes(c.stateCode)) && c.population >= minPop).slice(0, maxCities),
    [states, minPop, maxCities],
  );

  const onNicheChange = (value: string) => {
    setNiche(value);
    if (!variantsEdited) {
      setVariantsText(suggestVariants(value).join("\n"));
      setPrimaryIdx(0);
    }
  };

  const estCost = PRICES.niche + cities.length * PRICES.serp + (exactLocal ? cities.length * PRICES.local : 0);
  const estMinutes = exactLocal ? Math.ceil((cities.length * LOCAL_INTERVAL_MS) / 60000) : 1;

  const saveReport = useCallback((r: Report) => {
    persist([r, ...parseSaved(readSavedRaw()).filter((x) => x.id !== r.id)]);
  }, []);

  /** Live SERP checks, 20 cities per request, 3 requests in flight. */
  const runSerps = useCallback(async (keyword: string, cityIds: string[]) => {
    const batches = chunk(cityIds, 20);
    let done = 0;
    setProgress({ label: "Checking live Google results", done, total: cityIds.length });
    for (const group of chunk(batches, 3)) {
      if (cancelRef.current) return;
      await Promise.all(
        group.map(async (ids) => {
          try {
            const r = await postJson<{ results: Record<string, SerpInfo>; errors: Record<string, string>; cost: number }>(
              "/api/serp", { keyword, cityIds: ids },
            );
            setReport((prev) => prev && ({
              ...prev,
              serps: { ...prev.serps, ...r.results },
              errors: { ...Object.fromEntries(Object.entries(prev.errors).filter(([k]) => !(k in r.results))), ...r.errors },
              spent: prev.spent + r.cost,
            }));
          } catch (e) {
            const msg = (e as Error).message;
            setReport((prev) => prev && ({ ...prev, errors: { ...prev.errors, ...Object.fromEntries(ids.map((id) => [id, msg])) } }));
          }
          done += ids.length;
          setProgress({ label: "Checking live Google results", done, total: cityIds.length });
        }),
      );
    }
  }, []);

  /** Exact city-targeted Google Ads data, paced to Google's 12 requests/minute. */
  const runLocals = useCallback(async (vars: string[], cityIds: string[], live: boolean) => {
    for (let i = 0; i < cityIds.length; i++) {
      if (cancelRef.current) return;
      setProgress({ label: "Fetching exact city search volume (Google Ads)", done: i, total: cityIds.length });
      const started = Date.now();
      try {
        const r = await postJson<{ demand: LocalDemand }>("/api/local", { variants: vars, cityId: cityIds[i] });
        setReport((prev) => prev && ({
          ...prev,
          locals: { ...prev.locals, [cityIds[i]]: r.demand },
          spent: prev.spent + r.demand.cost,
        }));
      } catch (e) {
        setError(`${findCity(cityIds[i])?.name}: ${(e as Error).message}`);
      }
      if (live && i < cityIds.length - 1) await sleep(Math.max(0, LOCAL_INTERVAL_MS - (Date.now() - started)));
    }
  }, []);

  const finish = useCallback(() => {
    setProgress(null);
    // Let the last state updates commit before saving.
    setTimeout(() => reportRef.current && saveReport(reportRef.current), 0);
  }, [saveReport]);

  const run = async () => {
    setError("");
    if (cleanKeyword(niche).length < 2) return setError("Enter a niche, e.g. “stairway installer”.");
    if (!variants.length) return setError("Add at least one keyword variant.");
    if (!cities.length) return setError("No cities match your location filters.");
    cancelRef.current = false;
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
    const cityIds = cities.map((c) => c.id);
    setReport({
      id: `${Date.now()}`,
      mode: apiMode,
      niche: snapshot.niche,
      createdAt: new Date().toISOString(),
      snapshot,
      serps: {},
      locals: {},
      errors: {},
      cityIds,
      primaryKeyword,
      spent: snapshot.cost,
    });
    await runSerps(primaryKeyword, cityIds);
    if (exactLocal) await runLocals(variants, cityIds, apiMode === "live");
    finish();
  };

  const recheckSerp = async (cityIds: string[]) => {
    if (!report) return;
    cancelRef.current = false;
    await runSerps(report.primaryKeyword, cityIds);
    finish();
  };

  const rows: CityRow[] = useMemo(() => {
    if (!report) return [];
    return report.cityIds.flatMap((id) => {
      const city = findCity(id);
      if (!city) return [];
      const status = report.serps[id] ? "done" : report.errors[id] ? "error" : "pending";
      return [buildCityRow(city, report.snapshot, report.primaryKeyword, report.serps[id] ?? null, report.locals[id] ?? null, status)];
    });
  }, [report]);

  const exportReport = async (view: CityRow[], filters: string[]) => {
    if (!report) return;
    const res = await fetch("/api/export/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        niche: report.niche,
        mode: report.mode,
        createdAt: report.createdAt,
        spent: report.spent,
        snapshot: report.snapshot,
        rows,
        view,
        filters,
        serps: report.serps,
      }),
    });
    if (!res.ok) throw new Error("Report export failed.");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "niche-report.xlsx";
    downloadBlob(await res.blob(), name);
  };

  const fetchLocal = async (cityIds: string[]) => {
    if (!report) return;
    cancelRef.current = false;
    await runLocals(report.snapshot.variants.map((v) => v.keyword), cityIds, report.mode === "live");
    finish();
  };


  const busy = progress !== null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Niche Locator</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Find US cities where a service niche has expensive ads but weak organic competition.
          </p>
        </div>
        {mode === "demo" ? (
          <span className="rounded-md bg-amber-100 px-3 py-1 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Demo mode — sample data. Add DataForSEO credentials to <code>.env.local</code> for real results.
          </span>
        ) : (
          <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
            Live · DataForSEO connected
          </span>
        )}
      </header>

      {/* Search form */}
      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Niche
            <input className="input mt-1 w-full text-base" placeholder="e.g. stairway installer" value={niche}
              onChange={(e) => onNicheChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && run()} />
          </label>
          <label className="block text-sm font-medium">
            Keyword variants <span className="font-normal text-zinc-500">(one per line — used for ads data)</span>
            <textarea className="input mt-1 h-28 w-full font-mono text-xs" value={variantsText}
              onChange={(e) => { setVariantsText(e.target.value); setVariantsEdited(true); }} />
          </label>
          <label className="block text-sm font-medium">
            Keyword for SERP check
            <select className="input mt-1 w-full" value={primaryIdx} onChange={(e) => setPrimaryIdx(Number(e.target.value))}>
              {variants.map((v, i) => <option key={v} value={i}>{v}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Locations</div>
          <label className="block text-sm">
            Number of cities (largest first): <b>{Math.min(maxCities, cities.length)}</b>
            <input type="range" min={5} max={CITIES.length} step={5} value={maxCities}
              onChange={(e) => setMaxCities(Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <label className="block text-sm">
            Min population
            <select className="input mt-1 w-full" value={minPop} onChange={(e) => setMinPop(Number(e.target.value))}>
              {[0, 150000, 250000, 500000, 1000000].map((p) => (
                <option key={p} value={p}>{p ? `${p.toLocaleString()}+` : "Any"}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            States <span className="text-zinc-500">(empty = all)</span>
            <select className="input mt-1 w-full" value="" onChange={(e) => e.target.value && setStates((s) => [...new Set([...s, e.target.value])])}>
              <option value="">Add a state…</option>
              {STATE_CODES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {states.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {states.map((s) => (
                <button key={s} onClick={() => setStates(states.filter((x) => x !== s))}
                  className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">{s} ✕</button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={exactLocal} onChange={(e) => setExactLocal(e.target.checked)} />
            <span>
              Fetch exact city search volume &amp; CPC from Google Ads
              <span className="block text-xs text-zinc-500">
                More accurate, but ~$0.09 and ~5 s per city (Google limits 12 requests/min). Off = volume estimated from national data;
                you can still fetch it later for selected rows.
              </span>
            </span>
          </label>
          <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
            <div>{cities.length} cities · {variants.length} variants</div>
            <div>
              Est. cost: <b>{mode === "demo" ? "$0 (demo)" : `~$${estCost.toFixed(2)}`}</b>
              {exactLocal && mode === "live" && <> · ~{estMinutes} min</>}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={run}>{busy ? "Running…" : "Find opportunities"}</button>
            {busy && <button className="btn" onClick={() => { cancelRef.current = true; }}>Stop</button>}
          </div>
          {saved.length > 0 && (
            <label className="block text-sm">
              Saved reports
              <select className="input mt-1 w-full" value="" disabled={busy}
                onChange={(e) => {
                  const r = saved.find((x) => x.id === e.target.value);
                  if (r) setReport(r);
                }}>
                <option value="">Open a previous report…</option>
                {saved.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.niche} · {r.cityIds.length} cities · {new Date(r.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
          )}
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

      {report && (
        <>
          <SnapshotPanel snapshot={report.snapshot} mode={report.mode} spent={report.spent} />
          <ResultsTable niche={report.niche} rows={rows} busy={busy} onRecheckSerp={recheckSerp} onFetchLocal={fetchLocal}
            onExportReport={exportReport} />
        </>
      )}
    </div>
  );
}
