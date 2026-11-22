# ADR-020: Ingest is a separate package with a publish-or-hold pipeline

- Status: accepted
- Date: 2026-11-04 (accepted 2026-11-04)
- Relates to: ADR-004, ADR-006, ADR-007 (provenance), ADR-013, ADR-014, ADR-019, ADR-022 (pricing scope)

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

Review has no admin UI. `pnpm ingest:review`, `pnpm ingest:approve <id>`, `pnpm ingest:reject <id> --reason`, and `pnpm ingest:reopen <id> --reason` are the interface. A bot opens one issue per batch, with the snapshot and the diff, in a separate private repository. This repository stays public, and review tasks are not filed here.

Review owner is the GitHub login `ViperClaw1` (the issue assignee). There is no deputy: an overdue item stays held and the site keeps the previous version. Three days is a signal, not an SLA. A daily workflow comments on the private issue and mentions the assignee when `status = 'open'` and `created_at` is older than three days. The two-person check is the tax rule only.

`decided_by` is that GitHub login, never an email. The CLI reads `gh api user --jq .login` or `FA_REVIEWER` in `.env.local` and refuses to run without one. A rejected row requires a non-empty `decision_reason` (NULL does not pass the check). Approve writes the decision and publishes in one transaction, then calls revalidate. Supabase Studio can show the queue; it cannot approve. A missing `REVIEW_REPO_TOKEN` does not undo that write: the CLI prints `REVIEW_REPO_TOKEN is missing; the issue was not closed` and exits 0. `pnpm ingest:reopen <id> --reason` puts an approved or rejected row back to `open`. The previous decision and the reopen are inserted into `review_audit` in that same transaction, then `decided_by` and `decided_at` are cleared so the open-row check still holds. The published version is not rolled back. A missing token prints `REVIEW_REPO_TOKEN is missing; the issue was not reopened` and exits 0.

The private repository is `ViperClaw1/fin-aggr-review` (issues only). The bot uses a fine-grained PAT in the Actions secret `REVIEW_REPO_TOKEN` (Issues read and write, that repository only, 90 days). A GitHub App replaces it later. `GITHUB_TOKEN` from this repository cannot write there.

Review data never appears in public Actions logs or artifacts. The bot's stdout is `issue #N created`. Nothing is uploaded as an artifact. Snapshot links in the private issue are signed URLs from the private `raw` bucket, valid for 7 days. `pnpm ingest:review <id>` mints a new one. The workflow is checked for `upload-artifact` and for log lines that are not the fixed counters.

`review_queue` stores `decided_by`, `decided_at`, `decision_reason`, and `issue_url` (the step 4 migration).

An admin UI is revisited only when the queue exceeds 20 items in a week, or more than 2 items in a month waited past 3 days, or a reviewer has no terminal. That UI is a separate `apps/admin`, not `apps/web`.

Raw snapshots in `raw`: a snapshot that a version still in the 30-day window points at is kept while that version is kept. Other snapshots are kept 90 days. This is still the working rule at step 8.1. It is both a storage cost and a question of keeping someone else's text; the lawyer sees it at step 9, before a scraped page is published.

GitHub-hosted runner addresses are often blocked as bots. Accepted at step 8.1: a block switches that institution to manual mode. Proxy rotation stays rejected. A worker with a static IP is not added.

Schedule is GitHub Actions (`schedule`), one workflow per cadence, `concurrency` per source (`cancel-in-progress: false`), `timeout-minutes`, one retry on a network error. The cadence table is in `docs/plan-stage-2.md` (step 5).

GitHub drops and delays a cron that starts at minute 0. Since `f9c48b8` no scheduled `bank-rates` run has started; the runs that did start were `workflow_dispatch`. On 2026-11-17, by 08:48 UTC, DB contract, Review age, daily rules, live shape, and daily 07:00 had not started. Every cron in this repository uses minute 17, 37, or 47. `bank-rates` is `17 4-12 * * *` and `47 4-12 * * *` (UTC), timeout 120 minutes, banks one at a time. The once-per-night guard is unchanged, so a later slot does not request a bank again. The attempts share the `ingest-bank-rates` lock, so they do not run together. Slot hours (2026-11-19) are derived, not chosen: `overnightUtcHours(zones)` is the union of the UTC hours that touch 22:00–06:00 local in each active bank's zone, in January and in July. The pilot banks are `America/Denver`: 05:00–13:00 UTC standard, 04:00–12:00 UTC daylight, so hours 04–12. The old 03–10 slots fired two hours before the window opened and missed 11:00–13:00. A test fails when the GitHub and `pg_cron` hours drift from that derivation; a new bank in another zone changes the expected hours.

`amex-cd-page` runs at the end of that same job, on the same scrape session, and only inside the Denver overnight window. A `job_runs` row with `request_count > 0` since Monday 00:00 UTC skips the fetch (`already_fetched`, `request_count` 0). Monday 11:00 UTC is not the trigger: it is the edge of that window, and a delayed start falls outside it.

