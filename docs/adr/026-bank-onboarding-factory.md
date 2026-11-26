# ADR-026: Bank onboarding factory

- Status: accepted
- Date: 2026-11-26 (accepted 2026-11-26)
- Amends: ADR-020 (adapters, first-connection review, review UI, static-IP worker, one-bank-at-a-time run), ADR-007 (provenance `by`)
- Relates to: ADR-004 (profile stays in the browser), ADR-014 (versions), ADR-019, ADR-022, ADR-023 (bank markets)
- Basis: discussion with the owner 2026-11-26; plan step 8

## Context
The product has value only with enough coverage. A catalog of 3–5 banks gives nothing a reader could not get by opening those sites. The owner's target: 30–50 key banks at launch, then a rate of several hundred institutions a month.

The market is about 8,000–8,500 institutions: 4,238 FDIC-insured institutions at the end of Q2 2026 (FDIC QBP, reported by the ABA Banking Journal) and roughly 4,000 federally insured credit unions (exact count from our NCUA 5300 load). 300 a month for four months is about 1,200, roughly 15% by count. Covering every institution in four months needs about 2,000 a month. Many small institutions publish no rates online at all ("call a branch", PDF rate sheets).

The step 8 pipeline does not scale to that:
- An adapter is code per bank (`packages/ingest/src/banks/amex.ts` reads JSON, Sallie Mae reads one HTML table, penalty sentences are typed by hand). About half a day to a day per bank.
- A first connection is reviewed by a person in full, through the CLI and a private issue (ADR-020). The admin UI trigger in ADR-020 (more than 20 items a week) fires at once at this rate.
- A block from GitHub-hosted runner addresses is manual mode, and a static-IP worker is rejected (ADR-020). Marcus and Live Oak already answered 403.
- `runScheduled('bank-rates')` runs banks strictly one at a time (`runOneAtATime`), although the 10 second gap applies per registrable domain only.

## Decision
Bank onboarding becomes a factory with measured stages. A person reviews exceptions and a sample, not every product.

**Coverage metric.** Coverage is measured as the share of domestic deposits (FDIC `DEP`, NCUA `ACCT_018`, already in `bank_metrics`) and as availability per state (national online banks plus the largest institutions with branches in that state), not as the count of institutions. The launch threshold is 50 key banks: national online banks first, then the largest by deposits. The long tail is covered last, by the factory or by licensed data (below).

**Measurement first.** Before the factory is built, a read-only survey runs over the 500 largest institutions by deposits through `createScrapeSession`, within the scrape rules. Per institution it records: a rates page found or not, rates present without JavaScript, a block (captcha, 401, 403, 429, robots), a platform fingerprint, a Truth in Savings PDF found or not. Output: the curve "N institutions → share of deposits", the share of blocked sites, and the platform clusters. The numbers in this ADR's consequences are revised from that survey.

**Discovery.** From the FDIC `WEBADDR` (final host after redirects): `robots.txt`, `sitemap.xml`, links whose text names rates, common paths. A language model classifies candidate pages as a rates page, a product page or a disclosure PDF. The result is a proposal: URLs only, no rate.

**Platform fingerprint.** Many smaller institutions run their site or rate widget on a few vendor platforms. A fingerprint (generator meta, script hosts, widget markup, JSON endpoints) groups institutions by platform. One template adapter per platform serves every institution on it. Which vendors and how many institutions each covers is not assumed: the survey measures it.

**Adapters are configuration.** An adapter is data, not code: a kind (`json_path`, `ld_json`, `html_table`, `pdf_table`), the URL, and a mapping from source fields or columns to `Product` fields. The existing generic parts (`classifyTableRow`, ld+json reading) run every config. A per-bank code adapter stays only where a config cannot express the source (the American Express JSON endpoint with its headers today).

**A language model writes the config, not the nightly read.** At onboarding the model receives the snapshot and proposes (a) the adapter config and (b) the products, each field with a verbatim quote from the snapshot. The nightly run executes the config deterministically, with no model call. The model is called again only when an adapter breaks (empty result, half the rows, unknown structure), and its new config is a proposal for review. The model, its version and the prompt version are recorded on the review row. The provider and SDK are chosen in a follow-up ADR under ADR-014's version rule. The snapshot sent to the model is the public page already stored in `raw`. No profile data exists in ingest (ADR-004).

