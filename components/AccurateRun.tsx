"use client";

import { useRef, useState } from "react";
import { LOCAL_INTERVAL_MS, PRICES, SERP_BATCH, SERP_PARALLEL, postJson, sleep } from "@/lib/api";
import { chunk } from "@/lib/keywords";
import { refreshRow } from "@/lib/scoring";
import { getStore } from "@/lib/store";
import type { ListItem, LocalDemand, SerpInfo } from "@/lib/types";

type Props = {
  /** Saved rows to refresh (the selected rows, or all rows in the list). */
  items: ListItem[];
  mode: "live" | "demo";
  flash: (message: string) => void;
  /** Called with each batch of refreshed items as soon as it is saved. */
  onUpdated: (items: ListItem[]) => void;
};

/**
 * Runs exact DataForSEO checks on saved list rows only, so credits are spent on the
 * shortlist instead of every city.
 */
export default function AccurateRun({ items, mode, flash, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [doSerp, setDoSerp] = useState(true);
  const [doLocal, setDoLocal] = useState(true);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  const n = items.length;
  const cost = (doSerp ? n * PRICES.serp : 0) + (doLocal ? n * PRICES.local : 0);
  const minutes = doLocal && mode === "live" ? Math.ceil((n * LOCAL_INTERVAL_MS) / 60000) : 1;

  const save = async (updated: ListItem[]) => {
    const store = getStore();
    await Promise.all(updated.map((i) => store.updateItem(i.id, { row: i.row, serp: i.serp })));
    onUpdated(updated);
  };

  const run = async () => {
    if (!n || (!doSerp && !doLocal)) return;
    stopRef.current = false;
    // Work on a local copy so SERP and volume updates stack on the same row.
    const current = new Map(items.map((i) => [i.id, i]));
    let failures = 0;
    try {
      if (doSerp) {
        // One SERP request covers many cities for the same keyword.
        const byKeyword = new Map<string, ListItem[]>();
        items.forEach((i) => byKeyword.set(i.keyword, [...(byKeyword.get(i.keyword) ?? []), i]));
        const jobs = [...byKeyword.entries()].flatMap(([keyword, group]) =>
          chunk([...new Set(group.map((i) => i.cityId))], SERP_BATCH).map((cityIds) => ({ keyword, cityIds })),
        );
        let done = 0;
        setProgress({ label: "Live SERP check", done, total: n });
        for (const wave of chunk(jobs, SERP_PARALLEL)) {
          if (stopRef.current) break;
          await Promise.all(wave.map(async ({ keyword, cityIds }) => {
            const targets = items.filter((i) => i.keyword === keyword && cityIds.includes(i.cityId));
            try {
              const r = await postJson<{ results: Record<string, SerpInfo>; errors: Record<string, string> }>(
                "/api/serp", { keyword, cityIds },
              );
              const updated = targets.flatMap((t) => {
                const serp = r.results[t.cityId];
                if (!serp) {
                  failures++;
                  return [];
                }
                const prev = current.get(t.id)!;
                const next = { ...prev, serp, row: refreshRow(prev.row, { serp }) };
                current.set(t.id, next);
                return [next];
              });
              if (updated.length) await save(updated);
            } catch {
              failures += targets.length;
            }
            done += targets.length;
            setProgress({ label: "Live SERP check", done, total: n });
          }));
        }
      }

      if (doLocal && !stopRef.current) {
        const list = [...current.values()];
        for (let k = 0; k < list.length; k++) {
          if (stopRef.current) break;
          setProgress({ label: "Exact city volume & CPC (Google Ads)", done: k, total: list.length });
          const started = Date.now();
          const item = current.get(list[k].id)!;
          try {
            const variants = [...new Set([item.niche, item.keyword])].filter((v) => v.length >= 2);
            const r = await postJson<{ demand: LocalDemand }>("/api/local", { variants, cityId: item.cityId });
            const next = { ...item, row: refreshRow(item.row, { local: r.demand }) };
            current.set(item.id, next);
            await save([next]);
          } catch {
            failures++;
          }
          if (mode === "live" && k < list.length - 1) await sleep(Math.max(0, LOCAL_INTERVAL_MS - (Date.now() - started)));
        }
      }
      flash(stopRef.current
        ? "Stopped. Rows checked so far were saved."
        : `Updated ${n} row${n === 1 ? "" : "s"} with DataForSEO data${failures ? ` (${failures} checks failed)` : ""}.`);
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
        title="Run exact DataForSEO checks on these saved rows only">
        Accurate data ({n}) ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 space-y-2 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="font-semibold">Refresh {n} saved row{n === 1 ? "" : "s"} with DataForSEO</div>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={doSerp} onChange={(e) => setDoSerp(e.target.checked)} />
            <span>Live SERP check <span className="text-zinc-500">— organic difficulty, weak sites, map pack (~$0.002/row)</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={doLocal} onChange={(e) => setDoLocal(e.target.checked)} />
            <span>Exact city volume &amp; CPC <span className="text-zinc-500">— Google Ads data for each city (~$0.09/row, ~5 s each)</span></span>
          </label>
          <div className="rounded bg-zinc-50 p-2 dark:bg-zinc-800/60">
            Est. cost: <b>{mode === "demo" ? "$0 (demo data)" : `~$${cost.toFixed(2)}`}</b> · ~{minutes} min
          </div>
          <button className="btn-primary w-full" disabled={!doSerp && !doLocal} onClick={() => {
            if (mode === "live" && cost > 1 && !window.confirm(`This will cost about $${cost.toFixed(2)} in DataForSEO credits. Continue?`)) return;
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
