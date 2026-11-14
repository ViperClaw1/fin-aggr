# ADR-020: Ingest is a separate package with a publish-or-hold pipeline

- Status: accepted
- Date: 2026-11-04 (accepted 2026-11-04)
- Relates to: ADR-004, ADR-006, ADR-007 (provenance), ADR-013, ADR-014, ADR-019

## Context
Stage 2 loads public data about banks, credit unions, Treasury, taxes, and insurance, and scrapes public rate pages. The site must keep serving the last good version when a source breaks or a value looks wrong. Invariant 6: a number without a checked source is `unverified`, not an invented value.

`SourceRegistryEntry.kind` is `official_api | official_document | issuer_document | partner_feed | manual`. The operational registry also needs a scrape source and a schedule. Those are not the same enum. Field codes of FDIC, NCUA, FRED, and Treasury are not chosen here. Step 6 of the plan writes each mapping into this ADR only after the OpenAPI spec or the source dictionary has been read.

Scraping rules have to live in code. A rule that exists only in the plan will not stop a connector.

## Decision
`packages/ingest` owns connectors, bank adapters, the pipeline, and the CLI. `apps/web` does not import it. It does not import `apps/web` or `@fa/fixtures`. It validates with `@fa/contracts` on the way in. The web gateway validates again on the way out (ADR-019).

A source is:

```ts
interface Source<Raw, Parsed> {
  id: string; // 'fdic-institutions', 'bank:fdic_52744', ...
  domain: Domain;
  fetch(ctx: FetchContext): Promise<RawSnapshot<Raw>>;
  parse(raw: Raw): Parsed[]; // pure, tested on recorded snapshots
  validate(rows: Parsed[], previous: Parsed[]): ValidationReport;
}
```

`Domain` is the set in ADR-019. Pipeline:

1. `fetch` stores the response bodies in the private `raw` bucket with their sha256. The hash is the bodies in page order. `retrievedAt` stays on the in-memory snapshot for provenance and is not part of the hash or the stored bytes. An unchanged hash stops the run. The default budget is 30s for one request and 30s for the whole fetch. A source may set its own. `FetchContext.requestSignal()` is the per-request signal combined with the budget through `AbortSignal.any`. A thrown run stores `{stage, code}` in `job_runs.errors` and logs `source <id> failed stage=<stage> code=<code>`. The log does not include the URL or the payload.
2. `parse` is pure. Tests use saved snapshots.
3. `validate` checks `@fa/contracts`, then the product bounds accepted 2026-11-04: APY from 0 to 15%, a positive term, and a minimum deposit `>= 0`. A rate move of more than 50 basis points goes to review. An empty result, or one smaller than half the previous count, blocks the publish. The current version is not a baseline when `is_mock` is true: `previousRows` is empty, so the seed does not trip the count gate or a move check. The code reads the bounds from `PRODUCT_BOUNDS` in `packages/ingest`, so a revision is not a hunt through connectors.
4. A clean report publishes the domain. A scrape publishes its clean products and queues the suspicious ones. Any other suspicious domain is not published. A hard error leaves the previous version in place and notifies.
5. Publish is the one transaction from ADR-019, then `POST /api/revalidate`.
6. The run is a row in `job_runs` (source, start, end, status, row count, errors, bytes and request count for that registrable domain).

Provenance. Official APIs: `verified`, `by: official_api`, `sourceUrl` of the actual request. Scrapes: `unverified` until a person approves, then `verified`, `by: human`. No source: do not invent the value; open a review item.

`sources.kind` for operations is `official_api | scrape | manual`. The public `SourceRegistryEntry` stays as it is until the first scraped source is listed. That change adds `scrape` to the enum (additive, step 8). `partner_feed` stays unused.

Review has no admin UI. `pnpm ingest:review`, `pnpm ingest:approve <id>`, and `pnpm ingest:reject <id> --reason` are the interface. A bot opens one issue per batch, with the snapshot and the diff, in a separate private repository. This repository stays public, and review tasks are not filed here.

Review owner is the GitHub login `ViperClaw1` (the issue assignee). There is no deputy: an overdue item stays held and the site keeps the previous version. Three days is a signal, not an SLA. A daily workflow comments on the private issue and mentions the assignee when `status = 'open'` and `created_at` is older than three days. The two-person check is the tax rule only.

`decided_by` is that GitHub login, never an email. The CLI reads `gh api user --jq .login` or `FA_REVIEWER` in `.env.local` and refuses to run without one. A rejected row requires a non-empty `decision_reason` (NULL does not pass the check). Approve writes the decision and publishes in one transaction, then calls revalidate. Supabase Studio can show the queue; it cannot approve.

