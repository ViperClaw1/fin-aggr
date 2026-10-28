# Component registry

Search here before creating a component. Add a row for every exported UI component.

| Component | Layer / slice | Purpose | Props (short) | Used by |
|---|---|---|---|---|
| FactValue | shared/ui | Shows a value with its provenance | `fact`, `format` | tables, cards |
| SourceCitation | shared/ui | Source, date, verification status | `provenance` | tables, cards |
| ExplainMath | shared/ui/explain-math | Engine steps (`<ol>`, formula in `<code>`, inputs in `<dl>`, none when empty) and assumptions; "Edit" names the assumption. Engine texts shown as is | `steps`, `assumptions`, `onEditAssumption?`, `title?`, `headingLevel?` (2–4) | result widgets |
| RateValue | shared/ui/rate-value | Formats a `Rate` or `SignedRate` (minus U+2212); with `explain` a `<details>` panel (absolute, Escape closes and refocuses). Not inside `<p>`: `<details>` is not phrasing content | `rate`, `explain?`, `explainLabel?` | everywhere; a bank's rate goes through FactValue |
| MetricCard | shared/ui/metric-card | Labelled group with value, hint, tone. `warn`/`danger` require `toneLabel` (type), so colour is never the only signal | `label`, `value` (already formatted, never a number), `hint?`, `tone?`, `toneLabel` | widgets |
| FreshnessLabel | shared/ui/freshness | `<time dateTime>`: "Updated today/yesterday/N days ago" on the UTC calendar; future date shows the absolute date; "may be outdated" past `staleAfterDays` | `at`, `now`, `staleAfterDays?` (no default: product rule) | everywhere. On SSG pages render it on the client with `shared/lib/clock`, else "N days ago" freezes at build time |
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
