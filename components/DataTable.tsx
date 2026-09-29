"use client";

import { useMemo, useState, type ReactNode } from "react";
import { COLUMNS, type Column } from "./columns";
import { downloadBlob, slugify, toCsv, toTsv, type Cell } from "@/lib/export";
import type { CityRow, OrganicLabel } from "@/lib/types";

type Filters = {
  search: string;
  states: string[];
  tiers: CityRow["tier"][];
  minPopulation: number | "";
  minVolume: number | "";
  minCpc: number | "";
  minAdsIndex: number | "";
  maxOrganic: number | "";
  minScore: number | "";
  organic: OrganicLabel[];
};

const EMPTY: Filters = {
  search: "", states: [], tiers: [], minPopulation: "", minVolume: "", minCpc: "", minAdsIndex: "",
  maxOrganic: "", minScore: "", organic: [],
};

/** "High ads / low organic" preset. */
const PRESET: Partial<Filters> = { minCpc: 5, minAdsIndex: 50, maxOrganic: 30 };

const PAGE_SIZE = 100;

export type ActionContext = {
  /** Rows an action should apply to: the selected rows when "Selected" scope is active, else all filtered rows. */
  target: CityRow[];
  scope: "selected" | "all";
  selected: CityRow[];
  filtered: CityRow[];
  /** Readable list of active filters (plus the selection), for report summaries. */
  filters: string[];
  flash: (message: string) => void;
  clearSelection: () => void;
};

type Props = {
  /** Row ids must be unique. */
  rows: CityRow[];
  /** Base name for exported files. */
  exportName: string;
  /** Columns shown before the standard ones (e.g. Niche, Note on the lists page). */
  extraColumns?: Column[];
  /** Extra free-text to match in the search box, per row id. */
  searchText?: (r: CityRow) => string;
  /** Page-specific buttons (save to list, full report, remove…). */
  actions?: (ctx: ActionContext) => ReactNode;
};

