export type Competition = "LOW" | "MEDIUM" | "HIGH";

export type OrganicLabel = "Low" | "Medium" | "High" | "Unknown";

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
  status: "pending" | "done" | "error";
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
  spent: number;
};
