"use client";

import { useMemo, useState } from "react";
import { COLUMNS, type Column } from "./columns";
import { downloadBlob, slugify, toCsv, toTsv, type Cell } from "@/lib/export";
import type { CityRow, OrganicLabel } from "@/lib/types";

type Filters = {
  search: string;
  states: string[];
  minPopulation: number | "";
  minVolume: number | "";
  minCpc: number | "";
  minAdsIndex: number | "";
  maxOrganic: number | "";
  minScore: number | "";
  organic: OrganicLabel[];
};

const EMPTY: Filters = {
  search: "", states: [], minPopulation: "", minVolume: "", minCpc: "", minAdsIndex: "",
  maxOrganic: "", minScore: "", organic: [],
};

/** "High ads / low organic" preset. */
const PRESET: Partial<Filters> = { minCpc: 5, minAdsIndex: 50, maxOrganic: 30 };

type Props = {
  niche: string;
  rows: CityRow[];
  busy: boolean;
  onRecheckSerp: (cityIds: string[]) => void;
  onFetchLocal: (cityIds: string[]) => void;
};

export default function ResultsTable({ niche, rows, busy, onRecheckSerp, onFetchLocal }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [showColumns, setShowColumns] = useState(false);

  const states = useMemo(() => [...new Set(rows.map((r) => r.stateCode))].sort(), [rows]);
  const columns = COLUMNS.filter((c) => visible.has(c.key));

  const filtered = useMemo(() => {
    const f = filters;
    const q = f.search.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];
    return rows
      .filter((r) => {
        if (q && !`${r.city} ${r.state} ${r.stateCode} ${r.keyword}`.toLowerCase().includes(q)) return false;
        if (f.states.length && !f.states.includes(r.stateCode)) return false;
        if (f.minPopulation !== "" && r.population < f.minPopulation) return false;
        if (f.minVolume !== "" && r.searchVolume < f.minVolume) return false;
        if (f.minCpc !== "" && r.cpc < f.minCpc) return false;
        if (f.minAdsIndex !== "" && (r.competitionIndex ?? 0) < f.minAdsIndex) return false;
        if (f.maxOrganic !== "" && (r.organicDifficulty == null || r.organicDifficulty > f.maxOrganic)) return false;
        if (f.minScore !== "" && r.score < f.minScore) return false;
        if (f.organic.length && !f.organic.includes(r.organic)) return false;
        return true;
      })
      .sort((a, b) => compare(col.value(a), col.value(b), sort.dir === "asc" ? 1 : -1));
  }, [rows, filters, sort]);

  const exportRows = () => {
    const src = selected.size ? filtered.filter((r) => selected.has(r.id)) : filtered;
    return { headers: columns.map((c) => c.label), data: src.map((r) => columns.map((c) => c.value(r))) };
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const copy = async () => {
    const { headers, data } = exportRows();
    try {
      await navigator.clipboard.writeText(toTsv(headers, data));
      flash(`Copied ${data.length} rows — paste into Google Sheets or Excel.`);
    } catch {
      flash("Clipboard blocked by the browser. Use Export CSV instead.");
    }
  };

  const exportCsv = () => {
    const { headers, data } = exportRows();
    downloadBlob(new Blob([toCsv(headers, data)], { type: "text/csv;charset=utf-8" }), `${slugify(niche)}-niche-report.csv`);
  };

  const exportXlsx = async () => {
    const { headers, data } = exportRows();
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName: niche.slice(0, 31), headers, rows: data }),
    });
    if (!res.ok) return flash("Excel export failed.");
    downloadBlob(await res.blob(), `${slugify(niche)}-niche-report.xlsx`);
  };

  const toggleSort = (c: Column) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.numeric ? "desc" : "asc" }));

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectedIds = [...selected];
  const presetActive = Object.entries(PRESET).every(([k, v]) => filters[k as keyof Filters] === v);

  return (
    <section className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={() => setFilters(presetActive ? EMPTY : { ...EMPTY, ...PRESET })}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${presetActive ? "bg-emerald-600 text-white" : "border border-emerald-600 text-emerald-700 dark:text-emerald-400"}`}
            title="CPC ≥ $5, Ads Index ≥ 50, Organic Difficulty ≤ 30 (edit the fields to fine-tune)"
          >
            {presetActive ? "✓ " : ""}High Ads / Low Organic
          </button>
          <Field label="Search">
            <input className="input w-40" placeholder="City, state…" value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          </Field>
          <NumField label="Min CPC $" value={filters.minCpc} onChange={(v) => setFilters({ ...filters, minCpc: v })} />
          <NumField label="Min Ads Index" value={filters.minAdsIndex} onChange={(v) => setFilters({ ...filters, minAdsIndex: v })} />
          <NumField label="Max Organic Diff." value={filters.maxOrganic} onChange={(v) => setFilters({ ...filters, maxOrganic: v })} />
          <NumField label="Min Searches" value={filters.minVolume} onChange={(v) => setFilters({ ...filters, minVolume: v })} />
          <NumField label="Min Population" value={filters.minPopulation} onChange={(v) => setFilters({ ...filters, minPopulation: v })} />
          <NumField label="Min Score" value={filters.minScore} onChange={(v) => setFilters({ ...filters, minScore: v })} />
          <Field label="State">
            <select className="input w-28" value="" onChange={(e) => e.target.value && setFilters({ ...filters, states: [...new Set([...filters.states, e.target.value])] })}>
              <option value="">Add…</option>
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Organic Comp.">
            <div className="flex gap-1">
              {(["Low", "Medium", "High"] as OrganicLabel[]).map((l) => (
                <button key={l}
                  onClick={() => setFilters({ ...filters, organic: filters.organic.includes(l) ? filters.organic.filter((x) => x !== l) : [...filters.organic, l] })}
                  className={`rounded px-2 py-1.5 text-xs ${filters.organic.includes(l) ? "bg-sky-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <button onClick={() => setFilters(EMPTY)} className="px-2 py-2 text-sm text-zinc-500 underline">Reset</button>
        </div>
        {filters.states.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {filters.states.map((s) => (
              <button key={s} onClick={() => setFilters({ ...filters, states: filters.states.filter((x) => x !== s) })}
                className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                {s} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {filtered.length} of {rows.length} cities{selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn" onClick={copy}>Copy {selected.size ? "selected" : "table"}</button>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={exportXlsx}>Export Excel</button>
          <button className="btn" disabled={busy || !selected.size} onClick={() => onFetchLocal(selectedIds)}
            title="Google Ads volume/CPC targeted to each selected city (~$0.09 per city, ~5s each)">
            Get exact city volume
          </button>
          <button className="btn" disabled={busy || !selected.size} onClick={() => onRecheckSerp(selectedIds)}>Re-check SERP</button>
          <div className="relative">
            <button className="btn" onClick={() => setShowColumns((v) => !v)}>Columns ▾</button>
            {showColumns && (
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={visible.has(c.key)}
                      onChange={() => setVisible((v) => {
                        const n = new Set(v);
                        if (n.has(c.key)) n.delete(c.key);
                        else n.add(c.key);
                        return n;
                      })} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {toast && <div className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">{toast}</div>}

      {/* Table */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className="px-2 py-2"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} /></th>
              {columns.map((c) => (
                <th key={c.key} title={c.help} onClick={() => toggleSort(c)}
                  className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-semibold ${c.numeric ? "text-right" : "text-left"}`}>
                  {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={`border-t border-zinc-100 dark:border-zinc-800 ${selected.has(r.id) ? "bg-sky-50 dark:bg-sky-950/40" : "bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"}`}>
                <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Select ${r.city}`} checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-2 py-1.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                    {c.render ? c.render(r) : (c.value(r) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-zinc-500">No cities match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Sort comparator; empty values always go last. */
function compare(a: Cell, b: Cell, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b)) * dir;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
      {label}
      {children}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <Field label={label}>
      <input type="number" className="input w-24" value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
    </Field>
  );
}
