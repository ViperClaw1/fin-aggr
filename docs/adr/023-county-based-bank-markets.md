# ADR-023: Bank markets are sets of counties, not ZIP3 prefixes

- Status: accepted (2026-11-24)
- Date: 2026-11-21
- Amends: ADR-022 (market unit, discovery sampling, expiry, browser matching)
- Relates to: ADR-004 (profile stays in the browser), ADR-007 (provenance), ADR-016, ADR-019, ADR-020
- Basis: audit, section 5

## Context
ADR-022 builds a market out of three-digit ZIP prefixes and samples one to three ZIPs per state. Banks do not price by ZIP3. They price by the area their branches serve, and that area follows counties and metro areas. A ZIP3 prefix can cross state and metro lines, so a prefix can put a ZIP in a market whose rate the bank does not offer there. That breaks invariant 6. Per-state sampling also misses metros inside a state that are priced differently.

Expiry in ADR-022 is a `now()` check in RLS. The answer then depends on when a request is made, not on the published version, so a rebuild can show different data with no ingest event. That breaks determinism (invariant 5) and provenance (ADR-007).

Invariant 2 still holds: the user's ZIP never leaves the browser.

## Decision
**Geography domain.** The HUD-USPS ZIP→county crosswalk becomes a versioned domain `geo` in the ADR-020 pipeline, with its own source, snapshot and version. A ZIP keeps every county with a nonzero `RES_RATIO`. A county below 0.1 may be dropped only when one county holds `RES_RATIO ≥ 0.9`. Whether a ZIP is ambiguous is decided per bank at compilation, not here. HUD serves the crosswalk through the HUD USER API, which needs a registered token, and as quarterly files. The source uses the API with a token in Actions secrets (`HUD_USER_TOKEN`, a new row in the plan's access table) unless the file download is confirmed to need no account.

**Bank footprint.** The counties where a bank is present come from FDIC BankFind locations together with Summary of Deposits (SOD). These are official sources and go through `official-fetch`.

**Bank's own list first.** When a bank publishes which counties or areas a rate applies to (for example a rate page that names the counties), that list is the source: a cited fact with URL and quote, checked by a person at approval. Sampling is the fallback for banks that publish no such list, and its result is a proposal, not a fact.

**Discovery.** For each CBSA (or metro division, where the CBSA has them) where the bank is present, discovery requests one representative ZIP. It also requests one non-metro ZIP per state of presence. The run keeps a cursor and continues from it in the next overnight window, so it is no longer all-or-nothing. Sampled ZIPs that return identical rate sets form one market, and that market is a set of counties.

**Compilation.** Ingest compiles a market's counties into the existing `BankMarket { zipPrefixes, zips }` and adds `ambiguousZips`:
- `zips` holds every ZIP whose counties all fall into this market, including a ZIP split between two counties of the same market.
- `zipPrefixes` holds a ZIP3 only when every ZIP under it falls into the same market.
- `ambiguousZips` holds ZIPs whose counties fall into more than one market of the bank, or partly outside its footprint. This is the only meaning of "ambiguous". These ZIPs get no single market rate.

The browser never sees counties. The contract change is additive.

**Publication and expiry.** Markets are published inside the `bank_products` version. Market offers reference their market through a foreign key `(version_id, bank_id, market_id)`. A market expires 45 days after `verified_at`. Expiry is an ingest event: the job that notices the age publishes a new version without the market and without its offers. RLS does not compare against `now()`.

**Approval.** Approving a discovery proposal checks that the bank's markets do not overlap: no county, ZIP or prefix is in two markets of the same bank. Overlap blocks approval.

**Browser matching.** The market map is loaded lazily, all of it, as one static file. The browser never requests a part keyed by ZIP or prefix. Match order:
1. exact ZIP in `zips`;
2. ZIP in `ambiguousZips`: no market rate, show the range with "Rate varies by region";
3. ZIP3 in `zipPrefixes`;
4. no match.

**Default offer.** A bank's offer defaults to `online`/`national`. A branch market offer is shown next to it and does not replace it. A relationship rate is its own row (`relationshipRate: true`) and never takes the place of the base rate or enter the range.

**Test.** An e2e test enters a profile ZIP and asserts that no browser request carries the ZIP or its three-digit prefix in the URL, headers or body.

## Alternatives considered
- Keep ZIP3 prefixes (ADR-022): prefixes cross state and metro lines, so the site would show unverified rates (invariant 6).
- Send counties to the browser and resolve ZIP→county there: the whole crosswalk is large, and it would turn county logic into a client contract. Compiling to ZIPs keeps the current `BankMarket` shape.
- Load the market map per ZIP3: the request path would reveal the profile prefix (invariant 2).
- Expiry by `now()` in RLS: not deterministic, and nothing in ingest history says when a market disappeared.
- Distance-based or census-tract markets: banks don't publish data at that level, and it would mean guessing.
- Warn when `profile.state` differs from the state of the profile ZIP (via the crosswalk): deferred. Useful, and the same data later drives state eligibility and credit-union field of membership, but it is not needed to show a market rate. Revisit with state eligibility.
- Primary county only for every ZIP (ignore `RES_RATIO`): gives a confident wrong answer for ZIPs on county lines.

## Consequences
- `BankMarket` gains `ambiguousZips` (additive) and a contracts test.
- New `geo` domain: source, snapshot, version, and a validation that `RES_RATIO` for each ZIP sums to about 1.
- Migration: `bank_markets` moves under `version_id`; market offers get an FK to it; the RLS `now()` check is removed; a cursor table is added for discovery.
- Ingest gains a footprint step (BankFind + SOD), CBSA sampling, county→ZIP compilation, an expiry job and a non-overlap check at approval.
- The gateway still has `listBankMarkets()`; the web side loads it lazily as a single file.
- New e2e test for profile ZIP leakage.
- The ADR-022 status line already points here. On acceptance, ADR-022 sections Markets, Discovery and Browser matching are marked amended by ADR-023.
- Unverified: the 0.9 threshold and the 45-day window are product choices, not taken from a source. Confirm them before acceptance.
