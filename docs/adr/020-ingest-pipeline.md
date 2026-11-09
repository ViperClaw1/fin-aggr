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

1. `fetch` stores the raw body in the private `raw` bucket with its sha256. An unchanged hash stops the run.
2. `parse` is pure. Tests use saved snapshots.
3. `validate` checks `@fa/contracts`, then the product bounds accepted 2026-11-04: APY from 0 to 15%, a positive term, and a minimum deposit `>= 0`. A rate move of more than 50 basis points goes to review. An empty result, or one smaller than half the previous count, blocks the publish. The code reads the bounds from `PRODUCT_BOUNDS` in `packages/ingest`, so a revision is not a hunt through connectors.
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

Raw snapshots in `raw`: a snapshot that a version still in the 30-day window points at is kept while that version is kept. Other snapshots are kept 90 days. This is the working rule (2026-11-04) and is confirmed before step 8. It is both a storage cost and a question of keeping someone else's text; the lawyer sees it at step 9, and the rule still has to be chosen before the first scrape.

GitHub-hosted runner addresses are often blocked as bots. A block sends that institution to manual mode under the rule above. Proxy rotation is rejected: it bypasses that protection. Before step 8, either accept the manual-mode outcome or run the scrape from a worker with a static IP. The choice is open.

Schedule is GitHub Actions (`schedule`), one workflow per cadence, `concurrency` per source, `timeout-minutes`, one retry on a network error. The cadence table is in `docs/plan-stage-2.md` (step 5). A worker with a static IP is the open choice in the runner-address paragraph, not a later optimization. A move off Actions for lack of minutes stays a later decision. Tax tables are a manual yearly job. A new tax year is loaded as `unverified` and is not published until two people have checked it. `TAX_YEAR` changes in one commit after that.

Scraping rules, enforced by the runner (step 8.1), not only by this text:

- Public pages only. No login, no account, no acceptance of terms.
- `robots.txt` is read before each registrable domain (`robots-parser`). A disallowed path puts that institution into manual mode.
- At most one request per 5–10 seconds per domain, one session, in the overnight window of the bank's time zone. Send `If-Modified-Since` and `ETag`.
- The User-Agent names the project, its URL, and the project mailbox. That mailbox is not a personal address. The mailbox and the person who applies a bank opt-out within 24 hours are named before step 8. Neither is named on 2026-11-04.
- A captcha or a block stops the adapter, notifies, and switches the institution to manual mode. The protection is not bypassed.
- `job_runs` records requests and bytes per domain per day.
- A bank's opt-out is a flag on `sources`, applied within 24 hours, and written to the log.
- Keep facts and short quotes. Page and PDF snapshots stay in private storage.

Adapters, cheapest first: JSON already on the page (`application/ld+json`, framework data, or the page's own public JSON), then HTML selectors from a config, then Playwright only when the rates are absent without JavaScript. If the institution has a public rates API or a developer page that accepts an email registration, use that instead of scraping. Each adapter normalizes to `Product`. Eligibility (residency, state, minimum) is entered by a person the first time; after that the adapter watches for changes. A broken adapter (empty, half the products, unknown structure) publishes nothing. The previous rows stay, with their freshness.

Bank PDFs (Truth in Savings) are hashed into `documents`. Text comes from pdf.js. Extracted facts are proposals until a person confirms them. The viewer highlight is clipped to the quote's characters (the limit recorded in ADR-018).

Connectors land in the plan's order: FDIC institutions, FDIC financials, NCUA 5300, FDIC national rates via FRED, then Treasury. Market median, mean, and percentile for bank health are computed in ingest over the banks of that quarter. The method is stated on `/methodology`. The mapping from each source field to `MetricKey` is added to this ADR in step 6, from the source's own dictionary.

## Source fields

### FDIC institutions (2026-11-09)

Read from [`institution_properties.yaml`](https://api.fdic.gov/banks/docs/institution_properties.yaml) and [`swagger.yaml`](https://api.fdic.gov/banks/docs/swagger.yaml) (`GET /institutions`, server `/banks`). The institutions schedule stays `pending` until the pipeline ports write a domain version. This slice parses and checks the shape. It does not publish.

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
- The mailbox and the 24-hour opt-out owner are still unnamed; both are named before step 8. The queue owner is `ViperClaw1`, and the review repository is `ViperClaw1/fin-aggr-review`. `REVIEW_REPO_TOKEN` is an Actions secret. This ADR does not create accounts. Field codes of each source are appended in step 6 from that source's dictionary.