Review age also reports a dropped schedule. A ready daily source with no `job_runs` row in 36 hours is `silent <id>`. `bank-rates` is silent when no `bank:` row has `request_count > 0` in those 36 hours; a skip row does not count. A weekly source uses 7 days plus 12 hours, so Monday morning does not fire before that week's run and Tuesday's review-age sees a missed week. `amex-cd-page` counts only `request_count > 0`, because the weekly guard writes a skip row on the other nights. The command prints `silent <n>` and exits 1 when the count is not 0. It also exits 1 on a failed `pg_cron` dispatch (see Scheduler). The overdue comments are written first. This check sees ingest sources. It does not see DB contract, CI, live shape, or Review age itself.

Scheduler (2026-11-18). The GitHub schedule is unreliable even off minute 0: runs start 4–16 hours late or not at all. On 2026-11-18 none of the 16 `bank-rates` night slots started; the only run in 24 hours started at 19:26 UTC and held with `outside_window`. Supabase `pg_cron` is the primary trigger. Migration `20261118120000_dispatch_scheduler` enables `pg_cron` and `pg_net` and adds `public.dispatch_workflow(file)`. It reads the token from `vault.decrypted_secrets` (`name = 'github_dispatch_token'`) and calls `net.http_post` on `POST /repos/ViperClaw1/fin-aggr/actions/workflows/<file>/dispatches` with `{"ref":"main"}` and the headers `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: fa-dispatch`. The function is `security definer`, executable only by `postgres`, and not exposed through the Data API. The jobs, in UTC: `bank-rates` `5,35 4-12 * * *` through `public.dispatch_bank_rates(file)` (migration `20261119120000_bank_rates_slots`), which dispatches only while the Denver window is open and no `bank:` `job_runs` row with `request_count > 0` started in it, so a collected night costs no more runs; DB contract `37 3 * * *`; Review age `17 4 * * *`; live shape `37 6 * * *`; and 12 minutes after their GitHub cron: daily rules `59 5 * * *`, daily 07:00 `29 7 * * *`, weekly `49 11 * * 1`, daily 23:30 `29 23 * * *`. The offset keeps the two triggers from racing; the per-source concurrency group queues the second, which then holds with `unchanged`. Reason: on 2026-11-17 GitHub never started daily 07:00 and daily rules, and on 2026-11-18 they ran about 9 hours late (Review age `silent 7`). The GitHub `schedule` lines stay as a fallback. A duplicate run is harmless: a bank is requested once per night, and an unchanged hash holds with `unchanged`.

Each dispatch is a row in `dispatch_log` (request id, workflow, time). `net._http_response` keeps answers only a few hours, so `harvest-dispatches` (every 15 minutes) copies the status there. GitHub answers 204. A non-2xx status, a timeout, a `pg_net` error, or no answer after one hour sets `failed`. Review age prints `dispatch_failed <n>` and one `dispatch_failed <file>` per workflow with a failure in the last 36 hours, and exits 1 when the count is not 0. The line has no URL and no token.

Watchdog (migration `20261118140000_scheduler_watchdog`). At minute 50 of each hour inside the `America/Denver` window (22:00–06:00 local, from 23:50 on), `bank_rates_watchdog()` looks for a `bank:` `job_runs` row with `ended_at` since the window opened. A skip row counts: it proves a run started. None: it dispatches `ingest-bank-rates.yml` once for that window. Still none an hour later, or a failed `ingest-bank-rates.yml` dispatch in the window: it opens one issue `scheduler: missed window` in `ViperClaw1/fin-aggr-review`, assigned to `ViperClaw1`, and on later windows comments on that same issue with a mention. A window alerts once. pg_net has no PATCH, so a closed issue is not reopened; the comment still notifies. The issue token is Vault `review_repo_token` (Issues read and write on that repository). The runbook is `docs/runbooks/scheduler.md`.

Refusals (2026-11-21). On 2026-11-21 ecfr.gov answered `ecfr-745` with 403 and api.fdic.gov answered the live shape with 429, and both jobs went red. `fetchOfficial` now retries a 403 from ecfr.gov, federalregister.gov, or api.fdic.gov once after 30 seconds. A 403 that persists, or a 429 after its retries, at stage `fetch` is `unavailable`: the line is `source <id> unavailable ... reason=upstream_unavailable:http_403` plus a `::warning::`, the `job_runs` row stays `failed`, and the job is green. The deduped `Ingest <id> failed` issue opens on the second consecutive refused run. A 5xx still opens on the third run. A shape, parse, or database error is red and opens on the first. Live shape treats `shape http 403` and `shape http 429` as warnings. The eCFR parts in `ingest-daily-rules.yml` run in a chain (`needs`, `if: !cancelled()`), so ecfr.gov sees one request at a time. A bank with confirmed products but no `bank_confirmations` row holds with `reason=bank_not_confirmed`: one queue reason, not a `first_connection` per product. The one-open-row-per-source rule keeps it to a single review.

A failed `bank-rates` follow-up logs `source bank-rates followup failed stage=<stage> code=<code>`; only those two tokens are copied from the error. A manual stop on `amex-cd-page` (captcha, 401, 403, 429, header overflow) is not a failure: the watch logs `source amex-cd-page held reason=<code>` and writes a held `job_runs` row with `request_count` 1.

