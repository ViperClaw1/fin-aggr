---
name: verify
description: Run all quality gates of the FA monorepo in order (format, typecheck, lint, canaries, depcruise, knip, tests, build) and report a pass/fail table. Use before every commit or when asked to check the work.
allowed-tools: Bash(pnpm format:check) Bash(pnpm typecheck) Bash(pnpm lint) Bash(pnpm lint:canaries) Bash(pnpm depcruise) Bash(pnpm knip) Bash(pnpm test) Bash(pnpm build) Bash(pnpm e2e) Bash(git status) Bash(git diff *)
---

# Verify

Run the gates in this order. Stop at the first failure, report it, and fix the cause (never loosen a rule, never skip a gate).

1. `pnpm format:check`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm lint:canaries`
5. `pnpm depcruise`
6. `pnpm knip`
7. `pnpm test`
8. `pnpm build`
9. `pnpm e2e` only if `apps/web/src/app/**`, `apps/web/e2e/**`, or routing changed (check with `git diff --stat`).

## Output

A table: gate, result (pass or fail), one-line reason on failure. Then one line: ready to commit or not.

## Rules

- A failing format gate: run `pnpm exec prettier --write` on the changed files, then rerun the gate.
- A failing canary means a lint rule stopped catching its forbidden pattern. That is a high-severity finding: fix the rule config, not the canary.
- Do not commit from this skill. Committing is a separate step that needs approval.
