# ADR-014: Pinned dependency versions for Stage 1

- Status: accepted
- Date: 2026-10-26

## Context
Spec §8 (risks, open question 8) requires pinning Node, Next, React, zod and tooling at M1. zod 4 and Tailwind 4 are agreed. Versions were checked with `pnpm view` on 2026-10-26, including peer ranges.

## Decision
Exact versions (no `^`/`~`):

| Group | Packages |
| --- | --- |
| Framework | next 16.4.3, react 19.3.1, react-dom 19.3.1, tailwindcss 4.3.3, @tailwindcss/turbopack 4.3.3 |
| Data and calc | zod 4.6.7, decimal.js 10.6.0, @tanstack/react-query 5.105.0, @tanstack/react-table 9.3.1, zustand 5.0.16, nuqs 2.10.2 |
| Forms | react-hook-form 7.91.0, @hookform/resolvers 6.0.0 |
| Language | typescript 6.0.3 |
| Type packages | @types/node 24.19.2 (matches `engines.node >=24`), @types/react 19.3.0, @types/react-dom 19.3.0 |
| Lint | eslint 9.39.5, @eslint/js 9.39.5, typescript-eslint 8.72.0, eslint-plugin-import-x 4.17.1, eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-react 7.37.5, eslint-plugin-react-hooks 7.1.1, @next/eslint-plugin-next 16.4.3, @vitest/eslint-plugin 1.6.28, eslint-config-prettier 10.1.8, prettier 3.9.10 |
| Graph | dependency-cruiser 18.7.0, knip 6.43.0 |
| Tests | vitest 5.0.5, @vitest/coverage-v8 5.0.5, @playwright/test 1.64.1, @axe-core/playwright 4.14.0 |
| Hooks | lint-staged 17.6.0, husky 9.1.7 |

Deferred (pinned when first used, in the ADR or PR that adds them):
- fast-check 4.10.2: property tests start with the engine in E2, so it is not installed in E0.
- Packages for later milestones (decimal.js, zod, TanStack, zustand, nuqs, react-hook-form, resolvers) are pinned here but installed only in the milestone that first imports them. knip reports an unused dependency otherwise.

Tailwind 4 sets the browser floor: Safari 16.4+, Chrome 111+. Accepted for the US Stage 1 audience. E7 step 2.5 pins that floor in `apps/web/package.json` `browserslist` as `chrome 111`, `edge 111`, `firefox 111`, `safari 16.4` — the same four versions Next 16.4 compiles for when the field is absent. Firefox and Edge stay at 111 so a Chrome-and-Safari-only list does not fall back to older browsers.

E7 step 2.6 turns on `experimental.inlineCss`. Next 16.4 documents it as experimental and production-only: imported CSS is a `<style>` tag instead of a render-blocking stylesheet. Dev is unchanged. Inlined CSS is not cached apart from the HTML, and the first load duplicates it into the RSC payload. Tailwind's used-class output is small enough that the first visit gains FCP. Geist Mono stays on the page with `preload: false`, so its file is not fetched ahead of first paint. Tailwind is wired through `turbopack.rules` in `next.config.ts` with `@tailwindcss/turbopack`. If Tailwind or Next change the supported integration, this ADR is revisited.

## Amendment (E7, 2026-11-01): `@lhci/cli` installed

Accepted with the E7 plan. Exact version, no `^`/`~`. Root devDependency. Used by `pnpm lhci` and `pnpm lhci:profile` (GitHub Actions, report only until the Performance gate is turned on). Not imported by application code.

| Package | Version | Where |
| --- | --- | --- |
| @lhci/cli | 0.15.1 | root devDependency |
| puppeteer | 25.14.0 | root devDependency |

`@lhci/cli` does not depend on `puppeteer`. When a puppeteer script is set, LHCI loads the package with `require('puppeteer')`, so it has to be installed beside the CLI. `tools/lhci-prepare.mjs` imports it and writes that Chrome's path into the run config, so both scenarios measure the same browser. `puppeteer` 25.15.0 and 25.16.0 were newer than two weeks on 2026-11-01; 25.14.0 was published 2026-10-14.

Checked with `pnpm view` on 2026-11-01. `@lhci/cli` 0.15.1 was published 2025-06-25.

## Amendment (E7, 2026-11-04): lighthouse trace patch

`patches/lighthouse@12.6.1.patch`, recorded in `pnpm-workspace.yaml` `patchedDependencies`. Chrome 155 on Windows omits `navigationStart` from the Lighthouse trace, so `pnpm lhci` stops with `NO_NAVSTART`. The patch keeps a real main-frame navigation whose URL is empty, and when `navigationStart` is absent it uses the first main-frame `ResourceSendRequest`, any `ResourceSendRequest`, then `FrameCommittedInBrowser`. A trace that still has `navigationStart` keeps that origin. `@lhci/cli` stays 0.15.1.

`@lhci/cli` 0.16.0 (published 2026-11-02) depends on `lighthouse` 13.6.0, the same major PSI used on 2026-11-04. Checked `core/lib/tracehouse/trace-processor.js` at tag `v13.6.0` (the tag `v.13.6.0` does not exist). `_isNavigationStartOfInterest` still returns false when `documentLoaderURL` is `""`, and `computeTimeOrigin` method `auto` still throws when neither the timespan marker nor `navigationStart` is present. There is no `ResourceSendRequest` fallback. Moving to 0.16.0 would not remove the patch, and the release is newer than two weeks, so 0.15.1 stays. Accepted 2026-11-04: the patch stays. A local Windows run that needed the patch is not comparable with earlier runs. The baseline is a CI run.

