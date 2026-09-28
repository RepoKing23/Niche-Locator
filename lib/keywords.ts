const SUFFIXES = [
  "installers", "installer", "installation", "install", "contractors", "contractor",
  "companies", "company", "services", "service", "repair", "replacement", "near me",
];

/** Normalize text into something Google Ads accepts (lowercase, no punctuation). */
export function cleanKeyword(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip a trailing service word: "stairway installer" -> "stairway". */
export function coreTerm(niche: string): string {
  const clean = cleanKeyword(niche);
  for (const s of SUFFIXES) {
    if (clean.endsWith(` ${s}`)) return clean.slice(0, -s.length - 1).trim();
  }
  return clean;
}

/** Default keyword variants suggested for a niche; the user can edit them. */
export function suggestVariants(niche: string): string[] {
  const clean = cleanKeyword(niche);
  if (!clean) return [];
  const core = coreTerm(clean);
  const variants =
    core === clean
      ? [clean, `${core} company`, `${core} contractor`, `${core} services`]
      : [clean, `${core} installation`, `${core} contractor`, `${core} company`];
  return [...new Set(variants)];
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