**Automated checks.** A proposed product passes only if every check passes:
1. Each field's quote is an exact substring of the snapshot text.
2. The field value parses from its quote (term, APY, minimum, penalty days), with the existing parsers (`rateFromPercent`, `parseCents`). No float.
3. The config run over the same snapshot reproduces the model's products exactly.
4. A second extraction with a different prompt (or model) agrees on every field.
5. APY and interest rate agree under the stated compounding where both are shown. Bounds of `PRODUCT_BOUNDS`.
6. Where a Truth in Savings PDF exists, its minimum, compounding and penalty agree with the page.
7. Outlier check against FDIC national rates (domain `national_rates`) for that term: beyond a band set from the survey goes to review.
8. `duplicate_term` and the ADR-020 move, stale-date and count gates.

**Publication policy.**
- A product that passes every check publishes with `verification: { status: 'verified', by: 'automated_check', verifiedAt }`. `Provenance.verification.by` gains the value `automated_check` (additive).
- A person reviews: every failed check; the first 10 institutions of each platform template; a random sample of 10% of automated publishes each week; every rate move above 50 basis points (ADR-020).
- A sampled product that a person rejects stops automated publishing for that template until its cause is fixed.
- The site states how each rate was checked: "checked by a person" or "checked automatically against the bank's page". The wording is a DRAFT for the owner and the lawyer.

**Review UI.** The ADR-020 trigger is met. `apps/admin` is built as a separate app, not inside `apps/web`: the snapshot with highlighted quotes beside the proposed fields, one action to approve or reject with a reason. The CLI stays. Target: 2–5 minutes of a person per institution.

**Run.** Banks run in parallel across registrable domains. The 10 second gap, the overnight window and the once-per-night guard stay per domain. The run is sharded across jobs so one job stays within the Actions time limit. A static-IP worker is allowed for institutions blocked from runner addresses, with the same User-Agent, robots and gap rules. Proxy rotation stays rejected: a block from our declared address is still a stop.

**Licensed data track.** A licensed rate feed (S&P RateWatch, Curinos or similar) is asked for price and for the right to display rates publicly, in parallel with the factory. If the terms allow public display, the feed covers the tail, and the factory covers the institutions where a quote from the bank's own page is worth its cost. That choice is the owner's.

## Alternatives considered
- Keep a code adapter per bank and full human review: about half a day per bank; 300 a month is not reachable by one developer.
- A language model reads every page every night: cost grows with coverage, results are not reproducible, and a model error reaches the site without a structural change to trigger review.
- Publish model output without checks: breaks invariant 6.
- Count coverage as number of institutions: thousands of small institutions without online rates would dominate the metric and the effort.
- Rotating proxies to pass bot checks: a block is a stop (ADR-020).
- Licensed data only: unknown cost and display rights; no quote from the bank's own page.

## Consequences
- Plan step 8 is rewritten around the factory, step 9 launches at the 50-bank threshold (`docs/plan-stage-2.md`).
- Contract: `Provenance.verification.by` gains `automated_check` (additive). The UI shows the check method next to each rate.
- New dependencies: a language model SDK and a static-IP worker. Each needs its own ADR and version pin (ADR-014). Not installed by this ADR.
- New app `apps/admin`, with its own depcruise boundary: it does not import `apps/web`, and `apps/web` does not import it.
- Tables: `adapter_configs` (institution, kind, config, model and prompt version, status), `survey_results`, `platforms`. A migration per table when built.
- Metrics per week, from `job_runs` and `review_queue`: institutions onboarded, person-minutes per institution, adapter breakage rate, share of products reviewed by a person, share of deposits covered.
- Throughput target, to be revised after the survey: 50 key banks by the end of week 5; 150–200 a month in month 2; 300 or more a month from month 3.
- Owner decisions before the factory publishes automatically: the coverage metric, the publication policy above, the static-IP worker, the model and review budget, the request to licensed data vendors. The lawyer sees the wording of "checked automatically" before launch.