The private repository is `ViperClaw1/fin-aggr-review` (issues only). The bot uses a fine-grained PAT in the Actions secret `REVIEW_REPO_TOKEN` (Issues read and write, that repository only, 90 days). A GitHub App replaces it later. `GITHUB_TOKEN` from this repository cannot write there.

Review data never appears in public Actions logs or artifacts. The bot's stdout is `issue #N created`. Nothing is uploaded as an artifact. Snapshot links in the private issue are signed URLs from the private `raw` bucket, valid for 7 days. `pnpm ingest:review <id>` mints a new one. The workflow is checked for `upload-artifact` and for log lines that are not the fixed counters.

`review_queue` stores `decided_by`, `decided_at`, `decision_reason`, and `issue_url` (the step 4 migration).

An admin UI is revisited only when the queue exceeds 20 items in a week, or more than 2 items in a month waited past 3 days, or a reviewer has no terminal. That UI is a separate `apps/admin`, not `apps/web`.

Raw snapshots in `raw`: a snapshot that a version still in the 30-day window points at is kept while that version is kept. Other snapshots are kept 90 days. This is still the working rule at step 8.1. It is both a storage cost and a question of keeping someone else's text; the lawyer sees it at step 9, before a scraped page is published.

GitHub-hosted runner addresses are often blocked as bots. Accepted at step 8.1: a block switches that institution to manual mode. Proxy rotation stays rejected. A worker with a static IP is not added.

Schedule is GitHub Actions (`schedule`), one workflow per cadence, `concurrency` per source, `timeout-minutes`, one retry on a network error. The cadence table is in `docs/plan-stage-2.md` (step 5). The scrape stays on those runners: a block is manual mode, not a move to a static-IP worker. A move off Actions for lack of minutes stays a later decision. Tax tables are a manual yearly job. A new tax year is loaded as `unverified` and is not published until two people have checked it. `TAX_YEAR` changes in one commit after that.

Scraping rules, enforced by `createScrapeSession` (step 8.1), not only by this text:

- Public pages only. `https`, no userinfo, no non-default port, no login or account path. No cookies and no acceptance of terms.
- `robots.txt` of the page origin is read once per host before a path on that host (`robots-parser`). A disallowed path, or a robots response that is itself a block, puts that institution into manual mode. The rate-limit key is the registrable domain, not the host: `www.bank.com` and `bank.com` share one gap. Crawl-delay is not that gap.
- At most one request per 10 seconds per registrable domain (the long end of the 5–10 second range, fixed). One session for the whole `bank-rates` run, and only while the local hour in the bank's time zone is 22, 23, or 0–5. Send `If-None-Match` and `If-Modified-Since` when the previous response stored them.
- The User-Agent is `FA (+https://fin-aggr.vercel.app; <mailbox>)`. The mailbox is `FA_SCRAPE_MAILBOX`, a project address, not a personal one. A bank run with no mailbox fails before the first request. The address itself is still chosen by the owner.
- A captcha, or HTTP 401, 403, or 429, stops the adapter, logs `source <id> manual <reason>`, and sets `sources.status` to `manual` when `SUPABASE_DB_URL` is set. The protection is not bypassed and the request is not retried with a different address.
- Each contacted registrable domain logs `load <domain> requests=N bytes=N`. `job_runs.bytes` and `job_runs.request_count` remain the per-run totals the adapter passes through when it publishes.
- A bank's opt-out is `sources.excluded`, applied with `pnpm ingest:exclude <bank-id> --requested <iso>`. The login is `FA_REVIEWER` (the responsible person is `ViperClaw1`, the same owner as the review queue). The row stores the request time, the application time, and that login. Later than 24 hours still excludes the bank and logs `source <id> excluded late`.
- Keep facts and short quotes. `quote` clips to the 400-character fact limit. Page and PDF snapshots stay in the private `raw` bucket.

Bank registry (step 8.2, 2026-11-12). A scrape source id is `bank:` plus the institution id (`bank:fdic:3510`). The row uses `operational_kind = scrape` and public `kind = issuer_document`. `SourceRegistryEntry` does not gain `scrape` until a bank is shown on the site; listing a bank that has no adapter yet would publish a source with no rates. `license` is the label `issuer terms`: the column cannot be empty, and this is not a claim that the bank granted a license. An excluded or manual row is not rewritten. Dropping a bank from the cohort does not delete the row.

