---
paths:
  - "apps/web/src/**"
---

# Web rules

- Layers: `app → widgets → features → entities → shared`. Import downward only. Slices of one layer never import each other: lift the shared part down or compose it in a higher layer.
- Inside a slice use relative imports. Between slices use the `@/` alias to the public API (`index.ts`; `entities/*` also expose `queries.ts`).
- `features` receive data as arguments. Only `widgets` and `app` use `entities/*/queries`.
- `getGateway()` only in `entities/*/api`. `fetch` only in `shared/api/http.ts`. `localStorage` only in `entities/profile/model/persist.ts`. Profile writes only in `features/edit-profile`.
- `SponsoredSlot` is mounted only in `app/**`, never inside a table, list, or card of organic results.
- `page.tsx` is thin composition (80 lines max): widgets, metadata, prefetch.
- Server Components by default. `"use client"` only on leaves. Heavy modules (pdf.js, charts) through `next/dynamic`.
- Every shown rate, penalty, limit, or bank metric goes through `FactValue` or sits next to `SourceCitation`. Calculations show `ExplainMath`.
- `DataTable` always gets a `caption`. Semantic elements, keyboard access, no meaning by color alone.
- UI strings are English. No third-party scripts. Any CSP change needs an ADR.
- A new component gets a row in `docs/component-registry.md`.
