# FA: financial aggregator (Stage 1 prototype)

The app compares US deposit products (CDs, savings, Treasuries) by what you keep after tax. Every shown figure has a source or an assumption. The profile stays in the browser. Every page shows a DEMO DATA banner.

Production: <https://fin-aggr.vercel.app> (password gate; the password is not in this repo). The data is synthetic.

Spec: [specs/Finance Aggregator Spec.md](specs/Finance%20Aggregator%20Spec.md). Acceptance: [docs/acceptance.md](docs/acceptance.md).

## Requirements

- Node.js ≥ 24 (`engines` in `package.json`)
- pnpm 11.10.0 (`packageManager`; enable it with `corepack enable`)
- Python 3 for `pnpm golden:check` (`python3`, `python`, or `py -3`; override with `PYTHON`)
- Chromium for e2e: `pnpm --filter @fa/web exec playwright install chromium`
- Firefox and WebKit, when you run `pnpm e2e:browsers`: `pnpm --filter @fa/web exec playwright install firefox webkit`

## Quick start

```sh
pnpm install
```

Copy `.env.example` to `apps/web/.env.local` when you need to override a variable. Next loads env from `apps/web` (the working directory of `pnpm dev`). The defaults match the example, so the copy is optional for a first run.

```sh
pnpm dev
```

Open <http://localhost:3000>. `predev` builds the synthetic PDFs. The `dev` script copies pdf.js standard fonts when they are missing.

## Layout

pnpm monorepo: `apps/web` (Next.js App Router), `packages/contracts` (zod schemas, `DataGateway`), `packages/engine` (pure calculations), `packages/fixtures` (deterministic mocks).

## Checks

| Command | What it catches |
| --- | --- |
| `pnpm format:check` | Prettier drift |
| `pnpm typecheck` | TypeScript errors |
| `pnpm lint` | ESLint, zero warnings |
| `pnpm lint:canaries` | A lint or dependency rule that no longer fails on its canary |
| `pnpm depcruise` | Import boundaries (layers, gateway, ads, profile) |
| `pnpm knip` | Unused files, exports, and dependencies |
| `pnpm test` | Unit tests, engine coverage thresholds, at least 20 golden cases |
| `pnpm golden:check` | A golden JSON file that no longer matches its Python script |
| `pnpm build` | Production build |
| `pnpm bundle:report` | First-load JS over 200 KB gzip on `/compare/[category]`, or zod in that first load |
| `pnpm e2e` | Playwright in Chromium. Run `pnpm build` first |
| `pnpm e2e:browsers` | The same production e2e in Firefox and WebKit |
| `pnpm rules:check` | Cursor rule copies drifted from `.claude/rules` |
| `pnpm lhci` | Lighthouse CI, mobile, no profile, against `pnpm start` |
| `pnpm lhci:profile` | The same run with a complete draft in `localStorage` |

`pnpm e2e` on a pull request is Chromium. Firefox and WebKit run on `main` and nightly (`e2e-browsers` in `.github/workflows/ci.yml`).

The `pre-push` hook runs `pnpm knip`, `pnpm lint`, and `pnpm typecheck`. `depcruise` stays in CI.

## Environment

Public build-time variables are read only in `apps/web/src/shared/config/env.ts`. An invalid value stops the app at startup. `DEMO_PASSWORD` is read in `apps/web/src/proxy.ts` and is not a `NEXT_PUBLIC_` variable.

| Variable | Values | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` (fixtures in process) or `http` (every call fails with `not_implemented`) | `mock` |
| `NEXT_PUBLIC_FA_SEED` | non-negative integer; same seed, same data | `20261025` |
| `NEXT_PUBLIC_MOCK_FAILURE_RATE` | share of mock requests failing with `unavailable`, `0`..`1` | `0` |
| `NEXT_PUBLIC_SITE_URL` | origin for canonical and Open Graph URLs, no trailing slash | `https://fin-aggr.vercel.app` |
| `DEMO_PASSWORD` | server-only gate. Empty means the site is open | empty |
| `FA_DOCS_OUT` | directory for synthetic PDFs | `apps/web/public/mock-docs` |
| `LHCI_PROFILE` | `1` seeds the Lighthouse draft. `pnpm lhci:profile` sets it | unset |
| `NEXT_TELEMETRY_DISABLED` | `1` turns off Next telemetry | set in `.env.example` |