The token is the fine-grained PAT `fa-dispatch`: Actions read and write, repository `ViperClaw1/fin-aggr` only, 90 days. It lives only in Supabase Vault as `github_dispatch_token`, never in the repository or a migration. Rotation: set a calendar reminder 7 days before expiry, create the new PAT, then `select vault.update_secret(id, '<new>')` on that row. An expired token shows up as `dispatch_failed` (401) and as `silent` sources the next morning.

A bank is requested at most once per overnight window. The guard is a `job_runs` row for that source with `request_count > 0` and `started_at` at or after 22:00 in the bank's zone. A later attempt logs `source <id> held reason=already_fetched` and inserts a row with `request_count` 0. Outside the window the log is `source <id> held reason=outside_window window=05:00–13:00Z` (that bank's open or next window in UTC, read from its zone, so a DST night shows 7 or 9 hours), also with a row, and the bank is not requested. A skip row does not count as a request. Neither path exits without that line.

There is no `workflow_dispatch` input that skips the window. The window is this rule. A manual run requests a bank only while that bank's local hour is 22, 23, or 0–5. In standard time the window is UTC 03:00 until 11:00 Eastern, 04:00 until 12:00 Central, 05:00 until 13:00 Mountain (Arizona the same, all year), 06:00 until 14:00 Pacific, 07:00 until 15:00 Alaska, and 08:00 until 16:00 Hawaii. The end instant is 06:00 local and is outside the window. Daylight time moves each range one hour earlier, except Hawaii and Arizona. The pilot banks are `America/Denver`: 05:00 until 13:00 UTC in standard time, 04:00 until 12:00 UTC in daylight time.

The scrape stays on those runners: a block is manual mode, not a move to a static-IP worker. A move off Actions for lack of minutes stays a later decision. Tax tables are a manual yearly job. A new tax year is loaded as `unverified` and is not published until two people have checked it. `TAX_YEAR` changes in one commit after that.

Scraping rules, enforced by `createScrapeSession` (step 8.1), not only by this text:

- Public pages only. `https`, no userinfo, no non-default port, no login or account path. No cookies and no acceptance of terms.
- `robots.txt` of the page origin is read once per host before a path on that host (`robots-parser`). A disallowed path, or a robots response that is itself a block, puts that institution into manual mode. HTTP 400 is not a block: the body is parsed as robots text, so a disallow in it still stops the path, and a body that states no rule allows it. The rate-limit key is the registrable domain, not the host: `www.bank.com` and `bank.com` share one gap. Crawl-delay is not that gap.
- An adapter may add public request headers such as `Origin` and `Referer`. The session still sets `Accept` and the User-Agent. A `Cookie` or `Authorization` header is refused before the request, as `manual` / `blocked`.
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

`abstract`, `excerpts`, and the document body are not stored. An empty `results` array is a normal day. Fetch stores the response text. Parse reads it. A row with a bad number, date, title, or URL is skipped. More than half the rows on one agency page, or a body that is not a `results` envelope, fails that page with `fr_invalid_number`, `fr_invalid_date`, `fr_invalid_title`, `fr_invalid_url`, or `fr_envelope`. HTML or other non-JSON is `json_invalid`. The failure issue names the code and the agency slug. An unclassified error is `unknown`. The 05:00 job is a `watch` source. The hash is the response bodies, without `retrievedAt`. The comparison set is the parsed document numbers. The first snapshot is a baseline and opens no issue. A later run queues one review only when a document number was not in the previous snapshot. An empty day, or a page that only drops old numbers, logs `source federal-register unchanged` and does not replace the stored set. The issue lists each new document's number, date, title, and link. A document is prefixed `likely relevant` and listed first when its title or `cfr_references` cites 12 CFR 328, 330, 745, or 1030, or when the title names Form 1099-INT or information reporting of interest. `cfr_references` is read for that flag and is not part of the stored hash. The public log does not. The run does not publish. The nightly shape check parses twenty IRS documents.

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

The observations request asks for `limit=3`, newest first. The stored date is the latest date shared by every series that returned points. A series that is one month behind still publishes on that shared month. Each observation is one row in `national_deposit_rates` on domain `national_rates`. Every publish inserts a new `dataset_versions` row with `is_mock` false and calls `publish_domain('national_rates', …)`. The version date is that shared observation date. Tax, insurance, and the curve stay on their own domains. A percent becomes a `Rate` only after half-up rounding to 6 decimal places of the percent (`decimal.js`). FRED stores more places than that: `NDR60MCD` on 2026-10-01 is `1.41484783817982041`, and the chart shows 1.41485. `Rate` allows 8 decimal places of the fraction, which is 6 places of the percent after the point moves two places left. Rounding first is what makes `1.41484783817982041` the rate `0.01414848` and `1.364812009554608805` the rate `0.01364812`. The raw observation string is stored as `quote` and is not replaced by the rounded text. A blank or `.` is `value_missing:<id>`. A value that is not a percent is `parse_error:<id>:<code>:<raw>`, with the parser code (`invalid_format` or `too_many_decimals`). A parsed rate outside 0–0.2, including a percent `rateFromPercent` rejects as `out_of_range`, is `out_of_range:<id>:<raw>`. The raw text is part of the review reason. A bad series does not wipe the reason down to `empty`. The review reason is the per-series list: `fred_series_missing:<id>`, `value_missing:<id>`, `date_mismatch:<id>`, `parse_error:<id>:<code>:<raw>`, or `out_of_range:<id>:<raw>`. The batch stays unpublished and the previous table stays. A date after the run day still blocks the batch as `future`. The nightly check requests `SNDR` only and does not print the value. `/methodology` states the source and the monthly cadence as a DRAFT.

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

