# ADR-022: Bank offers carry a pricing scope; markets are matched in the browser

- Status: accepted (2026-11-21). Amended by ADR-023 (accepted 2026-11-24): market unit (counties instead of ZIP3 prefixes), discovery sampling, expiry, browser matching
- Date: 2026-11-18
- Relates to: ADR-004 (profile stays in the browser), ADR-007 (provenance), ADR-016, ADR-020

## Context
Some banks price the same deposit product differently by state, market, or ZIP code. Today a `Product` has one rate set and no geography, and `products` is keyed `(version_id, id)`. If a ZIP-dependent rate were published as if it were national, the site would state a number the bank does not offer to most readers. Invariant 6 forbids that: a rate shown for a ZIP must have been read for a ZIP in the same market, and the market's ZIP list must have been checked by a person.

Invariant 2 forbids sending the user's ZIP anywhere. The site is built at build time (ADR-016), so matching has to happen in the browser.

## Decision
**Scope.** Every bank offer has `scope`: `{ kind: 'national' }` or `{ kind: 'market', marketId }`. A state is a market whose ZIP prefixes are that state's prefixes. `state` and `zip` kinds are added only when a real bank needs them.

`national` means the bank's rate page returned one rate set and offered no ZIP mechanism when it was read. It is not a statement of nationwide availability; eligibility stays in `Product.eligibility`.

**Identity.** A market offer's id is `<base>--m-<marketId>`. The row also carries `scope_kind` and `market_id` columns, so foreign keys from `product_tiers` and confirmations stay `(version_id, id)`. A national id never contains `--m-`. When a bank switches from national to market pricing, the new ids are new products: each one goes through `first_connection` review and confirmation again.

**Other dimensions.** `channel` (`online | branch`, default `online`) and `relationshipRate` (boolean, default `false`) are separate fields, not part of the scope. A relationship rate is never used as the base rate or in the "varies by region" range.

**Provenance.** `Provenance.requestZip` is the five-digit ZIP our request carried. A market offer without `requestZip` fails `Product` validation, so ingest blocks it and no gateway accepts it. `raw_snapshots.request_zip` records the same value for the stored body.

**How a ZIP reaches a bank site.** Only through a mechanism the site provides in the URL: a query parameter or a public API parameter. No cookie (the `scrape/rules.ts` credential rule stays as it is), no captcha, no workaround of the site's terms. Every request goes through `createScrapeSession` (robots, 10 s per registrable domain, overnight window).

**Markets** (amended by ADR-023). Table `bank_markets(bank_id, market_id, zip_prefixes, zips, representative_zip, verified_at, verified_by)`. A market applies to a ZIP only through a row verified within the last 45 days. An older row is treated as unverified and is not served; discovery runs again monthly. Daily collection makes one request per verified market with its `representative_zip`.

**Discovery** (amended by ADR-023; `pnpm ingest:discover-markets <bank>`, built when a bank with a URL ZIP mechanism passes vetting). It samples one to three ZIPs per state and the largest metros in one session within one overnight window. A run that does not finish is marked `incomplete` and is not queued. ZIPs that return identical rate sets form one market. A three-digit prefix is proposed only when at least two sampled ZIPs under it fell into the same market; otherwise only the exact ZIPs are listed. The proposal goes to `review_queue`; approving it writes `bank_markets` with `verified_at` and revalidates the compare page tags. Nothing is published automatically.

**Browser matching** (amended by ADR-023). The gateway returns offers with their scope and the verified `bank_markets` map. The browser matches the profile ZIP: exact ZIP first, then the three-digit prefix, otherwise no market. The page shows "Rate for ZIP {requestZip}, market {marketId}, checked {date}". With no ZIP, or no match, it shows national offers and, for banks with market pricing, the range over verified markets, excluding relationship rates, labelled "Rate varies by region". The profile ZIP never appears in a URL, a request body, a log, or analytics; a test asserts that.

## Alternatives considered
- Composite key `(version_id, id, market_id)`: every foreign key, the confirmation tables, the review reason parser, and `getProduct(id)` would change. The id suffix gives the same identity with one column added.
- Server-side matching by ZIP: sends a profile field over the network (invariant 2).
- Extrapolating a market rate to neighbouring ZIPs by distance: an unverified number (invariant 6).
- Passing ZIP in a cookie: the session refuses cookies as credentials. Revisit only for a named bank, in a new decision.

## Consequences
- `Product` gains `scope`, `channel`, `relationshipRate`; `Provenance` gains optional `requestZip`; `Profile` gains optional `zip`. Contracts tests cover the new refinements.
- The gateway gains `listBankMarkets()`.
- Migration adds the `products` columns, `bank_markets`, and `raw_snapshots.request_zip`. Pilot banks `fdic:57803`, `fdic:27471`, `fdic:58177` are backfilled as `national`.
- The week-2 vetting table gets a "Pricing geography" column.
- Discovery, per-market collection, and browser matching wait until a vetted bank has a URL ZIP mechanism.
