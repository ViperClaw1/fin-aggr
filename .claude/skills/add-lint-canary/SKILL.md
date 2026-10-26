---
name: add-lint-canary
description: Add a canary file proving a lint or dependency-cruiser rule still fails on its forbidden pattern.
argument-hint: "<rule name>"
disable-model-invocation: true
---

# Add lint canary

Arguments: `$ARGUMENTS` (ESLint rule or dependency-cruiser rule name).

A canary is a file that deliberately violates one rule. `pnpm lint:canaries` expects each canary to fail with exactly that rule. If a canary passes, the rule is broken.

## Steps

1. Find the rule's config and what it forbids.
2. Create `*.canary.ts` (or `.canary.tsx`) in a location where the rule applies, with the smallest violating code and a header comment naming the rule.
3. Register the expected rule id in the canary runner config (see `scripts/lint-canaries`).
4. Run `pnpm lint:canaries`. It must pass, meaning the canary fails as expected with the right rule id.
5. Confirm the normal `pnpm lint` ignores canary paths and still passes.

Never weaken the rule to make the canary pass.
