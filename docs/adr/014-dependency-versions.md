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

Tailwind 4 sets the browser floor: Safari 16.4+, Chrome 111+. Accepted for the US Stage 1 audience. Tailwind is wired through `turbopack.rules` in `next.config.ts` with `@tailwindcss/turbopack`. If Tailwind or Next change the supported integration, this ADR is revisited.

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
