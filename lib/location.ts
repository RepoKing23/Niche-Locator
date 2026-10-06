/** Helpers for keywords that already contain the place (e.g. "stair lift cost missoula mt"). */

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;

/** Does the keyword already mention the city and/or the state (code as a whole word, or full name)? */
export function mentionsPlace(keyword: string, city: string, stateCode: string, stateName: string) {
  const k = norm(keyword);
  return {
    city: k.includes(norm(city)),
    state: k.includes(norm(stateCode)) || k.includes(norm(stateName)),
  };
}

/** Remove the city and state words from a keyword: "stair lift cost missoula mt" → "stair lift cost". */
export function stripPlace(keyword: string, city: string, stateCode: string, stateName: string): string {
  let k = norm(keyword);
  for (const place of [city, stateName, stateCode]) {
    const p = norm(place);
    if (p.trim()) k = k.split(p).join(" ");
  }
  return k.replace(/\s+/g, " ").trim();
}

/** Google query for a keyword in a city, adding the city/state only when the keyword doesn't have them. */
export function googleQuery(keyword: string, city: string, stateCode: string, stateName: string): string {
  const has = mentionsPlace(keyword, city, stateCode, stateName);
  return [keyword, has.city ? "" : city, has.state ? "" : stateCode].filter(Boolean).join(" ");
}
