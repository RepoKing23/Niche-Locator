import type { Cell } from "./export";
import { organicSourceOf } from "./scoring";
import type { CityRow } from "./types";

/** Data-only column definition shared by the UI table and the Excel report. */
export type ColumnDef = {
  key: string;
  label: string;
  /** Short explanation shown as a header tooltip / Excel cell note. */
  help: string;
  numeric?: boolean;
  defaultVisible: boolean;
  /** Excel number format. */
  numFmt?: string;
  /** Value used for sorting and export. */
  value: (r: CityRow) => Cell;
};

const USD = "$#,##0.00";
const USD0 = "$#,##0";
const INT = "#,##0";

export function googleUrl(r: CityRow) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${r.keyword} ${r.city} ${r.stateCode}`)}`;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: "score", label: "Opportunity", numeric: true, defaultVisible: true,
    help: "0-100. High = expensive, competitive ads and weak organic results. 30% CPC, 20% ads competition, 35% organic ease, 15% volume.",
    value: (r) => r.score },
  { key: "city", label: "City", defaultVisible: true, help: "City", value: (r) => r.city },
  { key: "stateCode", label: "State", defaultVisible: true, help: "State", value: (r) => r.stateCode },
  { key: "population", label: "Population", numeric: true, defaultVisible: true, numFmt: INT,
    help: "City population (2020 Census)", value: (r) => r.population },
  { key: "tier", label: "Market Size", defaultVisible: true,
    help: "Major = 250k+ people, Mid = 50k-250k, Small = under 50k", value: (r) => r.tier ?? null },
  { key: "keyword", label: "Keyword", defaultVisible: true, help: "Keyword used for the live SERP check", value: (r) => r.keyword },
  { key: "searchVolume", label: "Monthly Searches", numeric: true, defaultVisible: true, numFmt: INT,
    help: "Monthly Google searches in the city. 'est.' = national volume scaled by population; fetch exact city volume for Google Ads data.",
    value: (r) => r.searchVolume },
  { key: "cpc", label: "CPC", numeric: true, defaultVisible: true, numFmt: USD,
    help: "Average Google Ads cost per click (USD). 'US' = national value used because the city has no CPC data.",
    value: (r) => r.cpc },
  { key: "lowBid", label: "Bid Low", numeric: true, defaultVisible: true, numFmt: USD,
    help: "Low top-of-page bid (USD)", value: (r) => r.lowBid },
  { key: "highBid", label: "Bid High", numeric: true, defaultVisible: true, numFmt: USD,
    help: "High top-of-page bid (USD)", value: (r) => r.highBid },
  { key: "competition", label: "Ads Comp.", defaultVisible: true, help: "Google Ads competition level (paid search)",
    value: (r) => r.competition },
  { key: "competitionIndex", label: "Ads Index", numeric: true, defaultVisible: true,
    help: "Google Ads competition index 0-100 (higher = more advertisers)", value: (r) => r.competitionIndex },
  { key: "organicDifficulty", label: "Organic Diff.", numeric: true, defaultVisible: true,
    help: "0-100 difficulty from the live Google top 10 in that city (weak sites vs. city-targeted competitors, map pack reviews).",
    value: (r) => r.organicDifficulty },
  { key: "organicSource", label: "Organic Source", defaultVisible: false,
    help: "Live SERP = checked in Google for that city; City KD = DataForSEO keyword difficulty for \"keyword + city\"; Estimated = from niche difficulty and city size",
    value: (r) => organicSourceOf(r) },
  { key: "organic", label: "Organic Comp.", defaultVisible: true, help: "Low < 30 ≤ Medium < 60 ≤ High",
    value: (r) => r.organic },
  { key: "weakResults", label: "Weak in Top 10", numeric: true, defaultVisible: true,
    help: "Directories, job boards, social, big-box and generic sites in the organic top 10 — easy to outrank.",
    value: (r) => r.weakResults },
  { key: "cityRelevant", label: "Local Competitors", numeric: true, defaultVisible: true,
    help: "Organic top-10 results from real businesses that target this city (city in title/URL).",
    value: (r) => r.cityRelevant },
  { key: "localPack", label: "Map Pack", defaultVisible: true, help: "Google map pack shown for the keyword",
    value: (r) => (r.localPack == null ? null : r.localPack ? "Yes" : "No") },
  { key: "localPackTopReviews", label: "Map Pack Max Reviews", numeric: true, defaultVisible: true, numFmt: INT,
    help: "Most reviews held by a business in the map pack (lower = easier to break in).",
    value: (r) => r.localPackTopReviews },
  { key: "adsCount", label: "Ads on SERP", numeric: true, defaultVisible: false,
    help: "Paid ads seen on the live results page", value: (r) => r.adsCount },
  { key: "adValue", label: "Ad Value / mo", numeric: true, defaultVisible: true, numFmt: USD0,
    help: "Monthly searches × CPC — what that traffic would cost in Google Ads.", value: (r) => r.adValue },
  { key: "trend", label: "12-mo Trend", defaultVisible: true, help: "Monthly search trend, oldest to newest",
    value: (r) => r.trend.join(" ") },
  { key: "yoy", label: "YoY %", numeric: true, defaultVisible: false, help: "Change from 12 months ago",
    value: (r) => r.yoy },
  { key: "nicheDifficulty", label: "Niche KD (US)", numeric: true, defaultVisible: false,
    help: "DataForSEO keyword difficulty for the niche nationally", value: (r) => r.nicheDifficulty },
  { key: "volumeSource", label: "Volume Source", defaultVisible: false, help: "Where the search volume came from",
    value: (r) => r.volumeSource },
  { key: "cpcSource", label: "CPC Source", defaultVisible: false, help: "City-level or national CPC", value: (r) => r.cpcSource },
  { key: "topDomains", label: "Top 10 Domains", defaultVisible: false, help: "Organic top-10 domains",
    value: (r) => r.topDomains.join(", ") },
  { key: "google", label: "Google", defaultVisible: true, help: "Open the live Google results", value: (r) => googleUrl(r) },
];
