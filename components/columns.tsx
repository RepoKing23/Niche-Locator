import type { ReactNode } from "react";
import type { CityRow } from "@/lib/types";
import type { Cell } from "@/lib/export";

export type Column = {
  key: string;
  label: string;
  /** Short explanation shown as a tooltip on the header. */
  help: string;
  numeric?: boolean;
  defaultVisible: boolean;
  /** Value used for sorting and export. */
  value: (r: CityRow) => Cell;
  render?: (r: CityRow) => ReactNode;
};

const money = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const int = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

export function googleUrl(r: CityRow) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${r.keyword} ${r.city} ${r.stateCode}`)}`;
}

function Badge({ tone, children }: { tone: "good" | "mid" | "bad" | "none"; children: ReactNode }) {
  const cls = {
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    mid: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
    bad: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
    none: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-zinc-400">—</span>;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - (v / max) * 16}`).join(" ");
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" aria-hidden className="text-sky-600 dark:text-sky-400">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ScoreCell({ score }: { score: number }) {
  const tone = score >= 65 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-right font-semibold tabular-nums">{score}</span>
      <span className="h-1.5 w-12 rounded bg-zinc-200 dark:bg-zinc-700">
        <span className={`block h-1.5 rounded ${tone}`} style={{ width: `${score}%` }} />
      </span>
    </div>
  );
}

