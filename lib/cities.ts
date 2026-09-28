export type City = {
  id: string;
  name: string;
  state: string;
  stateCode: string;
  population: number;
};

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Top 200 US cities by population (2020 Census, rounded).
const RAW: [string, string, number][] = [
  ["New York", "NY", 8804000], ["Los Angeles", "CA", 3899000], ["Chicago", "IL", 2746000],
  ["Houston", "TX", 2304000], ["Phoenix", "AZ", 1608000], ["Philadelphia", "PA", 1603000],
  ["San Antonio", "TX", 1434000], ["San Diego", "CA", 1386000], ["Dallas", "TX", 1304000],
  ["San Jose", "CA", 1013000], ["Austin", "TX", 961000], ["Jacksonville", "FL", 949000],
  ["Fort Worth", "TX", 918000], ["Columbus", "OH", 905000], ["Indianapolis", "IN", 887000],
  ["Charlotte", "NC", 874000], ["San Francisco", "CA", 873000], ["Seattle", "WA", 737000],
  ["Denver", "CO", 715000], ["Washington", "DC", 689000], ["Nashville", "TN", 689000],
  ["Oklahoma City", "OK", 681000], ["El Paso", "TX", 678000], ["Boston", "MA", 675000],
  ["Portland", "OR", 652000], ["Las Vegas", "NV", 641000], ["Detroit", "MI", 639000],
  ["Memphis", "TN", 633000], ["Louisville", "KY", 633000], ["Baltimore", "MD", 585000],
  ["Milwaukee", "WI", 577000], ["Albuquerque", "NM", 564000], ["Tucson", "AZ", 543000],
  ["Fresno", "CA", 542000], ["Sacramento", "CA", 524000], ["Kansas City", "MO", 508000],
  ["Mesa", "AZ", 504000], ["Atlanta", "GA", 499000], ["Omaha", "NE", 486000],
  ["Colorado Springs", "CO", 479000], ["Raleigh", "NC", 468000], ["Long Beach", "CA", 467000],
  ["Virginia Beach", "VA", 460000], ["Miami", "FL", 442000], ["Oakland", "CA", 440000],
  ["Minneapolis", "MN", 429000], ["Tulsa", "OK", 413000], ["Bakersfield", "CA", 403000],
  ["Wichita", "KS", 397000], ["Arlington", "TX", 394000], ["Aurora", "CO", 386000],
  ["Tampa", "FL", 384000], ["New Orleans", "LA", 384000], ["Cleveland", "OH", 373000],
  ["Honolulu", "HI", 350000], ["Anaheim", "CA", 346000], ["Lexington", "KY", 322000],
  ["Stockton", "CA", 320000], ["Corpus Christi", "TX", 317000], ["Henderson", "NV", 317000],
  ["Riverside", "CA", 314000], ["Newark", "NJ", 311000], ["Saint Paul", "MN", 311000],
  ["Santa Ana", "CA", 310000], ["Cincinnati", "OH", 309000], ["Irvine", "CA", 308000],
  ["Orlando", "FL", 307000], ["Pittsburgh", "PA", 303000], ["St. Louis", "MO", 301000],
  ["Greensboro", "NC", 299000], ["Jersey City", "NJ", 292000], ["Anchorage", "AK", 291000],
  ["Lincoln", "NE", 291000], ["Plano", "TX", 285000], ["Durham", "NC", 283000],
  ["Buffalo", "NY", 278000], ["Chandler", "AZ", 275000], ["Chula Vista", "CA", 275000],
  ["Toledo", "OH", 270000], ["Madison", "WI", 269000], ["Gilbert", "AZ", 267000],
  ["Reno", "NV", 264000], ["Fort Wayne", "IN", 263000], ["North Las Vegas", "NV", 262000],
  ["St. Petersburg", "FL", 258000], ["Lubbock", "TX", 257000], ["Irving", "TX", 256000],
  ["Laredo", "TX", 255000], ["Winston-Salem", "NC", 249000], ["Chesapeake", "VA", 249000],
  ["Glendale", "AZ", 248000], ["Garland", "TX", 246000], ["Scottsdale", "AZ", 241000],
  ["Norfolk", "VA", 238000], ["Boise", "ID", 235000], ["Fremont", "CA", 230000],
  ["Spokane", "WA", 228000], ["Santa Clarita", "CA", 228000], ["Baton Rouge", "LA", 227000],
  ["Richmond", "VA", 226000], ["Hialeah", "FL", 223000], ["San Bernardino", "CA", 222000],
  ["Tacoma", "WA", 219000], ["Modesto", "CA", 218000], ["Huntsville", "AL", 215000],
  ["Des Moines", "IA", 214000], ["Yonkers", "NY", 211000], ["Rochester", "NY", 211000],
  ["Moreno Valley", "CA", 208000], ["Fayetteville", "NC", 208000], ["Fontana", "CA", 208000],
  ["Columbus", "GA", 206000], ["Worcester", "MA", 206000], ["Port St. Lucie", "FL", 204000],
  ["Little Rock", "AR", 202000], ["Augusta", "GA", 202000], ["Oxnard", "CA", 202000],
  ["Birmingham", "AL", 200000], ["Montgomery", "AL", 200000], ["Frisco", "TX", 200000],
  ["Amarillo", "TX", 200000], ["Salt Lake City", "UT", 200000], ["Grand Rapids", "MI", 199000],
  ["Huntington Beach", "CA", 198000], ["Overland Park", "KS", 197000], ["Glendale", "CA", 196000],
  ["Tallahassee", "FL", 196000], ["Grand Prairie", "TX", 196000], ["McKinney", "TX", 195000],
  ["Cape Coral", "FL", 194000], ["Sioux Falls", "SD", 192000], ["Peoria", "AZ", 190000],
  ["Providence", "RI", 190000], ["Vancouver", "WA", 190000], ["Knoxville", "TN", 190000],
  ["Akron", "OH", 190000], ["Shreveport", "LA", 187000], ["Mobile", "AL", 187000],
  ["Brownsville", "TX", 186000], ["Newport News", "VA", 186000], ["Fort Lauderdale", "FL", 182000],
  ["Chattanooga", "TN", 181000], ["Tempe", "AZ", 180000], ["Aurora", "IL", 180000],
  ["Santa Rosa", "CA", 178000], ["Eugene", "OR", 176000], ["Elk Grove", "CA", 176000],
  ["Salem", "OR", 175000], ["Ontario", "CA", 175000], ["Cary", "NC", 174000],
  ["Rancho Cucamonga", "CA", 174000], ["Oceanside", "CA", 174000], ["Lancaster", "CA", 173000],
  ["Garden Grove", "CA", 172000], ["Pembroke Pines", "FL", 171000], ["Fort Collins", "CO", 169000],
  ["Palmdale", "CA", 169000], ["Springfield", "MO", 169000], ["Clarksville", "TN", 166000],
  ["Murfreesboro", "TN", 153000], ["Salinas", "CA", 163000], ["Hayward", "CA", 162000],
  ["Paterson", "NJ", 159000], ["Alexandria", "VA", 159000], ["Macon", "GA", 157000],
  ["Corona", "CA", 157000], ["Kansas City", "KS", 156000], ["Lakewood", "CO", 156000],
  ["Springfield", "MA", 155000], ["Sunnyvale", "CA", 155000], ["Jackson", "MS", 153000],
  ["Killeen", "TX", 153000], ["Hollywood", "FL", 153000], ["Murrieta", "CA", 110000],
  ["Pasadena", "TX", 151000], ["Bridgeport", "CT", 149000], ["Naperville", "IL", 149000],
  ["Escondido", "CA", 151000], ["Joliet", "IL", 150000], ["Rockford", "IL", 148000],
  ["Savannah", "GA", 148000], ["Mesquite", "TX", 150000], ["Syracuse", "NY", 148000],
  ["Pomona", "CA", 151000], ["Orange", "CA", 140000], ["Fullerton", "CA", 143000],
  ["McAllen", "TX", 142000], ["Denton", "TX", 139000], ["Waco", "TX", 138000],
  ["Visalia", "CA", 141000], ["Thornton", "CO", 141000], ["West Valley City", "UT", 140000],
  ["Columbia", "SC", 137000], ["Olathe", "KS", 141000], ["Carrollton", "TX", 133000],
  ["Midland", "TX", 132000], ["Charleston", "SC", 150000], ["Gainesville", "FL", 141000],
  ["Round Rock", "TX", 119000], ["Miramar", "FL", 134000], ["Cedar Rapids", "IA", 137000],
  ["New Haven", "CT", 134000], ["Stamford", "CT", 135000], ["Elizabeth", "NJ", 137000],
  ["Athens", "GA", 127000], ["Thousand Oaks", "CA", 127000], ["Lafayette", "LA", 121000],
  ["Simi Valley", "CA", 126000], ["Topeka", "KS", 126000], ["Norman", "OK", 128000],
  ["Fargo", "ND", 125000], ["Wilmington", "NC", 115000], ["Abilene", "TX", 125000],
  ["Odessa", "TX", 114000], ["Columbia", "MO", 126000], ["Pearland", "TX", 125000],
];

export const CITIES: City[] = RAW.map(([name, stateCode, population]) => ({
  id: `${name}-${stateCode}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  state: STATES[stateCode],
  stateCode,
  population,
})).sort((a, b) => b.population - a.population);

export const STATE_CODES = [...new Set(CITIES.map((c) => c.stateCode))].sort();

/** Location string accepted by DataForSEO's `location_name` parameter. */
export function dataForSeoLocationName(city: City): string {
  return `${city.name},${city.state},United States`;
}

export function findCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}
