// Generates lib/data/us-cities.json from GeoNames (npm "all-the-cities").
// Keeps real local-service markets: populated places with 10k+ people, plus each
// state's 10 largest places with 2.5k+ so small states are still covered.
// Area codes come from Google's libphonenumber geocoding data (NPA-NXX prefix -> "City, ST").
// Run: npm i --no-save --legacy-peer-deps libphonenumber-geo-carrier@2 bson@6 && node scripts/build-cities.mjs && npm ci
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const all = require("all-the-cities");
const { deserialize } = require("bson");

const MIN_POP = 10_000;
const PER_STATE_MIN = 10;
const PER_STATE_FLOOR = 2_500;
// Populated places; excludes PPLX (neighborhoods), PPLQ (abandoned), PPLH (historical), PPLW (destroyed).
const KEEP = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLC", "PPLG", "PPLL", "PPLS"]);
// Names Google Ads / DataForSEO use for these places.
const RENAME = { "New York City": "New York", "Washington, D.C.": "Washington", "City of Milford (balance)": "Milford" };
// DC is one market; GeoNames lists its neighborhoods as separate places.
const SINGLE_MARKET_STATES = new Set(["DC"]);
const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

const best = new Map();
for (const c of all) {
  if (c.country !== "US" || !KEEP.has(c.featureCode) || !STATES.has(c.adminCode)) continue;
  const name = RENAME[c.name] ?? c.name;
  const key = `${name.toLowerCase()}|${c.adminCode}`;
  if ((best.get(key)?.population ?? -1) < c.population) {
    const [lon, lat] = c.loc.coordinates;
    best.set(key, { name, state: c.adminCode, population: c.population, lat, lon });
  }
}

// ---- Area codes ----
const STATE_NAMES = { "Washington D.C.": "DC", "Washington State": "WA" };
const STATE_ABBR = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
for (const [code, name] of Object.entries(STATE_ABBR)) STATE_NAMES[name] = code;
const norm = (s) => s.toLowerCase().replace(/\bsaint\b/g, "st").replace(/\bmount\b/g, "mt").replace(/\bfort\b/g, "ft").replace(/[^a-z0-9]/g, "");
const MAX_CODES = 3;
// Known errors in the source data.
const OVERRIDES = { "New York|NY": "212 / 646 / 917" };
const NEAR_KM = 40;

const geo = deserialize(readFileSync(new URL("../node_modules/libphonenumber-geo-carrier/resources/geocodes/en/1.bson", import.meta.url)));
const cityCodes = new Map(); // "norm|ST" -> Map(npa -> weight)
const stateCodes = new Map(); // "ST" -> Set(npa)
for (const [prefix, place] of Object.entries(geo)) {
  const npa = prefix.slice(0, 3);
  const m = /^(.+), ([A-Z]{2})$/.exec(place === "Washington D.C." ? "Washington, DC" : place);
  const st = m ? m[2] : STATE_NAMES[place];
  if (!st) continue;
  if (!stateCodes.has(st)) stateCodes.set(st, new Set());
  stateCodes.get(st).add(npa);
  if (!m) continue;
  const key = `${norm(m[1])}|${st}`;
  if (!cityCodes.has(key)) cityCodes.set(key, new Map());
  const w = cityCodes.get(key);
  w.set(npa, (w.get(npa) ?? 0) + (prefix.length === 3 ? 100 : 1)); // a whole area code named after the city wins
}
const exact = (c) => {
  const w = cityCodes.get(`${norm(c.name)}|${c.state}`);
  if (!w) return "";
  const ranked = [...w].sort((a, b) => b[1] - a[1]);
  // Drop stray codes that only cover a sliver of the city.
  return ranked.filter(([, n]) => n >= ranked[0][1] * 0.1).slice(0, MAX_CODES).map(([n]) => n).join(" / ");
};
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.hypot(x, (b.lat - a.lat) * r) * 6371;
};
const matched = [...best.values()].map((c) => ({ ...c, code: exact(c) })).filter((c) => c.code);
/** Exact match, else the nearest matched place in the same state, else the state's only area code. */
function areaCode(c) {
  if (OVERRIDES[`${c.name}|${c.state}`]) return OVERRIDES[`${c.name}|${c.state}`];
  const own = exact(c);
  if (own) return own;
  let near = null, d = NEAR_KM;
  for (const o of matched) {
    if (o.state !== c.state) continue;
    const dist = km(c, o);
    if (dist < d) [near, d] = [o, dist];
  }
  if (near) return near.code.split(" / ")[0];
  const only = stateCodes.get(c.state);
  return only?.size === 1 ? [...only][0] : "";
}

const byState = new Map();
for (const c of best.values()) {
  if (!byState.has(c.state)) byState.set(c.state, []);
  byState.get(c.state).push(c);
}

const rows = [];
for (const list of byState.values()) {
  list.sort((a, b) => b.population - a.population);
  if (SINGLE_MARKET_STATES.has(list[0].state)) list.splice(1);
  list.forEach((c, i) => {
    if (c.population >= MIN_POP || (i < PER_STATE_MIN && c.population >= PER_STATE_FLOOR)) {
      rows.push([c.name, c.state, c.population, areaCode(c)]);
    }
  });
}
rows.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));

writeFileSync(new URL("../lib/data/us-cities.json", import.meta.url), JSON.stringify(rows) + "\n");
console.log(`Wrote ${rows.length} cities in ${byState.size} states`);
