# ADR-013: Money and rate parsing/formatting live in `@fa/contracts`

- Status: accepted
- Date: 2026-10-26

## Context
`Cents` (integer) and `Rate` (decimal string) are invariants of the project (spec §3 ADR-003, §4 primitives). The spec places parsing and formatting (`usd`, `formatUsd`, `rateFromPercent`) in `@fa/engine` (§5 `money.ts`), while money inputs and display (`MoneyInput`, `PercentInput`, `RateValue`) sit in `apps/web/src/shared/ui` (§6). `shared` must not import `engine` (`ENGINE_BAN`, §7.2), so:
- `shared/ui` cannot create or display `Cents` and `Rate` without re-implementing parsing and formatting, so rounding and float leaks diverge.
- `shared/ui` would become the place where money semantics live, which is the wrong layer.
- Brand creation (`as Cents`, `as Rate`) would spread across packages.

## Decision
Move to `packages/contracts/src/money/`:
- Brands and schemas: `Cents` (safe integer), `Rate` (decimal string, `0 <= r <= 1`, canonical form, no exponent, no leading `+`).
- Parsing: `parseCents`, `parseRate(fraction)` (`"0.0435"`), `rateFromPercent(percent)` (`"4.35"` -> `"0.0435"`, decimal point shifted on the string). They throw `MoneyParseError` with a `code`; forms use the schemas' `safeParse`. `engine` throws `EngineError` when a `Rate` is out of bounds.
- Formatting: `formatUsd(cents)` (`"$1,234.56"`, `"-$0.05"`), `formatRate(rate)` (`"0.0435"` → `"4.35%"`). Percent is the only display form; an options argument is added when a second form is needed.
- `parseCents` accepts an optional `-` and `$`. Decimals past the second must be zeros (`"1.500"` → 150); any other third decimal is `too_many_decimals`, never rounded.
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
- New lint rules, path-based (no type-aware rule): in `packages/contracts/src/money/**` and `packages/engine/**` ban `Number(`, `parseInt`, `parseFloat`, `.toFixed` (and `.toNumber()` in engine); `Number.isSafeInteger` stays allowed. In `apps/web` ban `Intl.NumberFormat` and `toLocaleString` (money is formatted only by `@fa/contracts`).
- One canary per rule (`/add-lint-canary`).
- The spec's ESLint block that allows `as Cents` / `as Rate` moves from `packages/engine/src/money/**` to `packages/contracts/src/money/**`.
- Component-registry rows keep their names.
- Depends on the zod version decision (zod 4): schemas use the v4 API.
- No code exists yet, so nothing migrates. Spec §5 (`money.ts`) and §7.2 are updated to match.

## Amendment (E2, 2026-10-27): `SignedRate` and `centsFromInteger`
The engine's lint rules ban `Number(`, `.toFixed` and `.toNumber()`, and `as Cents` / `as Rate` are allowed only in `contracts/src/money/**`. The engine therefore cannot turn a Decimal into `Cents` or a signed rate by itself. Two additive exports in `contracts/src/money/`:
- `centsFromInteger(digits)`: an integer string (`"-150"`) → `Cents`, exact via the same digit loop as `parseCents`; `"-0"` → 0, outside the safe range `out_of_range`. The engine rounds half-up in Decimal and passes `toString()` of the integer.
- `SignedRate`: a signed decimal fraction string without bounds, up to 8 decimals, no `"-0"`, for results such as `netSimpleAnnualYield`. Spec §5 used to declare it in `engine`, but a schema needs zod, and `engine` does not depend on zod.

## Open points
- Canonical `Rate` form, resolved 2026-10-26: the schema accepts trailing zeros (`"0.0400"`); `rateFromPercent` returns the form without them (`"0.0435"`, `"0.04"`, `"1"`); `engine` compares rates through Decimal, never as strings.
- Negative `Cents` (fees, refunds): allowed in `Cents`, forbidden where a domain schema says non-negative.
