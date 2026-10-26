---
name: add-product-category
description: Add a new financial product category end to end (contract schema, fixtures, gateway method, entity slice, comparison table) following the Stage-1 pattern.
argument-hint: "<category name>"
disable-model-invocation: true
---

# Add product category

Arguments: `$ARGUMENTS` (category, e.g. cds, hysa, credit-cards). Stage-1 P0 categories only unless the user confirms otherwise.

## Steps

1. Confirm scope against the spec. If the category is outside Stage 1, stop and ask.
2. Contract (`packages/contracts`): add the product schema and query schema (`.strict()`, no profile fields, no commercial keys), extend `DataGateway`. Additive change only.
3. Fixtures (`packages/fixtures`): deterministic seed data, `isMock: true` provenance on every fact, a contract test parsing each fixture.
4. Engine: add or reuse calculation functions with `/add-golden-case`. Never invent rates or rules; mark `unverified` and ask.
5. Web: `/new-slice entities <category>`, then a `widgets` table with `DataTable`, `FactValue`, `SourceCitation`, and `ExplainMath`.
6. Route: a thin `page.tsx` in `app/`.
7. Add or update an e2e path and an axe check for the route.
8. Run `/verify`.

Ask before adding any dependency or changing a layer boundary.
