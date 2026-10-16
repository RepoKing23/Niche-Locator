"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRICES } from "@/lib/api";
import type { KeywordIdea } from "@/lib/dataforseo";
import { getKeywordIdeas } from "@/lib/fetchers";
import { organicLabel } from "@/lib/scoring";
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

const ADS_TONE = {
  HIGH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  LOW: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
} as const;

/** Ads competition badge: High = many advertisers bid on it (a strong ads market). */
function AdsLevel({ idea }: { idea: KeywordIdea }) {
  // Ideas cached before this column existed have no competition field.
  if (!idea.competition) return <span title="No Google Ads competition data">–</span>;
  const label = idea.competition === "MEDIUM" ? "Med" : idea.competition === "HIGH" ? "High" : "Low";
  const title = `Google Ads competition ${idea.competitionIndex ?? "?"}/100${idea.cpc != null ? ` · CPC $${idea.cpc.toFixed(2)}` : ""}`;
  return <span className={`rounded px-1 text-[10px] font-medium ${ADS_TONE[idea.competition]}`} title={title}>{label}</span>;
}

const ORGANIC_TONE = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  High: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
} as const;

/** Organic competition from keyword difficulty: Low (<30) is easy to rank for, High (60+) is hard. */
function OrganicLevel({ difficulty }: { difficulty: number | null }) {
  const label = organicLabel(difficulty);
  if (label === "Unknown") return <span title="No keyword difficulty data">–</span>;
  return (
    <span className="whitespace-nowrap" title={`Keyword difficulty ${difficulty}/100`}>
      <span className={`rounded px-1 text-[10px] font-medium ${ORGANIC_TONE[label]}`}>{label === "Medium" ? "Med" : label}</span>
      <span className="ml-1 inline-block w-4 tabular-nums">{difficulty}</span>
    </span>
  );
}

type SortKey = "keyword" | "searchVolume" | "cpc" | "ads" | "organic";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

const SORT_VALUE: Record<SortKey, (i: KeywordIdea) => string | number | null> = {
  keyword: (i) => i.keyword,
  searchVolume: (i) => i.searchVolume,
  cpc: (i) => i.cpc,
  ads: (i) => i.competitionIndex,
  organic: (i) => i.difficulty,
};

/** Sorted copy; keywords without a value always go last. */
export function sortIdeas(ideas: KeywordIdea[], sort: Sort): KeywordIdea[] {
  if (!sort) return ideas;
  const get = SORT_VALUE[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...ideas].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return sign * (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number));
  });
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
  const [sort, setSort] = useState<Sort>(null);
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

  const loaded = state?.seed === seed ? state.ideas : null;
  const ideas = useMemo(() => sortIdeas(loaded ?? [], sort), [loaded, sort]);
  // First click sorts the natural way (A→Z, otherwise highest first), second click reverses, third clears.
  const sortBy = (key: SortKey) => setSort((cur) => {
    const first = key === "keyword" ? "asc" : "desc";
    if (cur?.key !== key) return { key, dir: first };
    return cur.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null;
  });
  const Th = ({ k, label, title, right = true }: { k: SortKey; label: string; title?: string; right?: boolean }) => (
    <th className={`font-normal ${right ? "text-right" : ""}`} title={title}
      aria-sort={sort?.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="whitespace-nowrap hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => sortBy(k)}>
        {label}{sort?.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
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
                <Th k="keyword" label="Keyword" right={false} title="Sort A→Z" />
                <Th k="searchVolume" label="Vol." title="US monthly searches · click to sort" />
                <Th k="cpc" label="CPC" title="Cost per click · click to sort" />
                <Th k="ads" label="Ads" title="Google Ads competition: how many advertisers bid on this keyword · click to sort" />
                <Th k="organic" label="Organic" title="Organic competition from keyword difficulty (0–100): Low < 30, Medium 30–59, High 60+ · click to sort" />
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
                    <td className="text-right"><AdsLevel idea={i} /></td>
                    <td className="text-right"><OrganicLevel difficulty={i.difficulty} /></td>
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
