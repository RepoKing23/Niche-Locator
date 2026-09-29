"use client";

import { useMemo, useState } from "react";
import { CITIES, STATE_CODES, type City, type Tier } from "@/lib/cities";

type Props = {
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
  /** Shown in the footer, e.g. the cost estimate. */
  footer?: React.ReactNode;
};

const TIERS: Tier[] = ["Major", "Mid", "Small"];

const byState = (() => {
  const m = new Map<string, City[]>();
  for (const c of CITIES) {
    if (!m.has(c.stateCode)) m.set(c.stateCode, []);
    m.get(c.stateCode)!.push(c);
  }
  return m;
})();

/** Choose exactly which cities to research before spending API credits. */
export default function CityPicker({ selected, onChange, footer }: Props) {
  const [search, setSearch] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [minPop, setMinPop] = useState(0);
  const [topN, setTopN] = useState(10);
  const [open, setOpen] = useState<Set<string>>(new Set());

  /** Cities matching the picker's own filters (what "select all shown" acts on). */
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CITIES.filter((c) =>
      (!states.length || states.includes(c.stateCode)) &&
      (!tiers.length || tiers.includes(c.tier)) &&
      c.population >= minPop &&
      (!q || c.name.toLowerCase().includes(q)),
    );
  }, [search, states, tiers, minPop]);

  const shownByState = useMemo(() => {
    const m = new Map<string, City[]>();
    for (const c of shown) {
      if (!m.has(c.stateCode)) m.set(c.stateCode, []);
      m.get(c.stateCode)!.push(c);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);

  const set = (ids: Iterable<string>) => onChange(new Set(ids));
  const add = (cities: City[]) => set([...selected, ...cities.map((c) => c.id)]);
  const remove = (cities: City[]) => {
    const drop = new Set(cities.map((c) => c.id));
    set([...selected].filter((id) => !drop.has(id)));
  };
  const topPerState = () =>
    add(
      [...byState.entries()]
        .filter(([s]) => !states.length || states.includes(s))
        .flatMap(([, list]) => list.filter((c) => (!tiers.length || tiers.includes(c.tier)) && c.population >= minPop).slice(0, topN)),
    );

  const selectedCount = selected.size;
  const selectedStates = new Set([...selected].map((id) => id.slice(-2)));
  const toggleOpen = (s: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Search city
          <input className="input w-36" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Tampa" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          State
          <select className="input w-24" value="" onChange={(e) => e.target.value && setStates((s) => [...new Set([...s, e.target.value])])}>
            <option value="">Add…</option>
            {STATE_CODES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Min population
          <select className="input w-28" value={minPop} onChange={(e) => setMinPop(Number(e.target.value))}>
            {[0, 10000, 25000, 50000, 100000, 250000].map((p) => (
              <option key={p} value={p}>{p ? `${p.toLocaleString()}+` : "Any"}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          Market size
          <div className="flex gap-1">
            {TIERS.map((t) => (
              <button key={t} type="button"
                onClick={() => setTiers((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}
                className={`rounded px-2 py-1.5 text-xs ${tiers.includes(t) ? "bg-sky-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}
                title={t === "Major" ? "250k+ people" : t === "Mid" ? "50k–250k" : "Under 50k"}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      {states.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {states.map((s) => (
            <button key={s} type="button" onClick={() => setStates(states.filter((x) => x !== s))}
              className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">{s} ✕</button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1">
          Top
          <input type="number" min={1} max={500} className="input w-16" value={topN}
            onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))} />
          per state
          <button type="button" className="btn" onClick={topPerState}>Add</button>
        </span>
        <button type="button" className="btn" onClick={() => add(shown)}>Select all shown ({shown.length.toLocaleString()})</button>
        <button type="button" className="btn" onClick={() => remove(shown)}>Unselect shown</button>
        <button type="button" className="btn" onClick={() => set([])}>Clear</button>
      </div>

      <div className="max-h-72 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        {shownByState.map(([state, cities]) => {
          const picked = cities.filter((c) => selected.has(c.id)).length;
          const isOpen = open.has(state) || search.trim().length > 0;
          return (
            <div key={state} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
              <div className="flex items-center gap-2 px-2 py-1 text-sm">
                <input type="checkbox" aria-label={`Select all shown in ${state}`}
                  checked={picked === cities.length}
                  ref={(el) => { if (el) el.indeterminate = picked > 0 && picked < cities.length; }}
                  onChange={() => (picked === cities.length ? remove(cities) : add(cities))} />
                <button type="button" onClick={() => toggleOpen(state)} className="flex flex-1 items-center justify-between text-left">
                  <span><b>{state}</b> <span className="text-zinc-500">{cities[0].state}</span></span>
                  <span className="text-xs text-zinc-500">{picked}/{cities.length} {isOpen ? "▾" : "▸"}</span>
                </button>
              </div>
              {isOpen && (
                <div className="grid grid-cols-1 gap-x-3 px-8 pb-2 sm:grid-cols-2">
                  {cities.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.has(c.id)}
                        onChange={() => (selected.has(c.id) ? remove([c]) : add([c]))} />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-zinc-500">{c.population.toLocaleString()}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {shownByState.length === 0 && <div className="p-4 text-center text-sm text-zinc-500">No cities match.</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <b>{selectedCount.toLocaleString()}</b> cities selected in {selectedStates.size} states
          <span className="text-zinc-500"> · {CITIES.length.toLocaleString()} available</span>
        </span>
        {footer}
      </div>
    </div>
  );
}