The plan's three cohorts are applied in order, and a bank is in only the first one it matches. The pilot is at most 10 direct banks, in the order of an explicit id list. FDIC `institutions` has a website and no rate, and financials are not connected, so the ten "high rate" banks are not derived and are not invented. The next cohort is at most 50 other direct banks that have a public https page, ordered by a deposit figure in integer cents supplied by the caller. A missing website or a non-public URL is skipped there; a named pilot bank with either fails the selection. Credit unions come last, and only when their id is on an explicit open-membership list. NCUA 5300 is not connected, and the institution row has no membership field. The headquarters state maps to one IANA time zone (the larger part where a state is split). `ratesChannel` stays `unchecked`: this step does not request the bank's site to look for a public rates API.

Adapters, cheapest first: JSON already on the page (`application/ld+json`, framework data, or the page's own public JSON), then HTML selectors from a config, then Playwright only when the rates are absent without JavaScript. If the institution has a public rates API or a developer page that accepts an email registration, use that instead of scraping. Each adapter normalizes to `Product`. Eligibility (residency, state, minimum) is entered by a person the first time; after that the adapter watches for changes. A broken adapter (empty, half the products, unknown structure) publishes nothing. The previous rows stay, with their freshness.

Bank PDFs (Truth in Savings) are hashed into `documents`. Text comes from pdf.js. Extracted facts are proposals until a person confirms them. The viewer highlight is clipped to the quote's characters (the limit recorded in ADR-018).

Connectors land in the plan's order: FDIC institutions, FDIC financials, NCUA 5300, FDIC national rates via FRED, then Treasury. Market median, mean, and percentile for bank health are computed in ingest over the banks of that quarter. The method is stated on `/methodology`. The mapping from each source field to `MetricKey` is added to this ADR in step 6, from the source's own dictionary.

## Source fields

### FDIC institutions (2026-11-09)

Read from [`institution_properties.yaml`](https://api.fdic.gov/banks/docs/institution_properties.yaml) and [`swagger.yaml`](https://api.fdic.gov/banks/docs/swagger.yaml) (`GET /institutions`, server `/banks`). The 07:00 job is registered (`ready: true`) and publishes an `institutions` version through the pipeline ports. A ready source with no job fails the run. Sources without `ready` still log `pending`. The stdout line is `source fdic-institutions <status> rows=<n> queued=<n> version=<id>`.

| FDIC field | FDIC definition | Our field |
| --- | --- | --- |
| `CERT` | FDIC certificate number. The YAML types it as a string. A response read the same day returned a JSON integer. | `id` = `fdic:` plus the digits |
| `NAME` | Legal title | `name` |
| `STALP` | State abbreviation of the main office | `hqState` |
| `WEBADDR` | Primary internet address from the Call Report. It often has no scheme, and it is absent when the institution did not report one. | `website`. Empty or unparsable becomes null. A missing scheme is read as `https`. |
| `ACTIVE` | `1` open and insured, `0` closed or not insured | Rows other than `1` are omitted. The request filter is `ACTIVE:1`. |
| `BKCLASS` | Charter class. `CU` is a credit union supervised by NCUA. | `CU` → `credit_union`. Every other class (`N`, `NM`, `SM`, `SB`, `SA`, `OI`, and the rest of the description) → `direct_bank`. This feed has no `fintech_partner`. |

`regulator` is `FDIC`. `partnerInstitutionIds` is `[]`. Provenance is `verified`, `by: official_api`, `isMock: false`, and `sourceUrl` is that page's request URL.

The request sorts by `CERT` ascending, asks for `limit` 10000 (the OpenAPI maximum), and follows `offset` until `meta.total`. It stops at 20 pages. A row that is not an `Institution` fails the run, so a partial directory is not published. The previous version stays. A nightly request of one row checks that `meta.total` and `CERT`, `NAME`, `STALP`, `ACTIVE` are still present. The snapshot test does not call the network.

### FDIC financials (2026-11-12)

Read from [`risview_properties.yaml`](https://api.fdic.gov/banks/docs/risview_properties.yaml) (the Financial API Definitions file linked from the BankFind docs) and `GET /financials` on server `/banks`. The Monday 11:00 job is `ready`. The metrics row `as_of` is `REPDTE`, the last day of the reporting period. The version `as_of` is the run day: FDIC and NCUA share one current `bank_metrics` version, so the version date is not a quarter. The same quarter hashes the same and stays `held` with `unchanged`. Ratios are percent points. Each JSON number token is read as text, rounded half-up to four decimal places with decimal.js, then converted once with `toNumber()` because `MetricValue` stores a display percent. `ASSET` and `DEP` are already thousands of USD; they are stored as that integer and are not passed through `centsFromInteger`.

| `MetricKey` or column | FDIC field | Units | Formula |
| --- | --- | --- | --- |
| `tier1LeverageRatio` | `RBC1AAJ` LEVERAGE RATIO-PCA | percent | `RBCT1` / `AVASSETJ` |
| `totalRiskBasedCapitalRatio` | `RBCRWAJ` TOTAL RBC RATIO-PCA | percent | `RBC` / `RWAJT` |
| `allowanceToLoans` | `LNATRESR` LOAN LOSS RESERVE/GROSS LN&LS | percent | `LNATRES` / `LNLSGR` |
| `loansToDeposits` | `LNLSDEPR` NET LOANS & LEASES/DEPOSITS | percent | `LNLSNET` / `DEP` |
| `noncurrentLoansRatio` | `NCLNLSR` N/C LNS & LS/GROSS LNS & LS | percent | `NCLNLS` / `LNLSGRJ` |
| `returnOnAssets` | `ROA` Return on assets | percent | `NETINCA` / `ASSET5`. Net income after taxes and extraordinary items, annualized, as a percent of average total assets. |
| `liquidAssetsToAssets` | none | — | No title in the dictionary matches this ratio. The key is omitted. The page shows n/a. |
| `totalAssetsUsdThousands` | `ASSET` Total assets | thousands of USD | Sum of all assets. Off-balance-sheet items are excluded. |
| `deposits_usd_thousands` | `DEP` Total deposits | thousands of USD | Demand, money market, other savings, time, and foreign-office deposits. Nullable. A later registry step turns the digit string into cents by appending five zeros. |

FDIC and NCUA share the current `institutions` version and the current `bank_metrics` version. A publish copies every id that does not start with that run's prefix (`fdic:` or `ncua:`) and replaces only its own prefix. The count gate, the median, the mean, the percentile, and a quarterly jump are computed on that prefix alone. Copied rows are not recomputed. `mixed_quarter` looks only at the rows in the file being published. A first NCUA publish is not compared with the FDIC catalog.

`balanceSheetMix` is `[]`. The dictionary has no partition that sums to 1. A row with no `ASSET` or no `DEP` is skipped, so the page shows “no call report” rather than zero. A certificate that is not in the current `institutions` version is skipped. The directory is not part of the hashed body. A probe `filters=CERT:3510&fields=REPDTE&sort_by=REPDTE&sort_order=DESC&limit=1` reads the newest compact date from one bank and is not stored. Pages then use `filters=REPDTE:<YYYYMMDD>`, `sort_by=CERT`, `limit` 2500, until `meta.total`, and stop at 20 pages. Each request has its own 120s timeout. The whole fetch has a 600s budget. A timeout or a 5xx retries that page once after 5s and does not restart the source. `requestCount` counts attempts, including the probe and a retry. The workflow timeout is 15 minutes. A thrown run logs `source <id> failed stage=<stage> code=<code>` and stores that pair in `job_runs.errors`. The log has no URL and no row.

Bounds in `FINANCIAL_BOUNDS` are a review band, not an FDIC limit and not a percentile of the quarter: leverage, total RBC, allowance, and noncurrent loans 0–100 percent points; loans to deposits 0–300; return on assets −20–20. `outsideBand` is `value < low` or `value > high` on that fixed band. A value outside it is published with `outlier: 'band'`. A quarterly jump past that metric's `move` (leverage 2, total RBC 5, allowance 1, loans to deposits 25, noncurrent loans 2, return on assets 3 percentage points), while still inside the band, is `outlier: 'jump'`. Otherwise `outlier` is null. An outlier is excluded from the market median, mean, and percentile, and its own `percentile` is null, so the page says it is outside the market comparison instead of inventing a rank. `FINANCIAL_OUTLIER_SHARE` is `0.05`: the quarter is held when more than 5% of a metric's values are outside the band (`outlier_share`). It is also held when a ratio is outside −1000 to 10000 (`impossible`) or when the median of the in-band values jumps by more than that metric's `move` (`median_move`). Fewer than half the previous quarter’s rows is the existing `countGate`. Market median (even count: mean of the two middle values), mean, and percentile (share of in-band values at or below this bank) are half-up. The first published financials version stored `outlier: true`; readers treat that boolean as `band`. The method on `/methodology` is a DRAFT.

### eCFR title 12 parts 330, 745, and 328 (2026-11-10)

Read from the [versioner v1 documentation](https://www.ecfr.gov/developers/documentation/api/v1). Base `https://www.ecfr.gov/api/versioner/v1`. No API key. The full part XML is not stored. The 05:00 jobs are `ready`. Each is a `watch` source: fetch, store the content hash, parse, compare with the previous snapshot of that source. The hash is `part|latest_amendment_date|sorted identifiers` for the sections amended on that date. `retrievedAt` is not part of the hash. The same hash logs `source <id> unchanged`. The first snapshot logs `source <id> baseline` and opens no issue. A different fingerprint logs `source <id> changed queued=1`, inserts one `review_queue` row, and opens one private issue. The issue names the part, the amendment date, the section ids, and the eCFR link. Parts 330 and 745 also say to recheck the SMDIA and SMSIA quotes before changing the insurance limit. A watch run does not validate, publish, or revalidate. The public log has no title.

| Response field | Meaning | What we keep |
| --- | --- | --- |
| `meta.part` | CFR part requested with `?part=` | `part` |
| `meta.latest_amendment_date` | Newest `amendment_date` in the part. `result_count` is a string. | `amendmentDate`. This is the watch key, not `latest_issue_date`. |
| `meta.latest_issue_date` | Newest issue date. For part 328 on the saved response it is later than the amendment date. | Not a watch key. |
| `content_versions[].identifier` | Section, appendix, or supplement id | The identifiers whose `amendment_date` equals `latest_amendment_date`, sorted and joined |
| `content_versions[].amendment_date` | Amendment date of that section version | Used only to select the identifiers above |
| structure node `identifier`, `type`, `label_description` | Part node from `GET /structure/{date}/title-12.json?part=` | `identifier` must equal `meta.part`. `label_description` is the part title. The saved structure file is that node, not the section tree. |

A different amendment date or identifier set prints `ecfr 330 changed`. The same stamp prints `ecfr 330 unchanged`. Neither line includes the new date or title. A missing field prints `ecfr 330 shape …` and fails the job.

### Federal Register documents (2026-11-10)

Read from the [API v1 documentation](https://www.federalregister.gov/developers/documentation/api/v1) and the agency list `GET /api/v1/agencies.json`. No API key. `GET /api/v1/documents.json` with `conditions[agencies][]` set to one of `federal-deposit-insurance-corporation`, `national-credit-union-administration`, `consumer-financial-protection-bureau`, `internal-revenue-service`, `order=newest`.

| Response field | What we keep |
| --- | --- |
| `results[].document_number` | `documentNumber`. `YYYY-NNNNN`, or a correction prefix and that form. The live CFPB page included `C1-2025-19864`. The pattern is `^(?:[A-Z]\d-)?\d{4}-\d+$`. |
| `results[].publication_date` | `publicationDate` |
| `results[].title` | `title` |
| `results[].html_url` | `url`, only `https://www.federalregister.gov` |

`abstract`, `excerpts`, and the document body are not stored. An empty `results` array is a normal day. Fetch stores the response text. Parse reads it. A row with a bad number, date, title, or URL is skipped. More than half the rows on one agency page, or a body that is not a `results` envelope, fails that page with `fr_invalid_number`, `fr_invalid_date`, `fr_invalid_title`, `fr_invalid_url`, or `fr_envelope`. HTML or other non-JSON is `json_invalid`. The failure issue names the code and the agency slug. An unclassified error is `unknown`. The 05:00 job is a `watch` source. The hash is the response bodies, without `retrievedAt`. The comparison set is the parsed document numbers. The first snapshot is a baseline and opens no issue. A later run queues one review only when a document number was not in the previous snapshot. An empty day, or a page that only drops old numbers, logs `source federal-register unchanged` and does not replace the stored set. The issue lists each new document's number, date, title, and link. The public log does not. The run does not publish. The nightly shape check parses twenty IRS documents.

### Deposit insurance limit quote (2026-11-10)

The fixture limit stays `$250,000`, `unverified`, `isMock: false`. The ingest quote is the definition sentence of 12 CFR 330.1(o) (SMDIA) and 12 CFR 745.1(e) (SMSIA), taken from saved renderer HTML, not typed from memory. eCFR has no print page, so the quote does not invent `provenance.document.page`. 12 CFR 328 is watched with the other parts and has no new constant. `verified` / `by: human` waits for an explicit confirmation.

### Federal income brackets draft (2026-11-10)

Rev. Proc. 2025-32, Internal Revenue Bulletin 2025-45, page 695 (`https://www.irs.gov/irb/2025-45_IRB`), section 4.01 tables 1–4 for taxable years beginning in 2026. Thresholds are the "not over" dollar figures, converted with `centsFromInteger` by appending two zeros to the digit string. Rates use `rateFromPercent`. Each bracket keeps the table-row quote. Table 5 (estates and trusts) is not a filing status. The draft is `unverified`, `isMock: false`, and is not imported by fixtures or `TAX_YEAR`. State rates are not in this slice.

### Daily Treasury Par Yield Curve (2026-11-12)

Read from the [interest-rate data center](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve) and the CSV it links for the current year:

`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/<year>/all?type=daily_treasury_yield_curve&field_tdr_date_value=<year>&page&_format=csv`

The empty `page` parameter is part of that URL. The header read on 2026-11-12 is `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"`. These are Constant Maturity Treasury rates from the daily par curve. Bill bank-discount columns, coupon-equivalent columns, and the extrapolation factor are a different file and are not stored. The 23:30 UTC job is `ready`. A weekend or holiday returns the same file, the hash matches, and the run is `held` with `unchanged`. That is a success.

| CSV column | CMT maturity | Stored `tenor` |
| --- | --- | --- |
| `1 Mo` | 1 month | `1M` |
| `1.5 Month` | 1.5 months (series from 2025-02-18) | `1.5M` |
| `2 Mo` | 2 months | `2M` |
| `3 Mo` | 3 months | `3M` |
| `4 Mo` | 4 months (series from 2022-10-19) | `4M` |
| `6 Mo` | 6 months | `6M` |
| `1 Yr` | 1 year | `1Y` |
| `2 Yr` | 2 years | `2Y` |
| `3 Yr` | 3 years | `3Y` |
| `5 Yr` | 5 years | `5Y` |
| `7 Yr` | 7 years | `7Y` |
| `10 Yr` | 10 years | `10Y` |
| `20 Yr` | 20 years | `20Y` |
| `30 Yr` | 30 years | `30Y` |

`Date` is `MM/DD/YYYY` and becomes `curve_date`. Each percent string becomes a `Rate` with `rateFromPercent` (`4.05` → `0.0405`). `N/A` or a blank cell is a missing tenor and holds the batch. A date after the fetch day, or a rate outside 0–20%, holds the batch. A move of more than 50bp is reviewed only for the newest date: against the stored rate for that same date, otherwise against the prior date in the file, otherwise against the newest stored curve. Older days in the year file are not flagged. The comparison set is that newest stored date, not the whole year, so the first file of a new year is not a shrink.

This is a market benchmark, not a `Product`. It is stored in `par_yields` on domain `par_yields`. Every publish inserts a new `dataset_versions` row with `is_mock` false and calls `publish_domain('par_yields', …)`. The version date is the newest `curve_date` in that file. Tax and insurance stay on `reference`. Revalidate tag is `par_yields`. Treasury bills and notes that are products stay on domain `treasury`.

### NCUA 5300 (2026-11-13)

Read from the [quarterly data page](https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data) and `AcctDesc.txt` inside `call-report-data-2026-06.zip`. The page says the file is a ZIP for WinZip. The saved file starts with `PK`, so it is PKZIP. `node:zlib` does not open that. `fflate` 0.8.3 is pinned in ADR-014. The Monday 11:00 job is `ready`. One run writes `institutions` and `bank_metrics` for the `ncua:` prefix and keeps `fdic:` rows. The version date is the run day. The quarter stays on the metrics row.

| NCUA field | NCUA definition, from the file | Our field |
| --- | --- | --- |
| `FOICU.CU_NUMBER` | Charter number | `id` = `ncua:` plus the digits |
| `FOICU.CU_NAME` | Credit union name | `name` |
| `FOICU.STATE` | Two-letter state | `hqState`. Any other value is skipped. |
| `FOICU.CYCLE_DATE` | Cycle, `M/D/YYYY` | Quarter date. Two dates in one file are `mixed_quarter`. |
| website | No column in `FOICU` or `FOICUDES` | `website` is null. It is not inferred. |
| membership | No column | Open membership is not marked. |
| `FS220.ACCT_010` | `TOTAL ASSETS`. Sibling amount accounts say "dollar amount". The June 2026 file stores charter 1 as `13220539`, whole dollars. | `totalAssetsUsdThousands`. Integer half-up division by 1000. No float. |
| `FS220.ACCT_018` | `Total Amount of Shares and Deposits`. "Should include the sum of all deposits both member and non-member." Same dollar unit. | `deposits_usd_thousands`, same conversion. |
| `FS220R.ACCT_RB0172` | `RBC Total Risk Based Capital Ratio` | Not stored. The description does not state the scale. The June 2026 file uses integers such as `1343`. |
| `FS220A.Acct_998` | `Net Worth Ratio`. "Net Worth divided by Total Assets." | Not a `MetricKey`. `tier1LeverageRatio` stays absent. |
| `returnOnAssets`, `loansToDeposits`, `allowanceToLoans`, `noncurrentLoansRatio`, `liquidAssetsToAssets` | No account title matches these ratios | The key is omitted. The page shows n/a. |

`regulator` is `NCUA`. `kind` is `credit_union`. Provenance is `verified`, `by: official_api`, `isMock: false`. The nightly check reads the first 80KB of the newest ZIP, which holds `AcctDesc.txt`, and checks the header plus account `Acct_010`. It does not download the quarter.

### FDIC national rates via FRED (2026-11-13)

Read from FRED release 317, table "National Deposit Rates" (`eid=1217866`, [the table](https://fred.stlouisfed.org/release/tables?rid=317&eid=1217866)). The table header says Percent. Series ids were taken from the links on that page on 2026-11-13. Each id was checked again on 2026-11-14 at `https://fred.stlouisfed.org/series/<id>`: the page title is the label stored on the row. Rate caps are a different table and are not stored. This is a deposit-market average, not a product and not a bank metric. It is not an input to Compare. The Monday job is `ready`. The key is `FRED_API_KEY`. The value is not written into the repository. A monthly series with the same hash stays `held` / `unchanged`.

| Series | FRED title, 2026-11-14 |
| --- | --- |
| `SNDR` | National Rate: Savings |
| `ICNDR` | National Rate: Interest Checking |
| `MMNDR` | National Rate: Money Market <100M |
| `NDR1MCD` | National Rate: 1 Month CD <100M |
| `NDR3MCD` | National Rate: 3 Month CD <100M |
| `NDR6MCD` | National Rate: 6 Month CD <100M |
| `NDR12MCD` | National Rate: 12 Month CD <100M |
| `NDR24MCD` | National Rate: 24 Month CD <100M |
| `NDR36MCD` | National Rate: 36 Month CD <100M |
| `NDR48MCD` | National Rate: 48 Month CD <100M |
| `NDR60MCD` | National Rate: 60 Month CD <100M |

The observations request asks for `limit=3`, newest first. The stored date is the latest date shared by every series that returned points. A series that is one month behind still publishes on that shared month. Each observation is one row in `national_deposit_rates` on domain `national_rates`. Every publish inserts a new `dataset_versions` row with `is_mock` false and calls `publish_domain('national_rates', …)`. The version date is that shared observation date. Tax, insurance, and the curve stay on their own domains. A percent becomes a `Rate` with `rateFromPercent`. A bad series does not wipe the reason down to `empty`. The review reason is the per-series list: `fred_series_missing:<id>`, `value_missing:<id>`, `date_mismatch:<id>`, or `out_of_range:<id>`. The batch stays unpublished and the previous table stays. A date after the run day still blocks the batch as `future`. The nightly check requests `SNDR` only and does not print the value. `/methodology` states the source and the monthly cadence as a DRAFT.

### Fiscal Data auctions and TreasuryDirect (2026-11-13)

Par yields are unchanged. Bills and notes would be `Product` rows of category `treasury` on domain `treasury`. The `products` domain stays the CD and savings fixtures, and the DEMO banner stays.

`Institution.regulator` is `FDIC | NCUA | UST`. `Regulator` for insurance stays `FDIC | NCUA`, so a Treasury issuer does not require an invented insurance limit. The issuer id is `ust`. No `fdic:` id is minted for the Treasury. The auctions response has no institution name, headquarters state, or website, so the `ust` row is not published.

Both jobs are on the 07:00 workflow and are `ready`. Each fetches one page. The nightly check is one request each.

Fiscal Data `auctions_query` (`sort=-auction_date`, `page[size]=1`), labels from the API metadata read 2026-11-13:

| Response field | Label |
| --- | --- |
| `cusip` | CUSIP |
| `security_type` | Security Type (`Bill`, `Note`, `Bond`) |
| `security_term` | Security Term |
| `issue_date`, `maturity_date` | Issue Date, Maturity Date |
| `high_yield` | High Yield |
| `int_rate` | Interest Rate |
| `int_payment_frequency` | Frequency Of Interest Payments |
| `min_to_issue` | Minimum To Issue |

TreasuryDirect `GET /TA_WS/securities/auctioned?format=json&pagesize=1`, names from the JSON object read 2026-11-13: `cusip`, `securityType`, `securityTerm`, `issueDate`, `maturityDate`, `highRate`, `investmentRate`, `interestRate`, `frequencyOfInterestPayments`, `minimumToIssueAmount`.

Neither response has a balance-tier schedule, an early-withdrawal penalty, an eligibility rule, or a tax treatment. Those `Product` fields are not filled in. The quotes that describe the gap, read 2026-11-14, stay `unverified` in `packages/ingest/src/treasury/product-gaps.ts` and are not a published product:

| Held field | Product field | Quote |
| --- | --- | --- |
| `tier` | `tiers` | 31 CFR 356.12(a): a bid states a par amount at or above the minimum in the auction announcement, in the stated multiple. TreasuryDirect (Buying a Treasury Marketable Security): minimum bid $100, increments of $100, non-competitive maximum $10 million. That is one minimum, not a balance-tier schedule. |
| `early_withdrawal` | `earlyWithdrawal` | TreasuryDirect, Selling a Treasury Marketable Security: hold to maturity or sell before maturity through a bank, broker, or dealer. A security bought in TreasuryDirect must be held 45 days before it can be sold or transferred. That is not a days-of-interest, months-of-interest, or percent-of-principal penalty. |
| `eligibility` | `eligibility` | 31 CFR 363.10: a TreasuryDirect account is an online account maintained solely in the account holder's name for eligible book-entry Treasury securities. The page does not state a rule the profile can evaluate. |
| `tax_treatment` | `taxTreatment` | 31 CFR 356.32(a): securities issued under that part are subject to the Internal Revenue Code of 1986. Under 31 U.S.C. 3124 they are exempt from taxation by a State or political subdivision of a State, except for estate or inheritance taxes and the other exceptions in that section. TreasuryDirect, Treasury Bills: federal tax is due on interest earned, and there is no state or local tax. The enum value is not chosen until a person confirms the quote. |

No treasury product is published until that confirmation. `publishTreasuryProducts` throws. A new auction updates the snapshot and the one open review for that source (same row, comment on the same issue). The run stays `held` with `reason=missing_fields:tier,early_withdrawal,eligibility,tax_treatment`. An unchanged hash stays `held` with `reason=unchanged` and does not open another issue. A missing official column fails the run.

### Insurance limit and 2026 tax brackets (2026-11-13)

The quotes in `packages/ingest/src/insurance/limit.ts` stay `unverified`. They are not copied into fixtures or written as `verified` / `by: human`. `commitInsuranceLimits` can update `insurance_limits` on the current reference version, without calling `publish_domain` and without changing `par_yields`, and it refuses a row that is not `verified` by a human. That call is not scheduled.

`publishFederalBrackets` throws. Rev. Proc. 2025-32 stays a one-checker draft. `TAX_YEAR` is unchanged. State brackets are not started.

## Alternatives considered
- Ingest inside `apps/web` route handlers: rejected. A scrape does not belong in the request path, and the web bundle must not take on connector code. Actions have no serverless time limit and already run Playwright.
- Publish every parsed row and fix mistakes later: rejected. A wrong rate is the consumer-risk in the plan. Hold is the default.
- An admin UI in step 4: rejected. The queue is a CLI and an issue in the private repository until it outgrows that.
- Filing review issues on this public repository: rejected. The diff and the snapshot link would be public.
- Rotating proxies so a bank's bot check does not fire: rejected. A block is a stop, not a prompt to change address.
- Treat Crawl-delay as our rate limit: rejected. The 5–10 second gap is ours. `robots.txt` only grants or denies the path.

## Consequences
- Step 1 lands the dependency rules and the package skeleton. Connectors start at step 6, after the pipeline (step 4) and the schedule (step 5).
- A nightly live request checks that a source's shape still matches the recorded snapshot. The snapshot test does not hit the network.
- A lawyer is engaged at step 9, before the public launch. Steps 1–8 do not wait. `DEMO_PASSWORD` stays until that launch.
- The scrape mailbox is the env var `FA_SCRAPE_MAILBOX`. The owner still chooses the address; a bank run refuses to start without one. The person who applies a bank opt-out within 24 hours is `ViperClaw1`, the same login as the review queue. The queue owner is `ViperClaw1`, and the review repository is `ViperClaw1/fin-aggr-review`. `REVIEW_REPO_TOKEN` is an Actions secret. This ADR does not create accounts. Field codes of each source are appended in step 6 from that source's dictionary.
