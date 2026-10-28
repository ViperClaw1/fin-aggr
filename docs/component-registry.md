# Component registry

Search here before creating a component. Add a row for every exported UI component.

| Component | Layer / slice | Purpose | Props (short) | Used by |
|---|---|---|---|---|
| FactValue | shared/ui | Shows a value with its provenance | `fact`, `format` | tables, cards |
| SourceCitation | shared/ui | Source, date, verification status | `provenance` | tables, cards |
| ExplainMath | shared/ui | Expandable calculation steps | `steps`, `assumptions` | result widgets |
| DataTable | shared/ui/data-table | Native table: sort (header button, `aria-sort`, none → asc → desc), hidden columns, row expansion (`aria-expanded`, `aria-controls`, full-width row), sticky header and first column, focusable scroll region; states loading, empty, error. Ties ordered by row id | `caption` (required), `columns: Column<T>[]` (`id`, `header`, `cell`, `compare?`, `align?`), `rows`, `getRowId`, `status`, `error`, `onRetry`, `emptyTitle`, `defaultSort`, `sort` + `onSortChange`, `hiddenColumnIds`, `renderExpanded` + `expandLabel`, `expandedIds` + `onExpandedChange` | comparison widgets. Text comparators use a fixed locale: `a.localeCompare(b, 'en-US')` |
| DemoDataBanner | shared/ui/demo-banner | DEMO DATA notice, not dismissable (AC-5) | none | app/layout |
| Skeleton, EmptyState, ErrorState | shared/ui/states | Loading, empty and error states; retry only for a retryable `GatewayError` | `label`, `className`; `title`, `children`; `error`, `title`, `onRetry` | everywhere |
| MoneyInput, PercentInput | shared/ui/inputs | Text field parsed on blur into `Cents` or `Rate`, error by `MoneyParseError` code | `label`, `hint`, `defaultValue`, `allowNegative` (money), `onValueChange` | features, widgets |
| StateSelect | shared/ui/inputs | Native select of 50 states and DC (`shared/config` `US_STATES`) | `label`, `value` (code or `''`), `onChange` | features, widgets |
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
| profile store | entities/profile | Draft in this browser only, versioned, export/import | `useProfileDraft`, `useCompleteProfile`, `useProfileStatus`, `useProfileHydrated`, `useProfileActions` (edit-profile only), `rehydrateProfile` | features, widgets, app/providers |
| headlineApy | entities/product | Highest tier APY (via `compareRate`) | `headlineApy(product)` | filter-products, sorting |
| product filters | features/filter-products | URL filters (nuqs), pure `filterProducts`, `filterRanked` | `PRODUCT_FILTER_KEYS` (parsers and filters join with the UI in E4) | app |
| citation URL state | features/open-citation | `?doc=&page=&q=`, history push | `CITATION_KEYS` (`useOpenCitation` joins with the viewer in E6) | app |
| query client | shared/lib | Freshness, retry policy, client per request | `getQueryClient`, `makeQueryClient`, `STALE_TIME` | app/providers, entities |
| clock | shared/lib | The only wall clock in apps/web | `now`, `today`, `setClock` | client code |
