# Claude Code config for FA (Stage 1)

## Apply
1. Copy `.claude/`, `CLAUDE.md`, and `docs/` into the repo root (merge `docs/`).
2. Append `gitignore.additions` to `.gitignore`.
3. Install `jq` (the formatting hook uses it).
4. Commit `.claude/settings.json`, `.claude/rules/`, `.claude/skills/`, `CLAUDE.md`. Do NOT commit `settings.local.json`.
5. Put the Stage-1 spec at `docs/spec-stage1.md` (CLAUDE.md points to it).
6. Run `/doctor` and `/skill-doctor` once to check the config.

## Files
| File | Purpose |
|---|---|
| `.claude/settings.json` | Shared: permissions (pnpm gates allowed; installs, commits, network ask; push, reset --hard, rm -rf, .env reads denied), env (mock mode, seed), prettier hook after Edit/Write |
| `.claude/settings.local.json` | Personal, gitignored: `pnpm dev`, mock failure rate. Edit freely |
| `.claude/scheduled_tasks.lock` | Not authored. Created by the `/loop` scheduler as a lease lock. Gitignore only. `CLAUDE_CODE_DISABLE_CRON=1` turns the scheduler off |
| `CLAUDE.md` | Always-loaded rules: commands, language, 6 invariants, architecture summary, workflow |
| `.claude/rules/*.md` | Path-scoped rules, loaded only when matching files are touched |
| `.claude/skills/*` | Project workflows (below) |

## Project skills and why
| Skill | Why |
|---|---|
| `verify` | One command runs all gates in order; model-invocable so it runs before commits |
| `new-slice` | Stops FSD layer and public-API mistakes at creation time |
| `add-golden-case` | Enforces independently computed expected values (Python `decimal`) |
| `add-adr` | Makes boundary and dependency changes leave a record |
| `add-lint-canary` | Keeps lint rules honest: a canary must fail on its forbidden pattern |
| `add-product-category` | Repeatable end-to-end path: contract, fixtures, engine, slice, table, route |

User-invoked skills use `disable-model-invocation: true`.

## Bundled and official skills worth using (no files needed)
- `/run-skill-generator`: once, to record how to launch the app (mock env).
- `/code-review`, `/simplify`: after a feature, before a PR.
- `/doctor` (prompt audit), `/skill-doctor`: after config changes.
- `/security-review`: before the privacy and CSP milestone.
- `/loop`: recurring checks. This is what creates the lock file.
- `/claude-api`: only from Stage 2 if LLM features arrive.
- skill-creator plugin: evals for the project skills.
- `pdf` and `xlsx` (claude.ai skills): synthetic PDF fixtures and independent golden-case spreadsheets.

## Unverified / caveats
- Not executed in a live Claude Code session. Run `/doctor` after copying.
- Exact matching of `Bash(x *)` against the bare command `x`: both forms are listed to be safe.
- `defaultMode: acceptEdits` and skill `allowed-tools` as a space-separated string depend on your Claude Code version.
- Settings must be strict JSON (no comments).
- Script names (`lint:canaries`, `depcruise`, `knip`, `e2e`) must match the root `package.json` from spec section 7.5.
