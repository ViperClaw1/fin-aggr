# FA: financial aggregator (Stage 1 prototype)

Frontend prototype on mock data. It compares US deposit products (CDs, savings, treasuries) by after-tax net yield, shows a source for every fact, and keeps the user profile in the browser. Every page shows a DEMO DATA banner.

Spec: [specs/Finance Aggregator Spec.md](specs/Finance%20Aggregator%20Spec.md). Decisions: [docs/adr/](docs/adr/).

## Layout (target)

pnpm monorepo: `apps/web` (Next.js App Router), `packages/contracts` (zod schemas, `DataGateway`), `packages/engine` (pure calculations), `packages/fixtures` (deterministic mocks).

## Commands

- `pnpm dev`: run the app (`NEXT_PUBLIC_DATA_SOURCE=mock`)
- Gates: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:canaries`, `pnpm depcruise`, `pnpm knip`, `pnpm test`, `pnpm build`, `pnpm e2e`

Not all gates exist yet; they arrive with the E0 scaffold.

Claude Code setup: [docs/claude-config.md](docs/claude-config.md).
