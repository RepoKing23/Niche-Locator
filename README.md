# Niche Locator

Type a local-service niche (e.g. **stairway installer**) and get a report of US cities where
**advertisers pay a lot for clicks** but **the organic Google results are weak**. That's the combination
you want for local SEO, lead-gen and rank-and-rent sites.

The report is a sortable, filterable table you can copy into Google Sheets or export to CSV / Excel.
Save the rows you like into named **keyword lists** and export them later.

## Choosing cities

The app covers about **4,300 US local-service markets**: every place with 10,000+ people, plus each state's
10 largest places so small states are covered too. Neighborhoods and abandoned or historical places are
excluded, and DC counts as one market. Under **Cities to research** you pick exactly which ones to run
before any credits are spent:

- Filter by state, market size (**Major** 250k+, **Mid** 50k–250k, **Small** under 50k), minimum population or name
- **Top N per state**, **Select all shown**, per-state checkboxes, or tick individual cities
- The selection and the cost estimate update live, and your last selection is remembered

Cost: about $0.002 per city for the live SERP check. A full national run (~4,300 cities) is about $9.
The app asks you to confirm any run over $5.

## How it works

| Step | Data (DataForSEO) | Cost |
|---|---|---|
| 1. Niche snapshot | Google Ads national volume, CPC, top-of-page bids, ads competition + Labs keyword difficulty for each keyword variant | ~$0.10 |
| 2. City SERP check | Live Google top 10 for the keyword in every city: weak sites (directories, job boards, social, big-box), city-targeted competitors, map pack & its review counts, ads | ~$0.002 / city |
| 3. *(optional)* Exact city demand | Google Ads volume + CPC targeted to each city (variants + "variant city") | ~$0.09 / city, ~5 s each (Google allows 12 requests/min) |

A 50-city run is about **$0.20**. Adding exact city demand adds about $4.50 and roughly 4–5 minutes.
Without step 3, city volume is **estimated** from national volume × population (marked `est.`) and CPC
uses the national value (marked `US`). Select rows and click **Exact city volume** to fetch real
numbers only for the cities you're interested in.

### Report columns

Opportunity score · Verdict · Ads Score · Organic Ease · City · State · Population · Market Size · Keyword · Monthly Searches · CPC · Bid Low / High ·
Ads Competition · Ads Index · Organic Difficulty · Organic Competition · Weak in Top 10 · Local Competitors ·
Map Pack · Map Pack Max Reviews · Ad Value / mo · 12-mo Trend · Google link. Hidden columns you can switch on
under **Columns**: Ads on SERP, YoY %, Niche KD (US), Volume/CPC source, Top 10 domains.

### How cities are ranked: high Google Ads + low organic competition

- **Ads Score (0–100)** = 50% CPC (log scale, $50 = max) + 30% Google Ads competition index + 20% paid ads actually seen
  on the city's live Google results (when a SERP check ran; otherwise that weight goes to CPC and competition).
- **Organic Ease (0–100)** = 100 − organic difficulty. Estimated difficulty is pulled halfway toward 50, so a guess
  can't look like a sure win.
- **Opportunity (0–100)** = 45% Ads Score + 45% Organic Ease + 10% search volume. Ties go to the higher Ads Score.
- **Verdict:** **Target** (Ads Score ≥ 60 *and* Organic Ease ≥ 60, organic from city KD or a live SERP) ·
  **Target?** (same, but organic only estimated: confirm it) · **Ads only** (advertisers pay, organic is hard) ·
  **Easy, low value** (easy organic, weak ads) · **Skip**.
- **High Ads / Low Organic** button = Verdict is Target or Target?. Untick *Target?* in the Verdict chips to see
  confirmed rows only. You can also filter on Min Ads Score / Min Organic Ease.

