# ADR-020: Ingest is a separate package with a publish-or-hold pipeline

- Status: proposed
- Date: 2026-11-04
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
3. `validate` checks `@fa/contracts`, then the bounds APY 0–15%, a positive term, and a minimum deposit `>= 0`. Against the previous version it flags a rate move of more than 50 basis points, a product that appeared or disappeared, and a result that is empty or less than half the previous count.
4. A clean report publishes the domain. A suspicious scrape publishes only the clean rows and queues the rest. Any other suspicious domain is not published. A hard error leaves the previous version in place and notifies.
5. Publish is the one transaction from ADR-019, then `POST /api/revalidate`.
6. The run is a row in `job_runs` (source, start, end, status, row count, errors, bytes and request count for that registrable domain).

Provenance. Official APIs: `verified`, `by: official_api`, `sourceUrl` of the actual request. Scrapes: `unverified` until a person approves, then `verified`, `by: human`. No source: do not invent the value; open a review item.

`sources.kind` for operations is `official_api | scrape | manual`. The public `SourceRegistryEntry` stays as it is until the first scraped source is listed. That change adds `scrape` to the enum (additive, step 8). `partner_feed` stays unused.

Review has no admin UI. `pnpm ingest:review`, `pnpm ingest:approve <id>`, and `pnpm ingest:reject <id> --reason` are the interface. A bot opens one GitHub issue per batch, with the snapshot and the diff. An admin page waits until the queue is large.

Schedule is GitHub Actions (`schedule`), one workflow per cadence, `concurrency` per source, `timeout-minutes`, one retry on a network error. The cadence table is in `docs/plan-stage-2.md` (step 5). A worker container is a later move if the minutes run out. Tax tables are a manual yearly job. A new tax year is loaded as `unverified` and is not published until two people have checked it. `TAX_YEAR` changes in one commit after that.

Scraping rules, enforced by the runner (step 8.1), not only by this text:

- Public pages only. No login, no account, no acceptance of terms.
- `robots.txt` is read before each registrable domain (`robots-parser`). A disallowed path puts that institution into manual mode.
- At most one request per 5–10 seconds per domain, one session, in the overnight window of the bank's time zone. Send `If-Modified-Since` and `ETag`.
- The User-Agent names the project, its URL, and the project mailbox. That mailbox is not a personal address.
- A captcha or a block stops the adapter, notifies, and switches the institution to manual mode. The protection is not bypassed.
- `job_runs` records requests and bytes per domain per day.
- A bank's opt-out is a flag on `sources`, applied within 24 hours, and written to the log.
- Keep facts and short quotes. Page and PDF snapshots stay in private storage.

Adapters, cheapest first: JSON already on the page (`application/ld+json`, framework data, or the page's own public JSON), then HTML selectors from a config, then Playwright only when the rates are absent without JavaScript. If the institution has a public rates API or a developer page that accepts an email registration, use that instead of scraping. Each adapter normalizes to `Product`. Eligibility (residency, state, minimum) is entered by a person the first time; after that the adapter watches for changes. A broken adapter (empty, half the products, unknown structure) publishes nothing. The previous rows stay, with their freshness.

Bank PDFs (Truth in Savings) are hashed into `documents`. Text comes from pdf.js. Extracted facts are proposals until a person confirms them. The viewer highlight is clipped to the quote's characters (the limit recorded in ADR-018).

Connectors land in the plan's order: FDIC institutions, FDIC financials, NCUA 5300, FDIC national rates via FRED, then Treasury. Market median, mean, and percentile for bank health are computed in ingest over the banks of that quarter. The method is stated on `/methodology`. The mapping from each source field to `MetricKey` is added to this ADR in step 6, from the source's own dictionary.

## Alternatives considered
- Ingest inside `apps/web` route handlers: rejected. A scrape does not belong in the request path, and the web bundle must not take on connector code. Actions have no serverless time limit and already run Playwright.
- Publish every parsed row and fix mistakes later: rejected. A wrong rate is the consumer-risk in the plan. Hold is the default.
- An admin UI in step 4: rejected. The queue is a CLI and a GitHub issue until it outgrows that.
- Treat Crawl-delay as our rate limit: rejected. The 5–10 second gap is ours. `robots.txt` only grants or denies the path.

## Consequences
- Step 1 lands the dependency rules and the package skeleton. Connectors start at step 6, after the pipeline (step 4) and the schedule (step 5).
- A nightly live request checks that a source's shape still matches the recorded snapshot. The snapshot test does not hit the network.
- Legal review of scraping, stored pages, bank names, and the public legal pages is listed in the plan for a lawyer. It does not change this ADR by itself. The code follows the rules above either way.
- Opt-out, the mailbox, and the GitHub secrets are human setup (plan step 0). This ADR does not create accounts.