## Amendment (Stage 2, 2026-11-04): accepted, installed at step 1

Accepted with [ADR-019](019-supabase-dataset.md) and [ADR-020](020-ingest-pipeline.md). Exact versions, no `^`/`~`. Checked with `npm view` on 2026-11-04, and again on 2026-11-05 before install. A release newer than two weeks is not pinned. On 2026-11-05 the pins below were unchanged: `@supabase/supabase-js` 2.119.0 (2026-11-04), `supabase` 2.122.0 (2026-10-23) and 3.0.0 (2026-11-02) are still inside two weeks. `pg` 8.23.1, `@types/pg` 8.23.1, `robots-parser` 3.0.1 and `cheerio` 1.2.0 are still the current releases that clear the rule.

Installed on 2026-11-05: `@supabase/supabase-js` in `@fa/ingest`, `supabase` CLI as a root devDependency. `robots-parser` and `cheerio` wait for step 8, when something imports them.

Installed on 2026-11-06 with step 2: `pg` 8.23.1 and `@types/pg` 8.23.1 as root dependencies. The seed and rollback scripts are the only importers.

| Package | Version | Published | Where |
| --- | --- | --- | --- |
| @supabase/supabase-js | 2.118.0 | 2026-10-15 | `apps/web` server gateway, `packages/ingest`, `supabase/scripts` |
| supabase | 2.121.0 | 2026-10-14 | root devDependency (CLI: `supabase start`, migrations) |
| pg | 8.23.1 | 2026-09-30 | `packages/ingest` and seed scripts; one transaction per domain publish |
| @types/pg | 8.23.1 | 2026-10-04 | root devDependency. `pg@8.23.1` does not set `types` |
| robots-parser | 3.0.1 | 2023-02-21 | `packages/ingest`, step 8. Latest release; ships its own types |
| cheerio | 1.2.0 | 2026-01-23 | `packages/ingest`, step 8, and only if static HTML is enough |

Not pinned:
- `@supabase/supabase-js` 2.119.0 and `supabase` 3.0.0 were published 2026-11-04. `supabase` 2.122.1 was published 2026-11-02.
- `postgres` 4.0.0 was published 2026-10-29. The previous line is 3.4.9 (2026-04-05). One driver is enough: `pg`, whose current release already clears two weeks.
- A ZIP package. NCUA archives go through `node:zlib` first. A package is pinned in this ADR only if that is not enough.
- Playwright and pdf.js stay on the versions already accepted above.

## Amendment (E6, ADR-018, 2026-10-30): installed

Accepted with ADR-018. Exact versions, no `^`/`~`. `pdfkit` is imported by `tools/build-docs.mjs`. `pdfjs-dist` is imported by the fixture PDF test; the viewer imports it in step 2.

| Package | Version | Where |
| --- | --- | --- |
| pdfjs-dist | 6.4.299 | dependency of `@fa/web` |
| pdfkit | 0.20.2 | root devDependency, `tools/build-docs.mjs` only |

Checked with `pnpm view` on 2026-10-30. `pdf-lib` 1.17.1 was rejected (last release 2022).

## Amendment (E4, 2026-10-28): `@tanstack/react-table` removed
`@tanstack/react-table` is removed: +11.5 KB gzip to the First Load JS of the home page for three simple capabilities (sorting, column hiding, row expansion), with about 10 KB left before the AC-8 budget (home First Load JS 190.3 KB gzip per `route-bundle-stats.json`). `DataTable` is our own component over a native `<table>`. Bring the library back through a new ADR if column filters, grouping or virtualization are needed.

## Import cycles
Cycles are detected by dependency-cruiser only (`no-circular`, severity error, covered by the canary `shared/canary/cycle-a|b.canary.ts`). The ESLint rule `import-x/no-cycle` is not used:
- without `eslint-import-resolver-typescript` it cannot resolve the `@/` alias or `@fa/*` workspace packages, so it misses most real cycles;
- adding the resolver means one more dependency for a check that dependency-cruiser already does with the project's `tsconfig`.

## Alternatives considered
- typescript 7.x: rejected. typescript-eslint 8.72 peers `typescript <6.1.0`.
- eslint 10.x: rejected. eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 peer `eslint <=9`.
- `eslint-config-next/core-web-vitals`: rejected. It pulls `eslint-plugin-import`, we use `import-x`; `@next/eslint-plugin-next` is used directly (spec §7.2).
- zod 3: rejected, no code yet, v4 is current.
- `eslint-import-resolver-typescript` for `import-x/no-cycle`: rejected, see Import cycles.

## Consequences
- Upgrades go in separate PRs, each re-running all gates and canaries.
- Revisit TS 7 and ESLint 10 when typescript-eslint and the React/a11y plugins widen their peer ranges.
- Release dates were not checked against the two-week rule; if a pinned version turns out to be fresher, drop to the previous patch.
- Remove `import-x/no-cycle` from `eslint.config.mjs` in the same PR that accepts this change. The depcruise canary is the only cycle canary.
