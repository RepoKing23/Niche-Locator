export type Competition = "LOW" | "MEDIUM" | "HIGH";

export type OrganicLabel = "Low" | "Medium" | "High" | "Unknown";

/** How a research run gathers organic difficulty, cheapest last. */
export type OrganicMode = "kd" | "queued" | "live" | "estimate";

/** Where a row's organic difficulty came from, most to least accurate. */
export type OrganicSource = "Live SERP" | "City KD" | "Estimated";

/** Google Ads metrics for one keyword (national or city-targeted). */
export type KeywordMetrics = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  lowBid: number | null;
  highBid: number | null;
  competition: Competition | null;
  competitionIndex: number | null;
  /** Monthly search volumes, oldest first (up to 12). */
  trend: number[];
  /** DataForSEO Labs keyword difficulty 0-100 (national). */
  difficulty?: number | null;
};

/** National snapshot of the niche: one entry per keyword variant. */
export type NicheSnapshot = {
  niche: string;
  variants: KeywordMetrics[];
  /** Volume-weighted national CPC across variants. */
  cpc: number;
  lowBid: number | null;
  highBid: number | null;
  competitionIndex: number | null;
  competition: Competition | null;
  nationalVolume: number;
  difficulty: number | null;
  trend: number[];
  cost: number;
};

export type SerpInfo = {
  keyword: string;
  location: string;
  organicCount: number;
  /** Directories, job boards, social, big-box and generic info sites in organic top 10. */
  weakResults: number;
  weakDomains: string[];
  /** Organic top-10 results that mention the city (targeted local competitors). */
  cityRelevant: number;
  localPack: boolean;
  /** Highest review count among map-pack businesses. */
  localPackTopReviews: number | null;
  adsCount: number;
  topDomains: string[];
  /** Organic difficulty 0-100 derived from the SERP makeup. */
  difficulty: number;
};

export type LocalDemand = {
  searchVolume: number;
  cpc: number | null;
  lowBid: number | null;
  highBid: number | null;
  competitionIndex: number | null;
  trend: number[];
  cost: number;
};

export type CityRow = {
  id: string;
  city: string;
  state: string;
  stateCode: string;
  population: number;
  /** Market size: Major 250k+, Mid 50k-250k, Small under 50k. */
  tier: "Major" | "Mid" | "Small";
  keyword: string;
  searchVolume: number;
  volumeSource: "Google Ads (city)" | "Estimated";
  cpc: number;
  cpcSource: "City" | "National";
  lowBid: number | null;
  highBid: number | null;
  competition: Competition | null;
  competitionIndex: number | null;
  nicheDifficulty: number | null;
  organicDifficulty: number | null;
  organicSource?: OrganicSource;
  /** @deprecated legacy flag on rows saved before organicSource existed; read via organicSourceOf(). */
  organicEstimated?: boolean;
  organic: OrganicLabel;
  weakResults: number | null;
  cityRelevant: number | null;
  localPack: boolean | null;
  localPackTopReviews: number | null;
  adsCount: number | null;
  topDomains: string[];
  adValue: number;
  trend: number[];
  yoy: number | null;
  score: number;
  /** "skipped" = the run was an estimate-only scan without a live SERP check. */
  status: "pending" | "done" | "error" | "skipped";
};

export type Report = {
  id: string;
  mode: "live" | "demo";
  niche: string;
  createdAt: string;
  snapshot: NicheSnapshot;
  serps: Record<string, SerpInfo>;
  locals: Record<string, LocalDemand>;
  errors: Record<string, string>;
  cityIds: string[];
  primaryKeyword: string;
  /** Estimate-only scan: no live SERP check was run for the cities. */
  serpSkipped?: boolean;
  /** How organic difficulty was gathered for this report. */
  organicMode?: OrganicMode;
  /** City keyword difficulty per city (null = no Labs data for that phrase). */
  kds?: Record<string, number | null>;
  /** True while SERP / KD results are still being collected. */
  serpPending?: boolean;
  kdPending?: boolean;
  /** Results reused from the cache (free) in this report. */
  cachedHits?: number;
  spent: number;
};

/** A named list of saved report rows (the keyword manager). */
export type KeywordList = {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

/** One saved row: a city result for a niche, frozen at save time. */
export type ListItem = {
  id: string;
  listId: string;
  niche: string;
  cityId: string;
  keyword: string;
  row: CityRow;
  serp: SerpInfo | null;
  note: string;
  createdAt: string;
};

export type NewListItem = Pick<ListItem, "niche" | "cityId" | "keyword" | "row" | "serp">;

export type SavedReportMeta = {
  id: string;
  niche: string;
  mode: "live" | "demo";
  cityCount: number;
  createdAt: string;
};
