"use client";

import { useState } from "react";
import { Sparkline } from "./columns";
import { toTsv } from "@/lib/export";
import type { NicheSnapshot } from "@/lib/types";

const money = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const int = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export default function SnapshotPanel({ snapshot, mode, spent }: { snapshot: NicheSnapshot; mode: "live" | "demo"; spent: number }) {
  const [copied, setCopied] = useState(false);
  const headers = ["Keyword", "US Monthly Searches", "CPC", "Bid Low", "Bid High", "Ads Competition", "Ads Index", "Keyword Difficulty"];
  const data = snapshot.variants.map((v) => [
    v.keyword, v.searchVolume, v.cpc, v.lowBid, v.highBid, v.competition, v.competitionIndex, v.difficulty ?? null,
  ]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toTsv(headers, data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  const cards = [
    { label: "US monthly searches", value: int(snapshot.nationalVolume) },
    { label: "Avg CPC (US)", value: money(snapshot.cpc) },
    { label: "Top-of-page bids", value: `${money(snapshot.lowBid)} – ${money(snapshot.highBid)}` },
    { label: "Ads competition", value: snapshot.competition ? `${snapshot.competition} (${snapshot.competitionIndex})` : "—" },
    { label: "Keyword difficulty (US)", value: int(snapshot.difficulty) },
    { label: mode === "demo" ? "API spend (demo)" : "API spend this report", value: `$${spent.toFixed(3)}` },
  ];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Niche snapshot: “{snapshot.niche}”</h2>
        <div className="flex items-center gap-2">
          <Sparkline values={snapshot.trend} />
          <span className="text-xs text-zinc-500">12-mo US trend</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800/60">
            <div className="text-xs text-zinc-500">{c.label}</div>
            <div className="text-lg font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">Keyword variants ({snapshot.variants.length})</summary>
        <div className="mt-2 overflow-auto">
          <button className="btn mb-2" onClick={copy}>{copied ? "Copied ✓" : "Copy variants"}</button>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500">{headers.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {snapshot.variants.map((v) => (
                <tr key={v.keyword} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1">{v.keyword}</td>
                  <td className="px-2 py-1 tabular-nums">{int(v.searchVolume)}</td>
                  <td className="px-2 py-1 tabular-nums">{money(v.cpc)}</td>
                  <td className="px-2 py-1 tabular-nums">{money(v.lowBid)}</td>
                  <td className="px-2 py-1 tabular-nums">{money(v.highBid)}</td>
                  <td className="px-2 py-1">{v.competition ?? "—"}</td>
                  <td className="px-2 py-1 tabular-nums">{int(v.competitionIndex)}</td>
                  <td className="px-2 py-1 tabular-nums">{int(v.difficulty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
