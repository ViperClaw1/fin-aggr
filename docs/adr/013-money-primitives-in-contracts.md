# ADR-013: Money and rate parsing/formatting live in `@fa/contracts`

- Status: proposed
- Date: 2026-10-26

## Context
`Cents` (integer) and `Rate` (decimal string) are invariants of the project (spec §3 ADR-003, §4 primitives). The spec places parsing and formatting (`usd`, `formatUsd`, `rateFromPercent`) in `@fa/engine` (§5 `money.ts`), while money inputs and display (`MoneyInput`, `PercentInput`, `RateValue`) sit in `apps/web/src/shared/ui` (§6). `shared` must not import `engine` (`ENGINE_BAN`, §7.2), so:
- `shared/ui` cannot create or display `Cents` and `Rate` without re-implementing parsing and formatting, so rounding and float leaks diverge.
- `shared/ui` would become the place where money semantics live, which is the wrong layer.
- Brand creation (`as Cents`, `as Rate`) would spread across packages.

## Decision
Move to `packages/contracts/src/money/`:
- Brands and schemas: `Cents` (safe integer), `Rate` (decimal string, `0 <= r <= 1`, canonical form, no exponent, no leading `+`).
- Parsing: `parseCents`, `parseRate` (throw typed errors; schema variants return results).
- Formatting: `formatUsd(cents)`, `formatRate(rate, { as: "percent" })`.
- Formatting uses integer and string operations only (`BigInt` or string split). `Intl` may be applied only to an already exact integer-part string. No `number` division, no `toFixed`, no `parseFloat`.
- No `decimal.js` in `contracts`. Arithmetic stays in `@fa/engine`.
- Values that can exceed 100% (multipliers, growth factors) are a separate type, not `Rate`.

`shared/ui` and every other consumer import these functions and never format money themselves.

This partially supersedes ADR-003 (spec §3): the location of parsing, formatting and brand creation moves from `engine/money.ts` to `contracts/src/money/`. Decimal arithmetic and half-up rounding stay as ADR-003 says.

## Alternatives considered
- Keep in `shared/ui`: rejected. Wrong layer, `engine` cannot use it, duplication risk.
- Put in `@fa/engine`: rejected. `web` would need engine for plain display, and engine pulls in `decimal.js`. Contracts is already the shared dependency of all packages.
- Separate `@fa/money` package: rejected for Stage 1. Extra package for a small module. Revisit if it grows.

## Consequences
- One source for parse, format, and rounding of display values. Golden tests live next to it with independent expected values.
- New lint rules: ban `toFixed`, `parseFloat`, and `Number(` on money-typed values everywhere; ban money formatting helpers inside `shared/ui` (they must import from contracts).
- Add canaries for both rules (`/add-lint-canary`).
- The spec's ESLint block that allows `as Cents` / `as Rate` moves from `packages/engine/src/money/**` to `packages/contracts/src/money/**`.
- Component-registry rows keep their names.
- Depends on the zod version decision (zod 4): schemas use the v4 API.
- No code exists yet, so nothing migrates. Spec §5 (`money.ts`) and §7.2 are updated to match.

## Open points
- Exact canonical `Rate` form (trailing zeros allowed or normalized): decide in the golden tests.
- Negative `Cents` (fees, refunds): allowed in `Cents`, forbidden where a domain schema says non-negative.