`http` is the stage 2 stub. A Supabase source is planned after M5: [docs/plan-stage-2.md](docs/plan-stage-2.md). It is not a value of `NEXT_PUBLIC_DATA_SOURCE` yet.

## Add a product category

Follow `.claude/skills/add-product-category/SKILL.md` (`/add-product-category`). Stage 1 categories are CDs, savings, and Treasuries unless the scope is confirmed.

1. Contract in `packages/contracts`: product and query schemas (`.strict()`, no profile fields, no commercial keys) and `DataGateway`. Additive only.
2. Fixtures in `packages/fixtures`: deterministic seed data, `isMock: true` on every fact, a contract test that parses them.
3. Engine calculation with a golden case (`/add-golden-case`). Expected values are calculated independently. No source: mark `unverified` and ask.
4. Entity slice, then a widget table (`DataTable`, `FactValue`, `SourceCitation`, `ExplainMath`).
5. A thin `page.tsx` under `apps/web/src/app`.
6. An e2e path and an axe check.
7. `pnpm typecheck` and the tests for the slice. Before a commit, `/verify`.

## Synthetic PDFs

`tools/build-docs.mjs` writes eight PDFs from the fixture quotes. `predev` and `prebuild` run it. The script skips the write when `apps/web/public/mock-docs/.seed` still matches the seed, the pdf.js version, the fixture sources, and the script.

The PDFs and the copied fonts are gitignored. To rebuild, delete `apps/web/public/mock-docs/` and run `pnpm dev` or `node tools/build-docs.mjs`. `FA_DOCS_OUT` redirects the output (the unit test uses a temp directory).

## Deploy (Vercel)

The project deploys from `main`. Set `NEXT_PUBLIC_DATA_SOURCE=mock` and a `DEMO_PASSWORD` for Production. Leave the password empty on a preview you want PageSpeed to measure.

After changing an environment variable, Redeploy. Vercel does not rebuild the current deployment by itself.

`<meta name="build">` is `VERCEL_GIT_COMMIT_SHA` (`apps/web/src/app/layout.tsx`). Locally it is `local`. With the password gate on, the same tag is on the password form (`apps/web/src/proxy.ts`). CI job `production-commit` waits up to 8 minutes and fails when the live tag is a different commit (`tools/check-production-commit.mjs`).

If Vercel never picked up the commit: Redeploy that commit, then check that the GitHub repository is the one connected to the project.

## Performance numbers

Acceptance is PageSpeed Insights, mobile, three runs, median, no profile, on a deployment that does not ask for `DEMO_PASSWORD`. With a profile, PSI cannot set `localStorage`: the number is the median of Lighthouse CI (`pnpm lhci:profile`). Brave and a normal browser window are not that measurement. Details: [docs/adr/016-client-data-loading-and-first-load-js.md](docs/adr/016-client-data-loading-and-first-load-js.md).

## Documents

- Spec: [specs/Finance Aggregator Spec.md](specs/Finance%20Aggregator%20Spec.md)
- Decisions: [docs/adr/](docs/adr/)
- Component registry: [docs/component-registry.md](docs/component-registry.md)
- Agent instructions: [AGENTS.md](AGENTS.md)
- Claude Code: [docs/claude-config.md](docs/claude-config.md)
- Cursor: [docs/cursor-config.md](docs/cursor-config.md)
- Acceptance: [docs/acceptance.md](docs/acceptance.md)
- Plans: [docs/plan-e7.md](docs/plan-e7.md), [docs/plan-stage-2.md](docs/plan-stage-2.md)
- Demo script: [docs/demo.md](docs/demo.md)