Neither response has a balance-tier schedule, a bidder minimum, an early-withdrawal penalty, an eligibility rule, or a tax treatment. Those `Product` fields are not filled in. The quotes stay `unverified` in `packages/ingest/src/treasury/product-gaps.ts` and are not a published product. Tax treatment is the 2026-11-14 quote. Early withdrawal was read again on 2026-11-22: it now includes "you can't sell or transfer a 4-week bill from TreasuryDirect because it matures in less than 45 days", and the opening "you can hold" sentence was dropped to stay within 400 characters. On 2026-11-22 all seven confirmable quotes (two insurance, five Treasury) matched the live eCFR and TreasuryDirect text.

Treasury products (owner decisions, 2026-11-22):

- Source. TreasuryDirect `securities/auctioned` is primary: on 2026-11-22 Fiscal Data's newest 26-week row was the 2026-10-19 auction with no results, while TreasuryDirect had 2026-11-19. Fiscal Data is a cross-check by CUSIP. The earlier statement that neither response has a bidder minimum was wrong: Fiscal Data `min_bid_amt` ("Minimum To Bid Amount") and TreasuryDirect `minimumToBidAmount` carry it, and that is the amount 31 CFR 356.12(a) refers to. `min_to_issue` is a different field.
- Scope. The latest auction with a result for bills of 13, 26 and 52 weeks (`termMonths` 3, 6, 12) and notes of 2, 3, 5, 7 and 10 years. TIPS, FRNs, cash management bills, bonds and other terms are not published. 4-, 6-, 8- and 17-week bills do not fit whole months, and a 4-week bill cannot be sold from TreasuryDirect. A reopened bill is kept: every 13-week bill is a reopening, and its price and dates are that auction's own.
- APY. 12 CFR 1030 Appendix A: APY = (1 + Interest/Principal)^(365/Days in term) − 1. A bill uses its auction price P per 100: Interest = 100 − P, Principal = P, days from issue to maturity. A note's high yield is semiannual (31 CFR 356 Appendix B), so APY = (1 + y/2)^2 − 1, which assumes coupons are reinvested, as the engine already assumes for CDs. Half-up to 8 decimals once (`packages/ingest/src/treasury/apy.ts`).
- Money. `minOpening` is the minimum to bid; `maxDeposit` is "Maximum Noncompetitive Award". Both are whole dollars.
- Early sale. `EarlyWithdrawal` gains the additive kind `market_sale { holdDays }`: a marketable security is sold through a bank, broker or dealer at the market price, after 45 days in TreasuryDirect. The engine charges no penalty and counts only interest earned while held; it adds the assumption `market_sale_price_excluded` and warns that the sale price depends on the market, plus a hold warning when the months held are under `holdDays`.
- Eligibility. 31 CFR 363.11 asks for age 18 or over, an SSN, a U.S. address of record and a U.S. bank account. The profile has age but no SSN or address, so the rule is `age ≥ 18` and `residency ∈ {us_citizen, us_resident}`, labelled "SSN, U.S. address of record and U.S. bank account" (owner, 2026-11-22).
- Issuer. `ust` is published as a row on the same `treasury` version: "U.S. Department of the Treasury", regulator `UST`, `hq_state` DC, website treasurydirect.gov, confirmed by the owner on 2026-11-22. `InstitutionKind` gains the additive value `government` (migration `20261122152536_institution_kind_government`), so the safety badge does not call the Treasury a bank. Its badge text is DRAFT until the owner approves it. `getInstitution` looks in the institutions registry, then the current `products` version, then the current `treasury` version.
- Publish. The `treasurydirect` job is a normal source: one request for 250 auctions, `latestOffers`, then a gate that blocks unless all eight terms are present and every APY is inside the product bounds. The commit reads `fact_confirmations` in the same transaction; a missing confirmation throws, so nothing is published and the previous version stays. There is no move check against the previous version yet. `treasury-fiscal-data` stays a snapshot-and-hold job; the CUSIP cross-check is not built yet. The owner has accepted the tax citation, 31 CFR 356.32(a), and will confirm early withdrawal. Both source flags stay `unverified` until `pnpm ingest:confirm` writes the row. Eligibility and the award price were read again on 2026-11-16 from the eCFR versioner XML (`full/2026-10-15/title-31.xml`). 31 CFR 363.11 was the same paragraph at issue date 2024-06-04.

`tiers` is 31 CFR 356.20(d)(1), amendment date 2026-10-15. The stored quote is that paragraph:

> Single-price auctions. Both noncompetitive and competitive bidders receive the price equivalent to the high yield, high discount rate, or high discount margin at which bids were awarded. For inflation-protected securities, the price for awarded securities is the price equivalent to the high real yield.

