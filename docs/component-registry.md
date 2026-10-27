# Component registry

Search here before creating a component. Add a row for every exported UI component.

| Component | Layer / slice | Purpose | Props (short) | Used by |
|---|---|---|---|---|
| FactValue | shared/ui | Shows a value with its provenance | `fact`, `format` | tables, cards |
| SourceCitation | shared/ui | Source, date, verification status | `provenance` | tables, cards |
| ExplainMath | shared/ui | Expandable calculation steps | `steps`, `assumptions` | result widgets |
| DataTable | shared/ui | Accessible table with caption | `caption`, `columns`, `rows` | comparison widgets |
| SponsoredSlot | app | Labeled ad slot (app layer only) | `slotId` | pages |

## Modules (slices without UI yet)

Every slice gets a row here when it is created (spec §2, slice rule 4).

| Module | Layer / slice | Purpose | Public API | Used by |
|---|---|---|---|---|
| institution queries | entities/institution | Institutions and bank metrics | `institutionsQuery`, `institutionQuery`, `bankMetricsQuery` | widgets, app |
| product queries | entities/product | Products by category, one product | `productsQuery`, `productQuery` | widgets, app |
| fact queries | entities/fact | Facts and the source registry | `factsQuery`, `sourcesQuery` | widgets, app |
| document queries | entities/document | Document metadata | `documentQuery` | widgets, app |
| reference queries | entities/reference | Tax tables, insurance rules | `taxTablesQuery`, `insuranceRulesQuery` | widgets, app |
| sponsored queries | entities/sponsored | Ads per placement (ADR-006) | `sponsoredQuery` | widgets/sponsored-slot |
| query client | shared/lib | Freshness, retry policy, client per request | `getQueryClient`, `makeQueryClient`, `STALE_TIME` | app/providers, entities |
| clock | shared/lib | The only wall clock in apps/web | `now`, `today`, `setClock` | client code |