**City-level ads data.** Every run (except Estimate only) makes one Google Ads request for the phrases people search,
e.g. "plumber tampa": ~$0.09 for up to 1,000 cities. It gives each city its **own CPC, top-of-page bids and competition**.
In a real test, "plumber tampa" had a $44.64 CPC and index 73, while "plumber new york" had $13.49 and index 41. Cities
without ads data for the phrase keep the national value, marked `US`. Exact city-targeted Google Ads data
("Exact city volume") still wins when you fetch it.

**Spend where it matters:** **Confirm targets** runs a queued SERP check (~$0.0006/city) only on Target / Target?
rows that haven't been SERP-checked, so paid checks go to cities that already look like high ads + low organic.
On Keyword Lists, **Accurate data → Only Target / Target? rows** does the same for saved rows.

**Organic difficulty (0–100)** is calculated from the live SERP. Each strong result that targets the
city counts heavily, other strong results count a little, and a map pack with lots of reviews adds some.
Directories, job boards, social media and big-box stores count as weak. National keyword difficulty is
usually empty for city-level keywords, so the live SERP is the better signal.

### Filters & export

- **High Ads / Low Organic** preset: CPC ≥ $5, Ads Index ≥ 50, Organic Difficulty ≤ 30 (adjust the fields as needed)
- Search, state, min population / searches / CPC / ads index / score, max organic difficulty, organic competition level
- Click a header to sort. Large results are paginated (100 rows per page); the header checkbox selects every filtered row across all pages
- **Apply to: Selected (N) / All (M)** decides which rows every button uses: copy, exports, save to list, re-check
- **Full report (Excel)** creates one workbook with:
  - **Summary**: niche snapshot (US volume, CPC, bids, ads competition, KD), coverage counts, top 10 opportunities, the filters you used, and how to read the numbers
  - **Shortlist**: the cities left after your filters or row selection (only included when you filtered or selected rows)
  - **All Cities**: every city and every column, sorted by score, with color-coded score/competition, $ formats, frozen header, autofilter, column tooltips and clickable Google links
  - **Keyword Variants**: national data for each variant with 12 monthly values
  - **SERP Details**: per city, the weak domains, local competitors, map pack, ads and the top 10 domains
