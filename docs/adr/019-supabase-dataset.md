# ADR-019: Supabase is the Stage 2 dataset, read only on the server

- Status: accepted
- Date: 2026-11-04 (accepted 2026-11-04)
- Relates to: ADR-004 (profile stays in the browser), ADR-005 (gateway), ADR-006 (ads are a separate contract), ADR-013 (money), ADR-014 (versions), ADR-016 (server load, lazy gateway, `DatasetInfo`), ADR-018 (PDF route stays on our origin)

## Context
Stage 1 serves fixtures through `gateway.mock`. `gateway.http` fails every call with `not_implemented`. Spec §8 reserves this number for Supabase. The Stage 2 plan (`docs/plan-stage-2.md`) needs a database for institutions, metrics, products, treasury, reference data, and documents, with a scheduled ingest beside it.

PostgREST returns `numeric` as a JSON number. A rate that is a JSON number is a float, which breaks `Rate` (a decimal string, up to 8 places, `0 <= r <= 1`). The browser must not open a connection to Supabase: CSP is `connect-src 'self'` (ADR-004, ADR-015) and the first-load budget (AC-8) stays.

`DatasetInfo` is `{ asOf, isMock }` (ADR-016 D6). One pair cannot describe a set where treasury moves daily and bank metrics move quarterly. `freshnessNow` uses the single `isMock` flag to choose the data-set date or the wall clock. A mixed set needs a different rule, or real rows will be aged as mock rows (or the reverse).

## Decision
Supabase (Postgres) is the third `DataGateway` implementation, next to `mock` and `http`. The `DataGateway` methods do not change. `http` stays the failing stub. The server reads through `@supabase/supabase-js` (PostgREST) and the text views below. `pg` is for the seed and for a domain publish or rollback in one transaction, not for page reads.

Projects `staging` and `prod` are on the Pro plan, region `us-west-1`. The region cannot be changed after the project is created. Pro is required: the free plan has no daily backups and pauses an idle project. The organization is already on Pro (2026-11-04); the two projects are not created yet. Vercel functions are stated as `iad1`. That was not checked in the project settings. A request the same day returned `x-vercel-id` starting with `fra1`, which is the edge POP for that client, not the function region. Supabase stays `us-west-1` either way.

- Local development uses `supabase start` beside those two projects. The browser never receives a Supabase URL or key. `NEXT_PUBLIC_DATA_SOURCE=mock|http|supabase`. The `supabase` module loads only through `import()` (`gateway-impl-dynamic-only`, ADR-016 D2). `gateway.supabase.ts` imports `server-only`. Keys are `SUPABASE_URL` and `SUPABASE_ANON_KEY`, without `NEXT_PUBLIC_`. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are banned in `apps/web/**` (step 1). Ingest uses the service role. The anon key is used only on the server. RLS is the backstop: `anon` and `authenticated` may `SELECT` rows that belong to the current version of a domain; they have no write policies. `service_role` bypasses RLS and is the only writer.
- Versioning is per domain, not one set: `institutions`, `bank_metrics`, `products`, `treasury`, `reference`, `par_yields`, `national_rates`, `documents`. Treasury rows live in `products` with category `treasury`, and they publish on their own domain so a daily curve does not flip CD rates. The par curve and FDIC national deposit rates are their own domains too, so a publish does not write onto the seeded `reference` version or hide tax and insurance. Ads stay in schema `ads` (ADR-006) and are not a domain in `dataset_versions`. Publishing a domain is one transaction that inserts the new version and flips `current`. Each domain keeps its versions for 30 days. `pnpm db:rollback <domain> <version>` points `current` at an older version still inside that window and then calls the same revalidate path as a publish. Rollback does not delete the version it leaves.
- Rates are stored as `numeric(11,8)` with a check `0 <= rate <= 1`. Eight fractional digits match `Rate`. Three integer digits let an out-of-range value fail the check instead of the type. Clients read rates only through views that cast each rate column with `::text`. A test parses every rate from the database as `Rate` and requires the same string back. Cents are `bigint`, checked to the safe-integer range (`-9007199254740991` … `9007199254740991`), because `Cents` is `z.int()`. Bank-metric fields that the contract types as `number` stay `number` (display percents and ratios). Dollars that arrive from a source as integer thousands become cents through `centsFromInteger`.
- `DatasetInfo` gains `domains`, one `{ asOf, isMock }` per domain. The existing `asOf` and `isMock` stay so current callers type-check. `isMock` is true only when every domain is mock. `asOf` is the mock date in that case, and the latest real domain date otherwise. The DEMO DATA banner stays up while any domain rendered on that page has `isMock: true` (step 9). Freshness follows `provenance.isMock` and that fact's domain `asOf`, not the rollup flag, so a real rate is not aged from the mock date. Step 3 implements this; step 0 does not change the schema.
- Page caches keep the spec §4 `s-maxage` values, with a `cacheTag` per domain. `reference` is one version domain; tax pages use `s-maxage=604800` and insurance pages `s-maxage=86400`, and both tags are `reference`. After a domain publish, ingest calls `POST /api/revalidate` with a secret, which calls `revalidateTag`. The Next 16.4 signature is taken from `node_modules/next/dist/docs/` at implementation time, not from memory.
- Storage buckets: `raw` (private snapshots) and `documents` (PDFs). The site serves a PDF at `/documents/[id].pdf` on our origin (ADR-018). CSP does not gain a Supabase host.
- Until real rows exist, `pnpm db:seed --target local|staging` loads fixtures in one transaction. `seed.sql` is generated and is not edited by hand. `prod` requires `--confirm prod`. `--dry-run` prints the plan and writes nothing.

Tables (created in step 2 with `supabase migration new`): `sources`, `dataset_versions`, `institutions`, `bank_metrics`, `products`, `documents`, `facts`, `tax_tables`, `insurance_rules`, `ads.sponsored_items`, `raw_snapshots`, `job_runs`, `review_queue`. Column lists follow `@fa/contracts` at migration time. This ADR does not invent source field codes.

## Alternatives considered
- Keep `gateway.http` as the real client of a separate API: rejected. It adds a service we would have to host. Supabase is that store, and the gateway talks to it on the server.
- `postgres` 4.0.0 instead of `pg`: rejected for the version rule. See the Stage 2 amendment in ADR-014.
- Return rates as JSON numbers and repair them in the gateway: rejected. A float cannot be shown to round-trip through `Rate`.
- One `dataset_versions` row for the whole database: rejected. A daily treasury publish would replace CD and tax versions that did not change.
- The free Supabase plan: rejected. No daily backups, and an idle project is paused. Pro is already the organization plan.

## Consequences
- Step 1 adds the package boundary and the ESLint bans before any key exists. It starts after M5 (plan decision 0). `@supabase/supabase-js` and the Supabase CLI are installed there. `pg` is installed at step 2 for the seed and rollback scripts. `robots-parser` and `cheerio` stay uninstalled until step 8.
- Step 3 adds the `supabase` arm, the `domains` field, and the contract tests against `supabase start`. Fixtures and the mock gateway gain `domains` in that same change.
- `listSponsored` reads `ads.sponsored_items` directly. Partner feeds stay out of scope, so the table may hold only fixture rows.
- A leaked anon key can read published rows and cannot write them. A leaked service role can. The service role stays in ingest and in GitHub Actions secrets.
