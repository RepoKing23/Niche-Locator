# Niche Locator

Type a local-service niche (e.g. **stairway installer**) and get a report of US cities where
**advertisers pay a lot for clicks** but **the organic Google results are weak**. That's the combination
you want for local SEO, lead-gen and rank-and-rent sites.

The report is a sortable, filterable table you can copy into Google Sheets or export to CSV / Excel.

## How it works

| Step | Data (DataForSEO) | Cost |
|---|---|---|
| 1. Niche snapshot | Google Ads national volume, CPC, top-of-page bids, ads competition + Labs keyword difficulty for each keyword variant | ~$0.10 |
| 2. City SERP check | Live Google top 10 for the keyword in every city: weak sites (directories, job boards, social, big-box), city-targeted competitors, map pack & its review counts, ads | ~$0.002 / city |
| 3. *(optional)* Exact city demand | Google Ads volume + CPC targeted to each city (variants + "variant city") | ~$0.09 / city, ~5 s each (Google allows 12 requests/min) |

A 50-city run is about **$0.20**. Adding exact city demand adds about $4.50 and roughly 4–5 minutes.
Without step 3, city volume is **estimated** from national volume × population (marked `est.`) and CPC
uses the national value (marked `US`). Select rows and click **Get exact city volume** to fetch real
numbers only for the cities you're interested in.

### Report columns

Opportunity score · City · State · Population · Keyword · Monthly Searches · CPC · Bid Low / High ·
Ads Competition · Ads Index · Organic Difficulty · Organic Competition · Weak in Top 10 · Local Competitors ·
Map Pack · Map Pack Max Reviews · Ad Value / mo · 12-mo Trend · Google link. Hidden columns you can switch on
under **Columns**: Ads on SERP, YoY %, Niche KD (US), Volume/CPC source, Top 10 domains.

**Opportunity score (0–100)** = 30% CPC (log scale, $50 max) + 20% ads competition + 35% organic ease
(100 − organic difficulty) + 15% local search volume.

**Organic difficulty (0–100)** is calculated from the live SERP. Each strong result that targets the
city counts heavily, other strong results count a little, and a map pack with lots of reviews adds some.
Directories, job boards, social media and big-box stores count as weak. National keyword difficulty is
usually empty for city-level keywords, so the live SERP is the better signal.

### Filters & export

- **High Ads / Low Organic** preset: CPC ≥ $5, Ads Index ≥ 50, Organic Difficulty ≤ 30 (adjust the fields as needed)
- Search, state, min population / searches / CPC / ads index / score, max organic difficulty, organic competition level
- Click a header to sort; tick rows to copy or export only those rows
- **Download full report (Excel)** creates one workbook with:
  - **Summary**: niche snapshot (US volume, CPC, bids, ads competition, KD), coverage counts, top 10 opportunities, the filters you used, and how to read the numbers
  - **Shortlist**: the cities left after your filters or row selection (only included when you filtered or selected rows)
  - **All Cities**: every city and every column, sorted by score, with color-coded score/competition, $ formats, frozen header, autofilter, column tooltips and clickable Google links
  - **Keyword Variants**: national data for each variant with 12 monthly values
  - **SERP Details**: per city, the weak domains, local competitors, map pack, ads and the top 10 domains
- **Copy** puts tab-separated rows on the clipboard, so they paste into Sheets/Excel as columns. **Export CSV** and **Export table (Excel)** download only the table.
- Table exports include only the visible columns and follow your current filters and sort
- Each finished report is saved in your browser; reopen it from **Saved reports** without paying again

## Setup

```bash
npm install
cp .env.local.example .env.local   # add your DataForSEO API login + password
npm run dev                        # http://localhost:3000
```

Without credentials the app runs in **demo mode** with made-up data, so you can try the UI for free.

1. Create an account at <https://dataforseo.com> and add funds (pay-as-you-go).
2. Copy the API login and password from <https://app.dataforseo.com/api-access> into `.env.local`.
3. Restart `npm run dev`. The banner switches to **Live**.

To deploy, push the repo to Vercel and set `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` as environment
variables. The credentials only live on the server; the browser never sees them.

## Development

```bash
npm test          # unit tests (parsers tested against real DataForSEO responses in tests/fixtures)
npm run lint
npm run build
```

Code map: `lib/dataforseo.ts` (API client + parsers), `lib/scoring.ts` (difficulty, score, city rows), `lib/reportWorkbook.ts` (full Excel report), `lib/reportColumns.ts` (column definitions),
`lib/cities.ts` (216 largest US cities), `lib/mock.ts` (demo data), `app/api/*` (server routes),
`components/*` (UI).
