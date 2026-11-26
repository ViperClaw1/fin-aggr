# ADR-027: The onboarding model is Claude through the Anthropic SDK

- Status: accepted
- Date: 2026-11-26 (accepted by the owner 2026-11-26)
- Relates to: ADR-026 (bank onboarding factory, plan 8.6), ADR-014 (versions), ADR-020 (review queue), ADR-004 (profile stays in the browser)

## Context
ADR-026 lets a language model propose a bank's adapter config and its products at onboarding, and again when an adapter breaks. It leaves the provider and the SDK to a follow-up ADR under ADR-014's version rule.

## Decision
- Provider: Anthropic. Package `@anthropic-ai/sdk` 1.8.0, exact pin, in `packages/ingest` only. The site (`apps/web`) never imports it.
- Model: `claude-opus-5-5`, owner's choice 2026-11-26. The model id and a prompt version are written on every proposal row.
- One request per snapshot. The answer is structured output against a JSON schema: an `html_table` config (`scrape/banks/config.ts`) and the products the model reads, each value with a verbatim quote from the snapshot.
- The proposal is checked before it reaches a person: the config runs over the same snapshot and must reproduce the model's products, and every quote must be a substring of the snapshot text. A failed proposal is still queued, with the failed check as the reason.
- Input is the public page already fetched through `createScrapeSession` and stored in `raw`. No profile data exists in ingest (ADR-004).
- Key: `ANTHROPIC_API_KEY`, a GitHub Actions secret and a local `.env` value. Banned in `apps/web/**` like the database keys.
- The nightly rate run makes no model call (ADR-026).

## Alternatives considered
- Raw HTTP to the Messages API: the SDK is the supported client; hand-written requests would re-implement retries and typed errors.
- A cheaper model (Sonnet 5.5, Haiku 5.5): the owner chose Opus 5.5; a call is made once per bank, not per night.
- Another provider: not requested.

## Consequences
- ADR-014 table gains `@anthropic-ai/sdk` 1.8.0.
- Cost is per onboarding and per breakage, not per night. It is recorded from `usage` on each proposal row.
- A new depcruise or ESLint rule that confines the SDK to `packages/ingest` needs its own owner consent; until then the boundary is this ADR and review.