export const COLUMNS: Column[] = [
  {
    key: "score", label: "Opportunity", numeric: true, defaultVisible: true,
    help: "0-100. High = expensive, competitive ads and weak organic results. 30% CPC, 20% ads competition, 35% organic ease, 15% volume.",
    value: (r) => r.score, render: (r) => <ScoreCell score={r.score} />,
  },
  { key: "city", label: "City", defaultVisible: true, help: "City", value: (r) => r.city,
    render: (r) => <span className="font-medium">{r.city}</span> },
  { key: "stateCode", label: "State", defaultVisible: true, help: "State", value: (r) => r.stateCode },
  { key: "population", label: "Population", numeric: true, defaultVisible: true, help: "City population (2020 Census)",
    value: (r) => r.population, render: (r) => int(r.population) },
  { key: "keyword", label: "Keyword", defaultVisible: true, help: "Keyword used for the live SERP check", value: (r) => r.keyword },
  {
    key: "searchVolume", label: "Monthly Searches", numeric: true, defaultVisible: true,
    help: "Monthly Google searches in the city. 'est.' = national volume scaled by population; fetch exact city volume for Google Ads data.",
    value: (r) => r.searchVolume,
    render: (r) => (
      <span>
        {int(r.searchVolume)}
        {r.volumeSource === "Estimated" && <span className="ml-1 text-xs text-zinc-400">est.</span>}
      </span>
    ),
  },
  {
    key: "cpc", label: "CPC", numeric: true, defaultVisible: true,
    help: "Average Google Ads cost per click (USD). 'US' = national value used because the city has no CPC data.",
    value: (r) => r.cpc,
    render: (r) => (
      <span>
        {money(r.cpc)}
        {r.cpcSource === "National" && <span className="ml-1 text-xs text-zinc-400">US</span>}
      </span>
    ),
  },
  { key: "lowBid", label: "Bid Low", numeric: true, defaultVisible: true, help: "Low top-of-page bid (USD)",
    value: (r) => r.lowBid, render: (r) => money(r.lowBid) },
  { key: "highBid", label: "Bid High", numeric: true, defaultVisible: true, help: "High top-of-page bid (USD)",
    value: (r) => r.highBid, render: (r) => money(r.highBid) },
  {
    key: "competition", label: "Ads Comp.", defaultVisible: true, help: "Google Ads competition level (paid search)",
    value: (r) => r.competition,
    render: (r) =>
      r.competition ? (
        <Badge tone={r.competition === "HIGH" ? "good" : r.competition === "MEDIUM" ? "mid" : "bad"}>{r.competition}</Badge>
      ) : "—",
  },
  { key: "competitionIndex", label: "Ads Index", numeric: true, defaultVisible: true,
    help: "Google Ads competition index 0-100 (higher = more advertisers)", value: (r) => r.competitionIndex,
    render: (r) => int(r.competitionIndex) },
  {
    key: "organicDifficulty", label: "Organic Diff.", numeric: true, defaultVisible: true,
    help: "0-100 difficulty from the live Google top 10 in that city (weak sites vs. city-targeted competitors, map pack reviews).",
    value: (r) => r.organicDifficulty,
    render: (r) => (r.status === "pending" ? <span className="text-zinc-400">…</span> : int(r.organicDifficulty)),
  },
  {
    key: "organic", label: "Organic Comp.", defaultVisible: true, help: "Low < 30 ≤ Medium < 60 ≤ High",
    value: (r) => r.organic,
    render: (r) => (
      <Badge tone={r.organic === "Low" ? "good" : r.organic === "Medium" ? "mid" : r.organic === "High" ? "bad" : "none"}>
        {r.status === "error" ? "Error" : r.organic}
      </Badge>
    ),
  },
  { key: "weakResults", label: "Weak in Top 10", numeric: true, defaultVisible: true,
    help: "Directories, job boards, social, big-box and generic sites in the organic top 10 — easy to outrank.",
    value: (r) => r.weakResults, render: (r) => int(r.weakResults) },
  { key: "cityRelevant", label: "Local Competitors", numeric: true, defaultVisible: true,
    help: "Organic top-10 results from real businesses that target this city (city in title/URL).",
    value: (r) => r.cityRelevant, render: (r) => int(r.cityRelevant) },
  { key: "localPack", label: "Map Pack", defaultVisible: true, help: "Google map pack shown for the keyword",
    value: (r) => (r.localPack == null ? null : r.localPack ? "Yes" : "No") },
  { key: "localPackTopReviews", label: "Map Pack Max Reviews", numeric: true, defaultVisible: true,
    help: "Most reviews held by a business in the map pack (lower = easier to break in).",
    value: (r) => r.localPackTopReviews, render: (r) => int(r.localPackTopReviews) },
  { key: "adsCount", label: "Ads on SERP", numeric: true, defaultVisible: false,
    help: "Paid ads seen on the live results page", value: (r) => r.adsCount, render: (r) => int(r.adsCount) },
  { key: "adValue", label: "Ad Value / mo", numeric: true, defaultVisible: true,
    help: "Monthly searches × CPC — what that traffic would cost in Google Ads.",
    value: (r) => r.adValue, render: (r) => `$${Math.round(r.adValue).toLocaleString("en-US")}` },
  { key: "trend", label: "12-mo Trend", defaultVisible: true, help: "Monthly search trend (exports as comma-separated values)",
    value: (r) => r.trend.join(" "), render: (r) => <Sparkline values={r.trend} /> },
  { key: "yoy", label: "YoY %", numeric: true, defaultVisible: false, help: "Change from 12 months ago",
    value: (r) => r.yoy, render: (r) => (r.yoy == null ? "—" : `${r.yoy > 0 ? "+" : ""}${r.yoy}%`) },
  { key: "nicheDifficulty", label: "Niche KD (US)", numeric: true, defaultVisible: false,
    help: "DataForSEO keyword difficulty for the niche nationally", value: (r) => r.nicheDifficulty,
    render: (r) => int(r.nicheDifficulty) },
  { key: "volumeSource", label: "Volume Source", defaultVisible: false, help: "Where the search volume came from", value: (r) => r.volumeSource },
  { key: "cpcSource", label: "CPC Source", defaultVisible: false, help: "City-level or national CPC", value: (r) => r.cpcSource },
  { key: "topDomains", label: "Top 10 Domains", defaultVisible: false, help: "Organic top-10 domains",
    value: (r) => r.topDomains.join(", "),
    render: (r) => <span className="block max-w-xs truncate" title={r.topDomains.join(", ")}>{r.topDomains.join(", ") || "—"}</span> },
  {
    key: "google", label: "Google", defaultVisible: true, help: "Open the live Google results", value: (r) => googleUrl(r),
    render: (r) => (
      <a href={googleUrl(r)} target="_blank" rel="noreferrer" className="text-sky-700 underline dark:text-sky-400">
        SERP ↗
      </a>
    ),
  },
];
