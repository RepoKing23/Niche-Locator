"use client";

import { useSyncExternalStore } from "react";
import type { AdsSource } from "@/lib/dataforseo";

// One app-wide choice, remembered per browser.
const KEY = "niche-locator:ads-source";
const listeners = new Set<() => void>();
let memory: AdsSource | null = null;

function read(): AdsSource {
  if (memory) return memory;
  try {
    return localStorage.getItem(KEY) === "ads" ? "ads" : "labs";
  } catch {
    return "labs";
  }
}

function write(v: AdsSource) {
  memory = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // per-browser convenience only
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The chosen Google Ads data source (Labs = cheap default). */
export function useAdsSource(): AdsSource {
  return useSyncExternalStore(subscribe, read, () => "labs");
}

const OPTIONS: [AdsSource, string, string][] = [
  ["labs", "Cheap — DataForSEO Labs", "same Google Ads CPC, bids, competition & volume, refreshed monthly, US-level; includes keyword difficulty · ~$0.01 + $0.0001/keyword"],
  ["ads", "Live Google Ads", "today's Google Ads data · flat ~$0.09 per request (up to 1,000 keywords)"],
];

/** Radio group to pick where ads data comes from. */
export default function AdsSourcePicker({ name, compact = false }: { name: string; compact?: boolean }) {
  const source = useAdsSource();
  return (
    <fieldset className="space-y-1 text-sm">
      <legend className="font-medium">Ads data source</legend>
      {OPTIONS.map(([v, label, hint]) => (
        <label key={v} className="flex items-start gap-2">
          <input type="radio" name={name} className="mt-1" checked={source === v} onChange={() => write(v)} />
          <span>{label}{!compact && <span className="text-xs text-zinc-500"> — {hint}</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}