- **Copy** puts tab-separated rows on the clipboard, so they paste into Sheets/Excel as columns. **Export CSV** and **Export table (Excel)** download only the table.
- Table exports include only the visible columns and follow your current filters and sort
- Each finished report is saved (to Supabase when it's set up, otherwise in this browser); reopen it from **Saved reports** without paying again
- Excel files are built in your browser, so big reports have no upload size limit

## Keyword lists

Tick rows on the Research tab and click **Save to list ▾**. Pick an existing list or type a name to create one.
A list can mix niches and runs. Saving the same city/niche again refreshes its numbers and keeps your note.

### Organic difficulty per city: pick how much to spend

| Option | Cost | What you get |
|---|---|---|
| **City ads + keyword difficulty** (default) | ~$0.0001/city + $0.01/request | DataForSEO Labs difficulty for the real search phrase, e.g. "plumber austin". Most cities get a value; rare phrases return none and keep the estimate |
| **Queued SERP check** | ~$0.0006/city | Full live top-10 analysis (weak sites, local competitors, map pack), results in ~1–5 min |
| **Live SERP check** | ~$0.002/city | Same analysis, results in seconds |
| **Estimate only** | free | Size-based guess: 10 + ½ national KD + up to 35 for city size |

The table marks the source: a plain number is a live SERP result, **KD** means city keyword difficulty, and **est.** means
estimate. When several are available, a SERP result wins over KD, which wins over the estimate. SERP modes also fetch KD, so
cities a SERP check can't cover still get a real number. SEMrush isn't used: its API needs a ~$500/mo plan and only has
national difficulty.

**Nothing is paid for twice.** Every KD, SERP and city-volume result is cached for 30 days (in Supabase when it's set
up and shared across your account, otherwise in this browser's IndexedDB). Re-runs, reopened reports and Accurate data
reuse cached results for free, and the app tells you how many were reused. Tick **Refresh** to force new data. Queued SERP
tasks are remembered too: if you close the tab before they finish, they're collected the next time you open the app.

### Save credits: scan cheap, check only your shortlist

1. On **Research**, choose **City keyword difficulty** (or **Estimate only**). A 50-city run then costs about $0.12
   (or $0.10), and even all ~4,300 cities stay around $0.55. City numbers are estimates based on national data, and
   **Organic Diff.** is estimated too (marked `est.`): 10 + ½ × the niche's national keyword difficulty + up to 35
   for city size (bigger metros have more established competitors). A live SERP check replaces it with the real value.
2. Tick the cities that look promising and **Save to list**.
3. On **Keyword Lists**, select those rows (or use *All*) and click **Accurate data ▾**. Choose any of:
   - **City keyword difficulty** (~$0.0001/row)
   - **SERP check**, queued (~$0.0006/row, 1–5 min) or live (~$0.002/row): organic difficulty, weak sites, local competitors, map pack
   - **Exact city volume & CPC** (~$0.09/row, ~5 s each): Google Ads data targeted to that city

   The cost estimate is shown first (runs over $1 ask you to confirm). Results are saved into the list, scores are
   recalculated, and notes are kept. The **Data** column shows each row's accuracy: *Estimated*, *SERP checked* or *Exact*.
   You can stop a run part-way; rows already checked stay saved.

The **Keyword Lists** tab shows your lists with row counts (create, rename ✎, delete ✕). For the open list you can:
- filter, sort and search (including by niche and note), and edit the **Note** column inline
- **Move to** / **Copy to** another list, or **Remove** rows
- export **all rows or only the selected rows** (Apply to: Selected / All) as Copy, CSV, Excel table, or
  **Full report (Excel)** (Summary, Rows with niche + notes, SERP Details)

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

### Supabase (login + cloud storage)

Without Supabase the app has no login, and lists and reports are stored in your browser only. With Supabase,
every page and API route requires sign-in, so nobody else can spend your DataForSEO credits. Each user sees only
their own lists and reports (enforced by row-level security in the database).

1. **Create the tables.** Either:
   - with the Supabase GitHub integration, set the Supabase directory to `supabase` and a production branch
     (this repo has no `main` yet). The integration applies `supabase/migrations/*.sql` when that branch changes, or
   - paste each file in `supabase/migrations/` in order (`20260929…_keyword_lists.sql`,
     `20260930…_api_cache.sql`, `20261001…_api_cache_ads.sql`) into the Supabase **SQL Editor** and run it.
2. **Keys:** from Project Settings → API, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   in `.env.local` (and in Vercel's environment variables).
3. **Auth:** Authentication → Providers → Email is on by default. Under Authentication → URL Configuration,
   set the Site URL to your app's URL and add `https://<your-app>/auth/callback` (and
   `http://localhost:3000/auth/callback`) to Redirect URLs, for magic links and email confirmation.
4. Restart the app. You'll be sent to `/login`: create an account, confirm your email, and sign in.
   To keep it private, turn off new signups after creating your account (Authentication → Providers → Email →
   *Allow new users to sign up*).

## Development

```bash
npm test          # unit tests (parsers vs. real DataForSEO responses, city data, stores, workbooks,
                  # and the Supabase migration + row-level security run in PGlite)
npm run lint
npm run build
```

Code map: `lib/dataforseo.ts` (API client + parsers), `lib/scoring.ts` (difficulty, score, city rows),
`lib/reportWorkbook.ts` (Excel reports), `lib/reportColumns.ts` (column definitions), `lib/cities.ts` +
`lib/data/us-cities.json` (city markets; regenerate with `node scripts/build-cities.mjs`), `lib/store/*`
(Supabase and browser storage for lists/reports), `lib/supabase/*` + `proxy.ts` (auth), `lib/mock.ts` (demo data),
`app/api/*` (DataForSEO routes), `components/*` (UI), `supabase/migrations/*` (database schema).
