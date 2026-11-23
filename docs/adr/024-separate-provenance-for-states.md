# ADR-024: Separate provenance for states

- Status: accepted (2026-11-23)
- Date: 2026-11-23

## Context
`TaxTables` has one `provenance` for the federal brackets and the state rates together. The 2026 federal brackets (Rev. Proc. 2025-32) have two checks: Form 1040-ES and the owner's `tax:federal-2026` confirmation (ADR-020). The state rates are still synthetic until P1.4. One source cannot honestly say "federal verified, states mock": marking the whole table `verified` passes synthetic state rates off as checked (invariants 4 and 6), and dropping the states makes the engine throw `no tax rate for <state>` for every profile.

## Decision
`TaxTables` gains an optional `statesProvenance: Provenance`, stored in a nullable `tax_tables.states_provenance` column. Absent or null means the states share `provenance`. `pnpm ingest:publish-tax` writes the verified 2026 federal brackets onto the current `reference` version and moves the old synthetic source to `states_provenance`.

## Alternatives considered
- State rates first (P1.4), then one write under one source: about a week of work while checked federal brackets stay unpublished.
- Write the federal brackets and leave the whole table `unverified` / `isMock: true`: honest, but the user cannot tell the federal part is real.
- Required `statesProvenance`: a breaking contract change for every producer; the optional field is additive.

## Consequences
- Contract: additive optional field in `packages/contracts/src/reference.ts`. Fixtures and seed do not change.
- Database: migration `20261123090000_tax_states_provenance`. The Supabase gateway reads the column.
- When P1.4 publishes checked state rates, it sets `states_provenance` (or clears it when one source covers both).
- The UI does not show tax provenance yet; showing the state source apart from the federal one is a later step.
- No lint rule or gate changes.
