// Generates lib/data/us-cities.json from GeoNames (npm "all-the-cities").
// Keeps real local-service markets: populated places with 10k+ people, plus each
// state's 10 largest places with 2.5k+ so small states are still covered.
// Run: node scripts/build-cities.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const all = require("all-the-cities");

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
  if ((best.get(key)?.population ?? -1) < c.population) best.set(key, { name, state: c.adminCode, population: c.population });
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
      rows.push([c.name, c.state, c.population]);
    }
  });
}
rows.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));

writeFileSync(new URL("../lib/data/us-cities.json", import.meta.url), JSON.stringify(rows) + "\n");
console.log(`Wrote ${rows.length} cities in ${byState.size} states`);