31 CFR 356.2, in the same file, defines the term:

> Single-price auction means an auction in which all successful bidders pay the same price regardless of the yields, discount rates, or discount margins they each bid.

Paragraph 356.20(d)(2) still describes multiple-price awards. The stored quote is (d)(1) only. It is one award price, not a balance-tier schedule.

`minOpening` is 31 CFR 356.12(a), fact id `treasury:min_opening`. The stored quote is:

> All bids must state the par amount of securities bid for and must equal or exceed the minimum to bid amount stated in the auction announcement. Bids in larger amounts must be in the multiple stated in the auction announcement.

The section states no dollar amount. The dollar figure is the minimum to bid in the auction announcement. The sentence in 356.21, "Treasury bills may be issued with a minimum to bid of $100", is a proration example and is not stored.

`eligibility` is 31 CFR 363.11. The stored quote is the section paragraph:

> Only an individual or an entity is eligible to open a TreasuryDirect account. In order to open a TreasuryDirect account, an individual or entity account manager must have a valid social security number (SSN), be 18 years of age or over, and be legally competent. An entity must have a valid SSN or employer identification number. The account owner must have a United States address of record and have an account at a United States depository financial institution that will accept debits and credits using the Automated Clearing House method of payment.

That paragraph is 553 characters. It is stored whole. A 400-character clip would drop the United States address or the depository-account sentence. It is not copied into `Provenance.quote`. The scrape rule that clips a quote to 400 characters is unchanged.

`earlyWithdrawal` is unchanged: TreasuryDirect, Selling a Treasury Marketable Security. Hold to maturity, or sell before maturity through a bank, broker, or dealer. A security bought in TreasuryDirect must be held 45 days before it can be sold or transferred. That is not a days-of-interest, months-of-interest, or percent-of-principal penalty.

`taxTreatment` is unchanged: 31 CFR 356.32(a). Securities issued under that part are subject to the Internal Revenue Code of 1986. Under 31 U.S.C. 3124 they are exempt from taxation by a State or political subdivision of a State, except for estate or inheritance taxes and the other exceptions in that section. The enum value is not chosen until a person confirms the quote.

No treasury product is published until that confirmation. The confirmation is `pnpm ingest:confirm <fact-id>` with fact id `treasury:tier`, `treasury:min_opening`, `treasury:early_withdrawal`, `treasury:eligibility`, or `treasury:tax_treatment`. Before the insert, the command prints the fact id, the citation, the URL, and the quote. A login that is not a GitHub login prints nothing and writes nothing. The row in `fact_confirmations` stores `verified`, `by: human`, the GitHub login (`FA_REVIEWER` or `gh`), and the UTC date. The quote in source stays `unverified`, and the command does not publish a product. `publishTreasuryProducts` throws. A new auction updates the snapshot and the one open review for that source (same row, comment on the same issue). The run stays `held` with `reason=missing_fields:tier,min_opening,early_withdrawal,eligibility,tax_treatment`. An unchanged hash stays `held` with `reason=unchanged` and does not open another issue. A missing official column fails the run.

### Insurance limit and 2026 tax brackets (2026-11-13)

The quotes in `packages/ingest/src/insurance/limit.ts` stay `unverified`. They are not copied into fixtures. A person confirms one quote with `pnpm ingest:confirm <fact-id>` (`insurance:fdic` or `insurance:ncua`). Before the insert, the command prints the citation, the URL, and the quote. The insert writes `fact_confirmations`: `verified`, `by: human`, the GitHub login, and the UTC date. It does not call `commitInsuranceLimits`. `commitInsuranceLimits` can update `insurance_limits` on the current reference version, without calling `publish_domain` and without changing `par_yields`, and it refuses a row that is not `verified` by a human. That call is not scheduled.

`publishFederalBrackets` throws. Rev. Proc. 2025-32 stays a one-checker draft. `TAX_YEAR` is unchanged. State brackets are not started.

### Bank HTML rate tables (2026-11-15)

Recorded before ACCESSbank (Omaha, NE, rates page `/for-you/accounts/interest-rates`) is connected. That bank is not in the registry and has no adapter. The rules live in `classifyTableRow`.

A single month cell (`12 Month`, `12-Month`) is `termMonths`. A span (`6–8 Month`, `6-8 Months`, `6 to 8 months`) is not one term. `termMonths` stays null. The reading keeps `low`, `high`, and the cell text, and the row is `term_range:<low>-<high>`. The same rate on every month of the span is not a reason to emit one product per month: the cell did not list those terms separately. A span whose ends are equal (`6–6 Month`) is that one month.

`new money` and `requirements met` are conditions. The row goes to review with the condition text (`condition:` plus the clipped quote). It is not a clean product. The text is kept.

An empty or blank "as of" is not a date. `statedAsOf` is null and the flag is `bank date not stated`. `retrievedAt` stays the fetch time on the snapshot. It is not copied into `asOf` or `validFrom`. No calendar date is filled in from the clock.

If the bank does not open accounts online in every state, every row is `state_eligibility` until a person enters the state rule from the bank's own page. The headquarters state is not that list. A bank that does open accounts online nationwide does not get this hold. Other eligibility is still confirmed by a person the first time, as above.

