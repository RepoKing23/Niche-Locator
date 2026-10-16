"use client";

import { useEffect, useRef, useState } from "react";
import { PRICES } from "@/lib/api";
import type { KeywordIdea } from "@/lib/dataforseo";
import { getKeywordIdeas } from "@/lib/fetchers";
import { getStore } from "@/lib/store";

const AUTO_KEY = "niche-locator:auto-ideas";
/** Two Labs requests (suggestions + related, each billed ~$0.0125 in practice) and up to 30 ideas each. */
const IDEAS_COST = 2 * (PRICES.labsRequest + 0.0025) + 60 * PRICES.labsKeyword;

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

type State = { seed: string; ideas: KeywordIdea[] | null; error: string; cached: boolean };

/**
 * Side panel of keyword ideas (long-tail suggestions + related searches) for one keyword in the field.
 * The seed follows the last keyword added; ideas can be ticked and added to the field.
 */
export default function KeywordIdeas({ seed, seeds, existing, onSeedChange, onAdd, mode }: {
  seed: string | null;
  /** Keywords currently in the field, offered as seeds. */
  seeds: string[];
  existing: Set<string>;
  onSeedChange: (seed: string) => void;
  onAdd: (keywords: string[]) => void;
  mode: "live" | "demo";
}) {
  const [auto, setAuto] = useState(true);
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [spent, setSpent] = useState(0);
  // Ideas already loaded this session, so switching back to a seed is instant and free.
  const memo = useRef(new Map<string, { ideas: KeywordIdea[]; cached: boolean }>());

  useEffect(() => setAuto(readAuto()), []);

  const load = async (s: string) => {
    setPicked(new Set());
    const known = memo.current.get(s);
    if (known) return setState({ seed: s, ...known, error: "" });
    setState({ seed: s, ideas: null, error: "", cached: false });
    setLoading(true);
    try {
      const r = await getKeywordIdeas(s, { store: getStore() });
      memo.current.set(s, { ideas: r.ideas, cached: r.cached });
      setSpent((x) => x + r.cost);
      setState((prev) => (prev?.seed === s ? { seed: s, ideas: r.ideas, error: "", cached: r.cached } : prev));
    } catch (e) {
      setState((prev) => (prev?.seed === s ? { seed: s, ideas: null, error: (e as Error).message, cached: false } : prev));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!seed || state?.seed === seed) return;
    if (auto || memo.current.has(seed)) void load(seed);
    else setState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, auto]);

  const toggleAuto = (on: boolean) => {
    setAuto(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    } catch {
      // per-browser convenience only
    }
  };

  const ideas = state?.seed === seed ? state.ideas ?? [] : [];
  const addable = ideas.filter((i) => !existing.has(i.keyword));
  const toggle = (k: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
  const add = (keywords: string[]) => {
    if (!keywords.length) return;
    onAdd(keywords);
    setPicked(new Set());
  };
  const pickedNow = addable.filter((i) => picked.has(i.keyword)).map((i) => i.keyword);

  return (
    <div className="flex min-h-48 flex-col rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-800 dark:bg-zinc-800/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Keyword ideas</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400"
          title={`Fetch ideas automatically for each keyword you add (~$${IDEAS_COST.toFixed(3)} each, cached ideas are free)`}>
          <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} />
          Auto
        </label>
      </div>
      {seeds.length > 0 && (
        <label className="mt-1 flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          for
          <select className="input min-w-0 flex-1 py-0.5 text-xs" value={seed ?? ""} onChange={(e) => onSeedChange(e.target.value)}>
            {!seed && <option value="">Pick a keyword</option>}
            {seed && !seeds.includes(seed) && <option value={seed}>{seed}</option>}
            {seeds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      )}

      <div className="mt-2 flex-1 overflow-y-auto" style={{ maxHeight: "16rem" }}>
        {!seed && <p className="text-xs text-zinc-500">Add a keyword (press Enter after it) to see suggested and related keywords here.</p>}
        {seed && !auto && state?.seed !== seed && (
          <button className="btn w-full text-xs" onClick={() => load(seed)}>
            Get ideas for “{seed}” {mode === "live" && `(~$${IDEAS_COST.toFixed(3)})`}
          </button>
        )}
        {loading && state?.seed === seed && <p className="text-xs text-zinc-500">Finding ideas for “{seed}”…</p>}
        {state?.seed === seed && state.error && <p className="text-xs text-rose-600">{state.error}</p>}
        {state?.seed === seed && state.ideas && !state.ideas.length && (
          <p className="text-xs text-zinc-500">No ideas found for “{seed}”. Try a shorter or more general keyword.</p>
        )}
        {ideas.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="w-5" />
                <th className="font-normal">Keyword</th>
                <th className="text-right font-normal" title="US monthly searches">Vol.</th>
                <th className="text-right font-normal">CPC</th>
                <th className="text-right font-normal" title="Keyword difficulty (0–100)">KD</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((i) => {
                const added = existing.has(i.keyword);
                return (
                  <tr key={i.keyword} className={added ? "text-zinc-400" : "cursor-pointer hover:bg-white dark:hover:bg-zinc-900"}
                    onClick={() => !added && toggle(i.keyword)}>
                    <td><input type="checkbox" disabled={added} checked={added || picked.has(i.keyword)} readOnly /></td>
                    <td className="py-0.5">
                      {i.keyword}
                      {i.kind === "related" && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" title="Related search (doesn't contain your keyword)">rel</span>}
                      {added && <span className="ml-1 text-[10px]">added</span>}
                    </td>
                    <td className="text-right tabular-nums">{i.searchVolume?.toLocaleString() ?? "–"}</td>
                    <td className="text-right tabular-nums">{i.cpc != null ? `$${i.cpc.toFixed(2)}` : "–"}</td>
                    <td className="text-right tabular-nums">{i.difficulty ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {ideas.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn py-1 text-xs" disabled={!pickedNow.length} onClick={() => add(pickedNow)}>
            Add selected ({pickedNow.length})
          </button>
          <button className="btn py-1 text-xs" disabled={!addable.length} onClick={() => add(addable.map((i) => i.keyword))}>
            Add all ({addable.length})
          </button>
          <span className="ml-auto text-[11px] text-zinc-500">
            {state?.cached ? "cached, free" : mode === "demo" ? "demo data" : spent > 0 ? `ideas: $${spent.toFixed(3)}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
