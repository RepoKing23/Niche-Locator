import type { ReactNode } from "react";
import { COLUMN_DEFS, googleUrl, type ColumnDef } from "@/lib/reportColumns";
import type { CityRow } from "@/lib/types";

export type Column = ColumnDef & { render?: (r: CityRow) => ReactNode };

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

const money = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const int = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

/** UI renderers; columns without one show their raw value. */
const RENDER: Record<string, (r: CityRow) => ReactNode> = {
  score: (r) => <ScoreCell score={r.score} />,
  city: (r) => <span className="font-medium">{r.city}</span>,
  population: (r) => int(r.population),
  searchVolume: (r) => (
    <span>
      {int(r.searchVolume)}
      {r.volumeSource === "Estimated" && <span className="ml-1 text-xs text-zinc-400">est.</span>}
    </span>
  ),
  cpc: (r) => (
    <span>
      {money(r.cpc)}
      {r.cpcSource === "National" && <span className="ml-1 text-xs text-zinc-400">US</span>}
    </span>
  ),
  lowBid: (r) => money(r.lowBid),
  highBid: (r) => money(r.highBid),
  competition: (r) =>
    r.competition ? (
      <Badge tone={r.competition === "HIGH" ? "good" : r.competition === "MEDIUM" ? "mid" : "bad"}>{r.competition}</Badge>
    ) : "—",
  competitionIndex: (r) => int(r.competitionIndex),
  organicDifficulty: (r) => (r.status === "pending" ? <span className="text-zinc-400">…</span> : int(r.organicDifficulty)),
  organic: (r) => (
    <Badge tone={r.organic === "Low" ? "good" : r.organic === "Medium" ? "mid" : r.organic === "High" ? "bad" : "none"}>
      {r.status === "error" ? "Error" : r.organic}
    </Badge>
  ),
  weakResults: (r) => int(r.weakResults),
  cityRelevant: (r) => int(r.cityRelevant),
  localPackTopReviews: (r) => int(r.localPackTopReviews),
  adsCount: (r) => int(r.adsCount),
  adValue: (r) => `$${Math.round(r.adValue).toLocaleString("en-US")}`,
  trend: (r) => <Sparkline values={r.trend} />,
  yoy: (r) => (r.yoy == null ? "—" : `${r.yoy > 0 ? "+" : ""}${r.yoy}%`),
  nicheDifficulty: (r) => int(r.nicheDifficulty),
  topDomains: (r) => (
    <span className="block max-w-xs truncate" title={r.topDomains.join(", ")}>{r.topDomains.join(", ") || "—"}</span>
  ),
  google: (r) => (
    <a href={googleUrl(r)} target="_blank" rel="noreferrer" className="text-sky-700 underline dark:text-sky-400">
      SERP ↗
    </a>
  ),
};

export const COLUMNS: Column[] = COLUMN_DEFS.map((c) => ({ ...c, render: RENDER[c.key] }));
