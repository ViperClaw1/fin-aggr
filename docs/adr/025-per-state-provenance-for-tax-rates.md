# ADR-025: Per-state provenance for tax rates

- Status: accepted (2026-11-23)
- Date: 2026-11-23

## Context
ADR-024 gave all state rates one shared `statesProvenance`. P1.4 checks the states one by one against the state revenue department pages (`packages/ingest/src/tax/state-rates.ts`): 17 states have a 2026 quote now, the progressive states and DC come later. With one shared source the table can only be all `verified` or all `unverified`. Marking it `verified` passes synthetic rates off as checked (invariants 4 and 6). Keeping it `unverified` hides the checked ones.

## Decision
Each entry of `TaxTables.states` gains an optional `provenance: Provenance`, stored in a nullable `state_tax_rates.provenance jsonb` column (and exposed by the public read view). A state's source is its own `provenance`, else `statesProvenance`, else `provenance`. Each state is confirmed apart with `pnpm ingest:confirm tax:state-2026:<XX>`, which prints the URL and quote. The publish step writes only confirmed states, each with its own `verified`, `by: human` provenance; the others keep their synthetic rate and fall back to `statesProvenance`.

## Alternatives considered
- One shared source (ADR-024 as is): checked rates cannot be shown as checked.
- Publish only when all 51 jurisdictions are checked: checked rates stay unpublished for weeks while progressive states wait.
- Required per-state `provenance`: a breaking contract change for every producer; the optional field is additive.

## Consequences
- Contract: additive optional field in `packages/contracts/src/reference.ts`. Fixtures and seed do not change.
- Database: one migration adds the column and updates the read view. The Supabase gateway reads it and leaves the field out when null.
- `ingest`: confirmable fact ids `tax:state-2026:<XX>` and a publish command for confirmed states.
- Engine: no change, it reads only `assumedMarginalRate`.
- The UI does not show tax provenance yet.
- No lint rule or gate changes.
