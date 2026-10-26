# ADR-014: Pinned dependency versions for Stage 1

- Status: accepted
- Date: 2026-10-26

## Context
Spec §8 (risks, open question 8) requires pinning Node, Next, React, zod and tooling at M1. zod 4 and Tailwind 4 are agreed. Versions were checked with `pnpm view` on 2026-10-26, including peer ranges.

## Decision
Exact versions (no `^`/`~`):

| Group | Packages |
| --- | --- |
| Framework | next 16.4.3, react 19.3.1, react-dom 19.3.1, tailwindcss 4.3.3 |
| Data and calc | zod 4.6.7, decimal.js 10.6.0, @tanstack/react-query 5.105.0, @tanstack/react-table 9.3.1, zustand 5.0.16, nuqs 2.10.2 |
| Forms | react-hook-form 7.91.0, @hookform/resolvers 6.0.0 |
| Language | typescript 6.0.3 |
| Lint | eslint 9.39.5, @eslint/js 9.39.5, typescript-eslint 8.72.0, eslint-plugin-import-x 4.17.1, eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-react 7.37.5, eslint-plugin-react-hooks 7.1.1, @next/eslint-plugin-next 16.4.3, @vitest/eslint-plugin 1.6.28, eslint-config-prettier 10.1.8, prettier 3.9.10 |
| Graph | dependency-cruiser 18.7.0, knip 6.43.0 |
| Tests | vitest 5.0.5, @vitest/coverage-v8 5.0.5, fast-check 4.10.2, @playwright/test 1.64.1, @axe-core/playwright 4.14.0 |
| Hooks | lint-staged 17.6.0, husky 9.1.7 |

Tailwind 4 sets the browser floor: Safari 16.4+, Chrome 111+. Accepted for the US Stage 1 audience.

## Alternatives considered
- typescript 7.x: rejected. typescript-eslint 8.72 peers `typescript <6.1.0`.
- eslint 10.x: rejected. eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 peer `eslint <=9`.
- `eslint-config-next/core-web-vitals`: rejected. It pulls `eslint-plugin-import`, we use `import-x`; `@next/eslint-plugin-next` is used directly (spec §7.2).
- zod 3: rejected, no code yet, v4 is current.

## Consequences
- Upgrades go in separate PRs, each re-running all gates and canaries.
- Revisit TS 7 and ESLint 10 when typescript-eslint and the React/a11y plugins widen their peer ranges.
- Release dates were not checked against the two-week rule; if a pinned version turns out to be fresher, drop to the previous patch.