export default function DataTable({ rows, exportName, extraColumns = [], searchText, actions }: Props) {
  const allColumns = useMemo(() => [...extraColumns, ...COLUMNS], [extraColumns]);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set([...extraColumns, ...COLUMNS].filter((c) => c.defaultVisible).map((c) => c.key)),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scopePref, setScopePref] = useState<"selected" | "all">("selected");
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState("");
  const [showColumns, setShowColumns] = useState(false);

  const states = useMemo(() => [...new Set(rows.map((r) => r.stateCode))].sort(), [rows]);
  const columns = allColumns.filter((c) => visible.has(c.key));

  const filtered = useMemo(() => {
    const f = filters;
    const q = f.search.trim().toLowerCase();
    const col = allColumns.find((c) => c.key === sort.key) ?? allColumns[0];
    return rows
      .filter((r) => {
        if (q && !`${r.city} ${r.state} ${r.stateCode} ${r.keyword} ${searchText?.(r) ?? ""}`.toLowerCase().includes(q)) return false;
        if (f.states.length && !f.states.includes(r.stateCode)) return false;
        if (f.tiers.length && !f.tiers.includes(r.tier)) return false;
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
  }, [rows, filters, sort, allColumns, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(r.id)), [filtered, selected]);
  const scope: "selected" | "all" = selectedRows.length && scopePref === "selected" ? "selected" : "all";
  const target = scope === "selected" ? selectedRows : filtered;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const updateFilters = (f: Filters) => {
    setFilters(f);
    setPage(0);
  };

  const exportData = () => ({
    headers: columns.map((c) => c.label),
    data: target.map((r) => columns.map((c) => c.value(r))),
  });

  const copy = async () => {
    const { headers, data } = exportData();
    try {
      await navigator.clipboard.writeText(toTsv(headers, data));
      flash(`Copied ${data.length} rows — paste into Google Sheets or Excel.`);
    } catch {
      flash("Clipboard blocked by the browser. Use Export CSV instead.");
    }
  };

  const exportCsv = () => {
    const { headers, data } = exportData();
    downloadBlob(new Blob([toCsv(headers, data)], { type: "text/csv;charset=utf-8" }), `${slugify(exportName)}.csv`);
  };

  const exportXlsx = async () => {
    const { headers, data } = exportData();
    const { buildTableWorkbook, downloadWorkbook } = await import("@/lib/reportWorkbook");
    await downloadWorkbook(buildTableWorkbook(exportName, headers, data), `${slugify(exportName)}.xlsx`);
  };

  const toggleSort = (c: Column) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.numeric ? "desc" : "asc" }));

  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filterList = describeFilters(filters);
  if (scope === "selected") filterList.push(`Selected rows: ${selectedRows.length}`);
  const presetActive = Object.entries(PRESET).every(([k, v]) => filters[k as keyof Filters] === v);
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={() => updateFilters(presetActive ? EMPTY : { ...EMPTY, ...PRESET })}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${presetActive ? "bg-emerald-600 text-white" : "border border-emerald-600 text-emerald-700 dark:text-emerald-400"}`}
            title="CPC ≥ $5, Ads Index ≥ 50, Organic Difficulty ≤ 30 (edit the fields to fine-tune)"
          >
            {presetActive ? "✓ " : ""}High Ads / Low Organic
          </button>
          <Field label="Search">
            <input className="input w-40" placeholder="City, state, niche…" value={filters.search}
              onChange={(e) => updateFilters({ ...filters, search: e.target.value })} />
          </Field>
          <NumField label="Min CPC $" value={filters.minCpc} onChange={(v) => updateFilters({ ...filters, minCpc: v })} />
          <NumField label="Min Ads Index" value={filters.minAdsIndex} onChange={(v) => updateFilters({ ...filters, minAdsIndex: v })} />
          <NumField label="Max Organic Diff." value={filters.maxOrganic} onChange={(v) => updateFilters({ ...filters, maxOrganic: v })} />
          <NumField label="Min Searches" value={filters.minVolume} onChange={(v) => updateFilters({ ...filters, minVolume: v })} />
          <NumField label="Min Population" value={filters.minPopulation} onChange={(v) => updateFilters({ ...filters, minPopulation: v })} />
          <NumField label="Min Score" value={filters.minScore} onChange={(v) => updateFilters({ ...filters, minScore: v })} />
          <Field label="State">
            <select className="input w-28" value=""
              onChange={(e) => e.target.value && updateFilters({ ...filters, states: [...new Set([...filters.states, e.target.value])] })}>
              <option value="">Add…</option>
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Market Size">
            <div className="flex gap-1">
              {(["Major", "Mid", "Small"] as CityRow["tier"][]).map((t) => (
                <Chip key={t} on={filters.tiers.includes(t)} onClick={() => updateFilters({ ...filters, tiers: toggleIn(filters.tiers, t) })}>{t}</Chip>
              ))}
            </div>
          </Field>
          <Field label="Organic Comp.">
            <div className="flex gap-1">
              {(["Low", "Medium", "High"] as OrganicLabel[]).map((l) => (
                <Chip key={l} on={filters.organic.includes(l)} onClick={() => updateFilters({ ...filters, organic: toggleIn(filters.organic, l) })}>{l}</Chip>
              ))}
            </div>
          </Field>
          <button onClick={() => updateFilters(EMPTY)} className="px-2 py-2 text-sm text-zinc-500 underline">Reset</button>
        </div>
        {filters.states.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {filters.states.map((s) => (
              <button key={s} onClick={() => updateFilters({ ...filters, states: filters.states.filter((x) => x !== s) })}
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
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows
          {selectedRows.length > 0 && <> · <b>{selectedRows.length}</b> selected · <button className="underline" onClick={() => setSelected(new Set())}>clear</button></>}
        </span>
        <div className="flex items-center gap-1 rounded-md border border-zinc-300 p-0.5 text-sm dark:border-zinc-700" role="group" aria-label="Apply to">
          <span className="px-1.5 text-xs text-zinc-500">Apply to</span>
          <button onClick={() => setScopePref("selected")} disabled={!selectedRows.length}
            className={`rounded px-2 py-1 disabled:opacity-40 ${scope === "selected" ? "bg-sky-600 text-white" : ""}`}>
            Selected ({selectedRows.length})
          </button>
          <button onClick={() => setScopePref("all")}
            className={`rounded px-2 py-1 ${scope === "all" ? "bg-sky-600 text-white" : ""}`}>
            All ({filtered.length.toLocaleString()})
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {actions?.({ target, scope, selected: selectedRows, filtered, filters: filterList, flash, clearSelection: () => setSelected(new Set()) })}
          <button className="btn" onClick={copy}>Copy</button>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={exportXlsx}>Export table (Excel)</button>
          <div className="relative">
            <button className="btn" onClick={() => setShowColumns((v) => !v)}>Columns ▾</button>
            {showColumns && (
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {allColumns.map((c) => (
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
              <th className="px-2 py-2">
                <input type="checkbox" aria-label="Select all filtered rows" title="Select all filtered rows (all pages)"
                  checked={allSelected} onChange={toggleAll} />
              </th>
              {columns.map((c) => (
                <th key={c.key} title={c.help} onClick={() => toggleSort(c)}
                  className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-semibold ${c.numeric ? "text-right" : "text-left"}`}>
                  {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
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
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-zinc-500">No rows match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹ Prev</button>
          <span>Page {currentPage + 1} of {pages}</span>
          <button className="btn" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next ›</button>
        </div>
      )}
    </section>
  );
}

/** Human-readable list of active filters for report summaries. */
function describeFilters(f: Filters): string[] {
  const out: string[] = [];
  if (f.search.trim()) out.push(`Search: "${f.search.trim()}"`);
  if (f.states.length) out.push(`States: ${f.states.join(", ")}`);
  if (f.tiers.length) out.push(`Market size: ${f.tiers.join(", ")}`);
  if (f.minPopulation !== "") out.push(`Population ≥ ${f.minPopulation.toLocaleString("en-US")}`);
  if (f.minVolume !== "") out.push(`Monthly searches ≥ ${f.minVolume}`);
  if (f.minCpc !== "") out.push(`CPC ≥ $${f.minCpc}`);
  if (f.minAdsIndex !== "") out.push(`Ads index ≥ ${f.minAdsIndex}`);
  if (f.maxOrganic !== "") out.push(`Organic difficulty ≤ ${f.maxOrganic}`);
  if (f.minScore !== "") out.push(`Opportunity score ≥ ${f.minScore}`);
  if (f.organic.length) out.push(`Organic competition: ${f.organic.join(", ")}`);
  return out;
}

/** Sort comparator; empty values always go last. */
function compare(a: Cell, b: Cell, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b)) * dir;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded px-2 py-1.5 text-xs ${on ? "bg-sky-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
