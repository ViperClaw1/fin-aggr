# Component registry

Search here before creating a component. Add a row for every exported UI component.

| Component | Layer / slice | Purpose | Props (short) | Used by |
|---|---|---|---|---|
| FactValue | entities/fact | `render(value)` with its SourceCitation; the `Fact<T>` type makes a value without a source impossible. Wrapper has `data-citation` (AC-3) | `fact`, `render`, `onOpenCitation?`, `now?` | features, widgets, app |
| SourceCitation | entities/fact | Domain and page, verification in words, "Demo data", freshness; with a document and `onOpen` a button (`{ documentId, page, quote }`), else a link (`target="_blank"`, `rel="noopener noreferrer"`); quote in a Disclosure | `provenance`, `variant?` (`chip`, `inline`), `onOpen?`, `now?` | features, widgets, app |
| SafetyBadge | entities/institution | Institution kind with icon and words; explanation in a Disclosure. Texts in `model/safety-texts.ts` are a DRAFT pending legal approval; no insurance claims | `kind`, `partners?` (fintech, resolved by the caller) | features, widgets, app |
| CompatibilityBadge | entities/rule | Eligibility with icon and headline; reasons from the trace via `explainEligibility` (rule label, or a sentence with formatted values) | `result: EligibilityResult`, `compact?` (reasons in a Disclosure) | features, widgets, app |
| Disclosure | shared/ui/disclosure | `<details>` toggle with a panel: Escape closes and refocuses; absolute from `sm`, in the flow on phones. Not inside `<p>` | `summary`, `label` (screen readers), `children` | RateValue, SourceCitation, badges |
| ExplainMath | shared/ui/explain-math | Engine steps (`<ol>`, formula in `<code>`, inputs in `<dl>`, none when empty) and assumptions; "Edit" names the assumption. Engine texts shown as is. Section has `data-assumption` (AC-3) | `steps`, `assumptions`, `onEditAssumption?`, `title?`, `headingLevel?` (2–4) | result widgets |
| RateValue | shared/ui/rate-value | Formats a `Rate` or `SignedRate` (minus U+2212); with `explain` a Disclosure. Not inside `<p>`: `<details>` is not phrasing content | `rate`, `explain?`, `explainLabel?` | everywhere; a bank's rate goes through FactValue |
| MetricCard | shared/ui/metric-card | Labelled group with value, hint, tone. `warn`/`danger` require `toneLabel` (type), so colour is never the only signal | `label`, `value` (already formatted, never a number), `hint?`, `tone?`, `toneLabel` | widgets |
| FreshnessLabel | shared/ui/freshness | `<time dateTime>`: "Updated today/yesterday/N days ago" on the UTC calendar; future date shows the absolute date; "may be outdated" past `staleAfterDays` | `at`, `now`, `staleAfterDays?` (no default: product rule) | everywhere. On SSG pages render it on the client with `shared/lib/clock`, else "N days ago" freezes at build time |
| BulletChart | shared/ui/charts | Server-rendered SVG bar (aria-hidden) with a marker line and bands; visible text carries value, marker and ranges; past `max` the bar stops at the edge and `overflowText` is shown. Numbers for geometry only in `scale.ts` (ADR-013, lint rule) | `label`, `kind` (`usd` with Cents or `rate` with Rate, checked by the compiler), `max` (> 0), `value`, `marker?`, `bands?`, `overflowText?` | widgets (coverage-planner, bank-health) |
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
| eligibility explanation | entities/rule | Trace → `{ status, headline, reasons }`; values formatted by field (cents as dollars, codes as words from `@fa/contracts` labels) | internal (`model/explain-eligibility.ts`), used by CompatibilityBadge | entities/rule |
| fact queries | entities/fact | Facts, the source registry, the data set date; `freshnessNow(datasetInfo)` gives `now` for freshness labels (data set `asOf` for mock data, the clock otherwise) | `factsQuery`, `sourcesQuery`, `datasetInfoQuery`, `freshnessNow` | widgets, app |
| CompareTable | widgets/compare-table | MINIMAL (ADR-016 D1): DataTable of a category with bank, product, term, top APY (FactValue), minimum to open; data loaded at build (`loadCompareData`, `'use cache'`) and passed as props, so the table is in the static HTML and the client never queries; URL filters applied in memory after hydration. Filter form, profile ranking, row summary: E5 | `category`, `products`, `institutions`, `dataset` (from `loadCompareData(category)`) | app/compare |
| product filters | features/filter-products | URL filter state (nuqs) and in-memory filtering | `useProductFilters`, `filterProducts`, `PRODUCT_FILTER_KEYS` | widgets |
| document queries | entities/document | Document metadata | `documentQuery` | widgets, app |
| reference queries | entities/reference | Tax tables, insurance rules | `taxTablesQuery`, `insuranceRulesQuery` | widgets, app |
| sponsored queries | entities/sponsored | Ads per placement (ADR-006) | `sponsoredQuery` | widgets/sponsored-slot |
| profile store | entities/profile | Draft in this browser only, versioned, export/import | `useProfileDraft`, `useCompleteProfile`, `useProfileStatus`, `useProfileHydrated`, `useProfileActions` (edit-profile only), `rehydrateProfile` | features, widgets, app/providers |
| headlineApy | entities/product | Highest tier APY (via `compareRate`) | `headlineApy(product)` | filter-products, sorting |
| product filters | features/filter-products | URL filters (nuqs), pure `filterProducts`, `filterRanked` | `PRODUCT_FILTER_KEYS` (parsers and filters join with the UI in E4) | app |
| citation URL state | features/open-citation | `?doc=&page=&q=`, history push | `CITATION_KEYS` (`useOpenCitation` joins with the viewer in E6) | app |
| query client | shared/lib | Freshness, retry policy, client per request | `getQueryClient`, `makeQueryClient`, `STALE_TIME` | app/providers, entities |
| clock | shared/lib | The only wall clock in apps/web | `now`, `today`, `setClock` | client code |