### American Express National Bank (2026-11-15)

Institution `fdic:27471`, source `bank:fdic:27471`, zone `America/Denver` (headquarters Utah). The adapter kind is JSON. The rates page script calls `https://functions.americanexpress.com/ReadBankingInterestRates.v1` with no authorization. On 2026-11-15 a GET without `Origin` returned 403 `Forbidden`. A GET with `Origin: https://www.americanexpress.com` and `Referer` of the public CD page returned 200 and `interestRateList`. The adapter sends those two headers and no cookie.

`robots.txt` of `functions.americanexpress.com` was read the same day, separately from `www.americanexpress.com`. The host returned HTTP 400 and `Function robots.txt has invalid address for pattern`. That body is not a robots policy. The session parses it and allows the path. One `get` per run goes through `createScrapeSession`: the project User-Agent, the 10 second gap, and the overnight window in `America/Denver`. The client is undici with `maxHeaderSize` 65536 (since 2026-11-18 the shared scrape transport). Node's default of 16 KB is too small for a header block this host can send. The response read that day was under 16 KB.

`undici` 8.12.3 is the client package. 8.12.4 was published 2026-11-05, inside two weeks of this decision, so it is not pinned (ADR-014). Node 24 does not export an `Agent` on `node:undici`.

| JSON | Our field |
| --- | --- |
| `rateCode` `CD` | `category` `cd` |
| `rateCode` `SAV` | `category` `savings`. `termMonths` is null. A `term` on a savings row is ignored. |
| `term` `12M` | `termMonths` 12. Any other CD term shape is `term`. |
| `type` | Bank product id, stored as `fdic:27471:<type>`. |
| `effectiveDate` | `asOf`. `systemDate` is not `asOf`. A date more than 180 days before the retrieval day is `stale` and is not an offer. A date after the retrieval day is `asof_future`. |
| `apy` | JSON number. `String(apy)` must match `^\d+(\.\d{1,6})?$`, then `rateFromPercent` moves the decimal point on that string. No division, no `parseFloat`, no decimal.js. `String(4.5)` is `4.5` and the rate is `0.045`. A text with more than six decimal places, or an exponent, is `apy_format` and is not rounded into a rate. |
| `rate` `0.0` or `apy` 0 | The term is not offered. The row is skipped. A 0% rate is never published. |
| `type` `37xx` or a description that starts with `IRA` | Excluded in the pilot. |

`rate` is the interest-rate string. It is not the APY and it is not parsed as a `Rate`, except the exact `0.0` skip.

Minimum deposit, balance tiers, early-withdrawal penalty, and eligibility are not in the JSON. They are taken from the product page and the disclosures at the first connection and confirmed by a person. They are not assumed. Compounding and tax treatment are also absent from the JSON. `publishAmexProducts` throws. A broken body (`interestRateList` missing) parses as `broken` and publishes nothing.

CD rows use the JSON term and APY. The penalty is the sentence on the public CD page (`/en-us/banking/online-savings/cd-account/`), read 2026-11-16 with the project User-Agent. `robots.txt` for `User-agent: *` does not disallow that path. The day count is the number in the sentence that names the term: less than 12 months is 90 days, at least 12 and less than 48 is 270, at least 48 and less than 60 is 365, 60 or more is 540. A term the sentences do not cover is not a product. The same page says there is no minimum balance to open and that interest compounds daily. Those two sentences are the minimum and the compounding. A person confirms the bank at first connection. The quotes stay in the adapter; the CD page is not fetched again on each run.

### Sallie Mae and Ally CD pages (2026-11-16)

Sallie Mae `bank:fdic:58177`. The CD URL without a trailing slash is a 301 to the slash URL. The session follows that redirect. The flip cards are not the source: a real run returned no products from them. The rate table is in the raw HTML of `https://www.salliemae.com/savings/certificates-of-deposit/` (caption "Certificate of Deposit (CD) rates table"). The same fetch with the project User-Agent contained the 11 terms. `/savings/rate-table/` also lists those terms, and it does not carry the penalty sentences, so the adapter reads the table on the CD page. The penalty is the sentence on that page: 90 days of simple interest when the term is 12 months or less, 180 days when it is longer. The digits come from those sentences. A page that does not contain both sentences yields no products. `robots.txt` is `User-agent: *` with no `Disallow`.

Ally `bank:fdic:57803`. `robots.txt` `User-agent: *` disallows only `/content/dam/static/js/tagging/`. `view-rates/`, `/bank/cd-rates/`, and `/bank/high-yield-cd/` were fetched the same day. They state one APY per card and "Early withdrawal penalty will apply", or they point at the deposit-agreement PDF. They do not list a term next to a day count. No Ally CD product is emitted. The savings card on `view-rates/` stays the product.

