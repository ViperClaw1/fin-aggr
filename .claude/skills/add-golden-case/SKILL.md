---
name: add-golden-case
description: Add an engine golden test case whose expected values are computed independently of the engine code.
argument-hint: "<engine function> <scenario>"
disable-model-invocation: true
---

# Add golden case

Arguments: `$ARGUMENTS` (engine function and scenario).

Goal: a test whose expected numbers cannot be produced by the code under test.

## Steps

1. Read the function's spec section (spec section 5) and its inputs. Pick a scenario with round, hand-checkable inputs, plus one edge (zero, boundary, rounding at half a cent).
2. Write an independent calculation script `packages/engine/golden/<function>-<scenario>.py` using Python `decimal` with `ROUND_HALF_UP`. It must not import or copy anything from the engine. It prints the expected values as integers in cents and rate strings.
3. Run it with `python3` and record the output.
4. Add the case in `packages/engine/src/<module>/<function>.golden.test.ts` with the constants and the comment `// independent calc: packages/engine/golden/<file>`.
5. Run `pnpm test` for the engine package. If the engine disagrees with the script, do not change the expected values to match. Find which side is wrong by re-deriving by hand, and report the discrepancy.

Never take an expected value from engine output. If a rate, tax rule, or limit is not in the spec, mark it `unverified` and ask.
