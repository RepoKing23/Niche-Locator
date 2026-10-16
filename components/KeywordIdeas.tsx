"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRICES } from "@/lib/api";
import type { City } from "@/lib/cities";
import type { AdsSource, KeywordIdea } from "@/lib/dataforseo";
import { getKeywordCheck, getKeywordIdeas, type KeywordCheckData } from "@/lib/fetchers";
import { organicLabel } from "@/lib/scoring";
import { getStore } from "@/lib/store";

const AUTO_KEY = "niche-locator:auto-ideas";
/** Rows shown before "Show all". */
const SHOW_ROWS = 20;
/** Two Labs requests (suggestions + related, each billed ~$0.0125 in practice) and up to 30 ideas each. */
const IDEAS_COST = 2 * (PRICES.labsRequest + 0.0025) + 60 * PRICES.labsKeyword;

/** Same estimate as Keyword Check for n keywords in one city. */
const cityCost = (source: AdsSource, n: number) => source === "labs"
  ? Math.ceil(n / 700) * PRICES.labsRequest + n * PRICES.labsKeyword
  : PRICES.cityAdsRequest + PRICES.kdRequest + n * PRICES.kdKeyword;

/**
 * Ideas with the numbers a Keyword Check in the city would show (same fetcher, same cache), so what the
 * panel shows is what the check finds. `noData` = Google has nothing for the keyword there.
 */
