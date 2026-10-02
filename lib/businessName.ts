import { coreTerm } from "./keywords";

/** Trade nouns read better as the trade itself: "Tampa Plumbing Pros", not "Tampa Plumber Pros". */
const TRADES: Record<string, string> = {
  plumber: "plumbing", plumbers: "plumbing", roofer: "roofing", roofers: "roofing",
  electrician: "electric", electricians: "electric", painter: "painting", painters: "painting",
  landscaper: "landscaping", landscapers: "landscaping", locksmith: "locksmith", locksmiths: "locksmith",
  carpenter: "carpentry", carpenters: "carpentry", mover: "moving", movers: "moving",
  cleaner: "cleaning", cleaners: "cleaning", welder: "welding", welders: "welding",
  plasterer: "plastering", tiler: "tile", fencer: "fencing", paver: "paving", pavers: "paving",
};

const SUFFIX = "Pros";
const MAX_LENGTH = 28;

const titleCase = (s: string) =>
  s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");

/** City without punctuation: "St. Louis" → "St Louis". */
const cleanCity = (city: string) => city.replace(/[^A-Za-z0-9\s-]/g, "").replace(/\s+/g, " ").trim();

/** The service part of the name: "stair lift installer" → "Stair Lift", "plumber" → "Plumbing". */
export function serviceWord(keyword: string): string {
  const core = coreTerm(keyword) || keyword;
  const words = core.toLowerCase().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  if (last && TRADES[last]) words[words.length - 1] = TRADES[last];
  return titleCase(words.join(" "));
}

/**
 * Short, local-SEO-friendly business name: "<City> <Service> Pros".
 * City + service keyword in the name helps Google Business Profile and exact-match local searches;
 * the suffix is dropped when the name would get too long (> 28 characters).
 */
export function businessName(keyword: string, city: string): string {
  const base = `${cleanCity(city)} ${serviceWord(keyword)}`.trim();
  const withSuffix = `${base} ${SUFFIX}`;
  return withSuffix.length <= MAX_LENGTH ? withSuffix : base;
}

/** Matching .com idea: "Tampa Stair Lift Pros" → "tampastairliftpros.com" (availability not checked). */
export function domainIdea(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}
