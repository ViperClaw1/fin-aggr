# FA: financial aggregator (Stage 1 prototype)

Frontend prototype on mock data. It compares US deposit products (CDs, savings, treasuries) by after-tax net yield, shows a source for every fact, and keeps the user profile in the browser. Every page shows a DEMO DATA banner.

Spec: [specs/Finance Aggregator Spec.md](specs/Finance%20Aggregator%20Spec.md). Decisions: [docs/adr/](docs/adr/).

## Layout

pnpm monorepo: `apps/web` (Next.js App Router), `packages/contracts` (zod schemas, `DataGateway`), `packages/engine` (pure calculations), `packages/fixtures` (deterministic mocks).

## Commands

- `pnpm dev`: run the app
- Gates: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:canaries`, `pnpm depcruise`, `pnpm knip`, `pnpm test`, `pnpm build`, `pnpm e2e` (run `pnpm build` first; Chromium via `pnpm --filter @fa/web exec playwright install chromium`)

## Data source

Public build-time variables, read only in `apps/web/src/shared/config/env.ts`. An invalid value stops the app at startup.

| Variable | Values | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` (fixtures in process) or `http` (stage 2 stub, every call fails with `not_implemented`) | `mock` |
| `NEXT_PUBLIC_FA_SEED` | non-negative integer; same seed, same data | `20261025` |
| `NEXT_PUBLIC_MOCK_FAILURE_RATE` | share of mock requests failing with `unavailable`, `0`..`1` | `0` |

Claude Code setup: [docs/claude-config.md](docs/claude-config.md).