export function withCityData(ideas: KeywordIdea[], d: Pick<KeywordCheckData, "ads" | "kd">): (KeywordIdea & { noData?: boolean })[] {
  return ideas.map((i) => {
    const m = d.ads[i.keyword] ?? null;
    return {
      ...i,
      searchVolume: m?.searchVolume ?? null,
      cpc: m?.cpc ?? null,
      competition: m?.competition ?? null,
      competitionIndex: m?.competitionIndex ?? null,
      difficulty: d.kd[i.keyword] ?? null,
      noData: !m,
    };
  });
}

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
export function sortIdeas<T extends KeywordIdea>(ideas: T[], sort: Sort): T[] {
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
type CityState = { key: string; data: KeywordCheckData | null; error: string };

/**
 * Side panel of keyword ideas (long-tail suggestions + related searches) for one keyword in the field.
 * The seed follows the last keyword added; ideas can be ticked and added to the field.
 */
export default function KeywordIdeas({ seed, seeds, existing, onSeedChange, onAdd, mode, city, source }: {
  seed: string | null;
  /** Keywords currently in the field, offered as seeds. */
  seeds: string[];
  existing: Set<string>;
  onSeedChange: (seed: string) => void;
  onAdd: (keywords: string[]) => void;
  mode: "live" | "demo";
  /** Target city: ideas are re-checked there the same way Keyword Check does. */
  city: City | null;
  source: AdsSource;
}) {
  const [auto, setAuto] = useState(true);
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [spent, setSpent] = useState(0);
  const [sort, setSort] = useState<Sort>(null);
  const [showAll, setShowAll] = useState(false);
  const [cityState, setCityState] = useState<CityState | null>(null);
  const [view, setView] = useState<"city" | "us">("city");
  const [hideNoData, setHideNoData] = useState(true);
  const cityMemo = useRef(new Map<string, KeywordCheckData>());
  // Ideas already loaded this session, so switching back to a seed is instant and free.
  const memo = useRef(new Map<string, { ideas: KeywordIdea[]; cached: boolean }>());

  useEffect(() => setAuto(readAuto()), []);

  const load = async (s: string) => {
    setPicked(new Set());
    setShowAll(false);
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
  const cityKey = loaded && city ? `${seed}|${city.id}|${source}` : null;
  const cityLabel = city ? `${city.name}, ${city.stateCode}` : "";

  const loadCity = async (key: string, keywords: string[], c: City) => {
    const known = cityMemo.current.get(key);
    if (known) return setCityState({ key, data: known, error: "" });
    setCityState({ key, data: null, error: "" });
    try {
      const d = await getKeywordCheck(keywords, c.id, { store: getStore(), source });
      cityMemo.current.set(key, d);
      setSpent((x) => x + d.cost);
      setCityState((prev) => (prev?.key === key ? { key, data: d, error: "" } : prev));
    } catch (e) {
      setCityState((prev) => (prev?.key === key ? { key, data: null, error: (e as Error).message } : prev));
    }
  };

  useEffect(() => {
    if (!cityKey || !city || !loaded?.length || cityState?.key === cityKey) return;
    if (auto || cityMemo.current.has(cityKey)) void loadCity(cityKey, loaded.map((i) => i.keyword), city);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey, auto]);

  const cityData = cityKey && cityState?.key === cityKey ? cityState.data : null;
  const showCity = view === "city" && Boolean(cityData);
  const shown = useMemo(() => {
    if (!loaded) return [];
    return showCity && cityData ? withCityData(loaded, cityData) : loaded.map((i) => ({ ...i, noData: false }));
  }, [loaded, showCity, cityData]);
  const hiddenCount = showCity && hideNoData ? shown.filter((i) => i.noData).length : 0;
  const ideas = useMemo(
    () => sortIdeas(hiddenCount ? shown.filter((i) => !i.noData) : shown, sort),
    [shown, hiddenCount, sort],
  );
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

      {loaded && loaded.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          {!city && <span>Pick a target city to see these ideas’ numbers in that city.</span>}
          {city && (
            <>
              <div className="flex rounded border border-zinc-300 p-0.5 dark:border-zinc-700" role="group" aria-label="Numbers for">
                {(["city", "us"] as const).map((v) => (
                  <button key={v} className={`rounded px-1.5 ${view === v ? "bg-sky-600 text-white" : ""}`} onClick={() => setView(v)}
                    title={v === "city" ? `Same data Keyword Check uses for ${cityLabel} (${source === "labs" ? "Labs, “keyword + city”" : "Google Ads targeted to the city"})` : "US-wide numbers for the idea"}>
                    {v === "city" ? cityLabel : "US"}
                  </button>
                ))}
              </div>
              {view === "city" && !cityData && !cityState?.error && (cityState?.key === cityKey
                ? <span>Checking {loaded.length} ideas in {cityLabel}…</span>
                : (
                  <button className="btn px-2 py-0.5 text-xs" onClick={() => cityKey && loadCity(cityKey, loaded.map((i) => i.keyword), city)}>
                    Check in {cityLabel} {mode === "live" && `(~$${cityCost(source, loaded.length).toFixed(3)})`}
                  </button>
                ))}
              {view === "city" && cityState?.key === cityKey && cityState.error && <span className="text-rose-600">{cityState.error}</span>}
              {showCity && (
                <label className="flex items-center gap-1" title={`Ideas Google has no data for in ${cityLabel} would show no data when you check them`}>
                  <input type="checkbox" checked={hideNoData} onChange={(e) => setHideNoData(e.target.checked)} />
                  Hide no data ({shown.filter((i) => i.noData).length})
                </label>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex-1 overflow-y-auto" style={{ maxHeight: "28rem" }}>
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
        {showCity && loaded && loaded.length > 0 && !ideas.length && (
          <p className="text-xs text-zinc-500">
            None of these ideas has data in {cityLabel}. Untick “Hide no data”, switch to US, or try a broader keyword.
          </p>
        )}
        {ideas.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="w-5" />
                <Th k="keyword" label="Keyword" right={false} title="Sort A→Z" />
                <Th k="searchVolume" label="Vol." title={`${showCity ? `Monthly searches in ${cityLabel}` : "US monthly searches"} · click to sort`} />
                <Th k="cpc" label="CPC" title="Cost per click · click to sort" />
                <Th k="ads" label="Ads" title="Google Ads competition: how many advertisers bid on this keyword · click to sort" />
                <Th k="organic" label="Organic" title="Organic competition from keyword difficulty (0–100): Low < 30, Medium 30–59, High 60+ · click to sort" />
              </tr>
            </thead>
            <tbody>
              {(showAll ? ideas : ideas.slice(0, SHOW_ROWS)).map((i) => {
                const added = existing.has(i.keyword);
                return (
                  <tr key={i.keyword} className={`${added ? "text-zinc-400" : "cursor-pointer hover:bg-white dark:hover:bg-zinc-900"} ${i.noData ? "opacity-50" : ""}`}
                    title={i.noData ? `No Google data for this keyword in ${cityLabel}` : undefined}
                    onClick={() => !added && toggle(i.keyword)}>
                    <td><input type="checkbox" disabled={added} checked={added || picked.has(i.keyword)} readOnly /></td>
                    <td className="py-0.5">
                      {i.keyword}
                      {i.kind === "related" && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" title="Related search (doesn't contain your keyword)">rel</span>}
                      {added && <span className="ml-1 text-[10px]">added</span>}
                      {i.noData && <span className="ml-1 text-[10px] text-zinc-500">no data</span>}
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
        {ideas.length > SHOW_ROWS && (
          <button className="mt-1 text-xs text-sky-700 hover:underline dark:text-sky-400" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show top ${SHOW_ROWS}` : `Show all ${ideas.length} ideas`}
          </button>
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