After the bank is confirmed, a product id is known when it is in `bank_product_confirmations` (source, product, login, date, snapshot) or in the previous published `bank_products` version. Any other id stays `first_connection` and is not published on that run. The known ids follow the usual stale, APY, and move checks. `pnpm ingest:approve <id>` on a `bank:` review row confirms exactly the product ids of that bank listed in the row's reason and, when the bank is confirmed, publishes those products from the row's own snapshot (read again by the adapter, retrieval day = snapshot day). Decision, confirmations, and publish are one transaction. Before the database is touched, the command checks `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `REVALIDATE_SECRET`. A snapshot that no longer holds every listed id fails the approve before the transaction. Revalidate runs after the commit; a failure is a warning with `pnpm ingest:revalidate <domain>`, not an error. `pnpm ingest:publish-approved <id>` finishes an approved bank row whose publish did not run. It is idempotent: an id already in the current `bank_products` version is skipped, and nothing left prints `review <id> already published`. The 2026-11-17 migration copies the owner's earlier checks: `fdic-57803-savings` (Ally) and `fdic-27471-3200` (American Express), only where that bank already has a `bank_confirmations` row. `pnpm ingest:confirm-bank` on a bank that is already confirmed prints the stored login and date with `(already confirmed)` and exits 0.

The American Express CD sentences are watched weekly, source `amex-cd-page`, at the end of the `bank-rates` job. The fingerprint is those sentences and nothing else. The page answers with about 32 KB of response headers (2026-11-18), so the 64 KB undici agent is the transport of every `createScrapeSession` (`scrapeFetch`), not an Amex-only client. Every bank and the watch share the one `bank-rates` session; there is no second fetch path. A manual stop is stored as its reason code (`headers_overflow`, not `unknown`). A failed follow-up logs `source bank-rates followup failed` and does not fail a night whose banks succeeded; its issue is the signal. `pnpm ingest:resume <source-id> --reason <text>` puts a `manual` source back to `active` and inserts the login and reason into `source_status_log` in the same transaction. It refuses an excluded bank. The first snapshot is a baseline. A later difference queues one review and does not change the hard-coded quotes or publish a product. The fetch uses that job's scrape session, including the Denver overnight window. One fetch per UTC week: a later slot in the same week is `already_fetched`.

When a bank source publishes a version, every review row that was already open for that source is closed in the same transaction. Status is `superseded`, `decided_by` stays null, and `decision_reason` is `superseded by version <id>`. A review opened for rows that this same publish still holds is inserted after that close, so it stays open.

The fixture is a trimmed copy of the 2026-11-15 JSON: the 3-month CD (`apy` 0), the 10-month and 12-month CDs, the IRA 6-month CD (`type` 3706), and the High Yield Savings row. Expected rates in the test are the hand values `0.045`, `0.0375`, and `0.032`.

### Pilot vetting (2026-11-17)

One request per page with `FA (+https://fin-aggr.vercel.app)` (`FA_SCRAPE_MAILBOX` was not set), 10 seconds per registrable domain, no cookie, outside the overnight window, as on 2026-11-15. Pages were not stored. FDIC ids come from `institutions` searched by name. Every response header block was under 6.2 KB. No page stated national availability in text; that column is not checked and is not assumed.

"Pricing geography" (ADR-022) was added after this pass: whether the page's rates depend on a ZIP, and whether the site takes a ZIP in a query or public API parameter. No page was read for it, so every row is `not checked`. The pilot banks `fdic:57803`, `fdic:27471`, and `fdic:58177` returned one rate set without a ZIP and are backfilled as `national`.

| Bank | FDIC | Final host | robots `*` | Rates without JavaScript | Stated date | Pricing geography | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bread (Comenity Capital) | `fdic:57570` UT | `www.breadfinancial.com/en/bread-savings.html` | `Allow: /` | APY in HTML and ld+json, minimum on page | none found | not checked | take; term table and penalty sentence still to find |
| EverBank | `fdic:34775` FL | `www.everbank.com/banking/cd` | `Allow: /` | ld+json `QuantitativeValue` "APY for new accounts" | 11/13/2026 | not checked | take; penalty sentence not found yet |
| Happen Bank (formerly LendingClub) | `fdic:32551` UT | `www.happen.com/personal-banking/savings/certificate-of-deposit` | `Allow: /` | APY, terms, $500 minimum in HTML | 11/16/2026 | not checked | take; penalty is "at the bank's discretion", not a day count, so review |
| First-Citizens (CIT Bank) | `fdic:11063` NC | `www.cit.com/cit-bank/platinum-savings` | no rule | savings APY tiers in HTML | July 1, 2026 | not checked | take savings only; CD pages are a script shell |
| Barclays | `fdic:57203` DE | `banking.us.barclays/` | robots 404, no policy | savings APY in HTML | 10/07/2026 | not checked | take savings only; CD URL unknown |
| Synchrony | `fdic:27314` UT | `www.synchrony.com/banking/products/cd` | no rule | empty `% APY`, blank "as of" | blank | not checked | later; rates load by script |
| Capital One | `fdic:4297` VA | `www.capitalone.com/bank/cds/online-cds/` | no rule | `NaN APY`. The CMS model `/assets/shell/page_models/bank/resourceapi/bank/disclosures/cds/online-cds.json` (inline as `web-shell-state`) carries the terms (6–48 months), the date, and the penalty (12 months or less: 3 months of interest; longer: 6 months), with rates as `${rates:cds:…:interestRateType=APY}` tokens. A `DynamicDataHandler` outside the 131 shell chunks fills them | 11/16/2026 | not checked | later; the token source needs a browser network capture |
| Access Bank (ACCESSbank) | `fdic:58727` NE | `www.accessbank.com/for-you/accounts/interest-rates` | no rule | effective date element empty | not stated | not checked | later; table rules above, state eligibility |
| Goldman Sachs Bank USA (Marcus) | `fdic:33124` NY | `www.marcus.com` | robots itself 403 | 403 | — | not checked | no; a block is manual mode |
| Live Oak Banking Company | `fdic:58665` NC | `www.liveoakbank.com` | 403 | 403, captcha | — | not checked | no; manual mode |
| Discover Bank | `fdic:5649` DE, `ACTIVE` 0 since 2025-05-18 | redirects to Capital One | — | — | — | not checked | no; covered by `fdic:4297` |

FDIC `WEBADDR` is stale for Synchrony (`synchronybank.com`), Bread (`Savings.Breadfinancial.com`), and Live Oak (`liveoak.bank`). An adapter config uses the final host after redirects. None of these rows is in the registry until its adapter lands.

## Alternatives considered
- Ingest inside `apps/web` route handlers: rejected. A scrape does not belong in the request path, and the web bundle must not take on connector code. Actions have no serverless time limit and already run Playwright.
- Publish every parsed row and fix mistakes later: rejected. A wrong rate is the consumer-risk in the plan. Hold is the default.
- An admin UI in step 4: rejected. The queue is a CLI and an issue in the private repository until it outgrows that.
- Filing review issues on this public repository: rejected. The diff and the snapshot link would be public.
- Rotating proxies so a bank's bot check does not fire: rejected. A block is a stop, not a prompt to change address.
- Treat Crawl-delay as our rate limit: rejected. The 5–10 second gap is ours. `robots.txt` only grants or denies the path.
- Map a term span such as `6–8 Month` to its low end, its high end, or its midpoint: rejected. Each of those is a term the cell did not state. One product per month in the span would invent terms the cell did not list.
- Use `retrievedAt` as the bank's "as of" when the page leaves the date blank: rejected. That publishes a date the bank did not state.
- Treat the headquarters state as the eligibility list when the bank is not nationwide online: rejected. The list has to come from the bank's page.
- Treat 31 CFR 356.12(a) as a balance-tier schedule: rejected. It states one minimum to bid. The minimum is `minOpening`. The single award price is 31 CFR 356.20(d)(1).
- Read 31 CFR 356.20(d)(1) as every Treasury auction: rejected. Paragraph (d)(2) still describes multiple-price awards. The stored quote is (d)(1) only.
- Store the "$100" example in 31 CFR 356.21 as the minimum deposit: rejected. That sentence says bills may be issued with that minimum. 356.12(a) puts the amount in the auction announcement and states no dollar figure.
- Turn an American Express JSON `apy` into a rate with `apy / 100` or decimal.js: rejected. `String(apy)` plus `rateFromPercent` does not do float arithmetic. A value that does not stringify inside six decimal places is reviewed, not rounded.
- Publish a 0% row, or an IRA row, from the American Express pilot: rejected. `apy` 0 means the term is not offered. IRA products stay out of the pilot.
- One `bank-rates` cron at 08:00 UTC: rejected. A hosted runner starts hours after the cron. On 2026-11-16 the 08:00 run started at 15:14 UTC (10:14 Eastern), after 06:00, and returned without a request and without a log.
- Leave crons at minute 0: rejected. GitHub's load is highest then. Since `f9c48b8` the minute-0 `bank-rates` schedule has not started on its own.
- Keep `amex-cd-page` on Monday 11:00 UTC: rejected. That instant is the edge of the Denver window, and a delayed start falls outside it.
- Off-minute GitHub crons as the only trigger: rejected on 2026-11-18. They were tried first (2026-11-17) and still dropped every `bank-rates` night slot. `pg_cron` dispatch is now primary.
- Drop the GitHub `schedule` once `pg_cron` works: rejected. It costs nothing as a fallback, and the guards make duplicates harmless.
- A `workflow_dispatch` input that skips the overnight window: rejected. The window is a scrape rule, not a switch. A manual run is inside the window only during the UTC hours in the schedule section.

## Consequences
- Step 1 lands the dependency rules and the package skeleton. Connectors start at step 6, after the pipeline (step 4) and the schedule (step 5).
- A nightly live request checks that a source's shape still matches the recorded snapshot. The snapshot test does not hit the network.
- A lawyer is engaged at step 9, before the public launch. Steps 1–8 do not wait. `DEMO_PASSWORD` stays until that launch.
- The scrape mailbox is the env var `FA_SCRAPE_MAILBOX`. The owner still chooses the address; a bank run refuses to start without one. The person who applies a bank opt-out within 24 hours is `ViperClaw1`, the same login as the review queue. The queue owner is `ViperClaw1`, and the review repository is `ViperClaw1/fin-aggr-review`. `REVIEW_REPO_TOKEN` is an Actions secret. This ADR does not create accounts. Field codes of each source are appended in step 6 from that source's dictionary.
