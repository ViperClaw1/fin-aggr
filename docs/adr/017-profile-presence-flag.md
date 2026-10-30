# ADR-017: A presence-only flag for a saved profile

- Status: accepted
- Date: 2026-10-30

## Context

A returning visitor always has a profile in `localStorage` (`fa.profile`, ADR-004). The compare table is prerendered in APY order without the net columns. After hydration the columns appear and 60 rows reorder. That layout shift measured CLS 0.128 on mobile Lighthouse (above the Core Web Vitals limit of 0.1).

The profile values must stay in the browser: no request, log, or gateway parameter may carry them. CSP allows `'unsafe-inline'` scripts (ADR-015) because static pages have no nonce.

## Decision

One blocking inline script in the root layout may call `localStorage.getItem('fa.profile')` and, when the key is present, set `data-has-profile` on `<html>`. It does not read the value, write storage, or send the network. While the attribute is set, the compare catalog is covered by a placeholder stretched to the same height; the table stays in the grid so the slot does not jump. A layout effect removes the attribute when the row order is final. The same script removes it after 3 seconds anyway, so a failed or blocked hydration cannot leave the catalog hidden. That cap is also the bound on how long a returning visitor's largest paint can wait on the covered table: the placeholder is painted at the table's height immediately. Net interest, Net yield, and Fit stay in the markup with a placeholder when there is no complete profile.

Every other use of `localStorage` stays in `entities/profile/model/persist.ts`.

## Alternatives considered

- Reorder rows with a `transform` animation so the shift is not counted as CLS. Harder to keep accessible and easy to get wrong when filters change.
- Read the profile on the server. Breaks ADR-004.

## Consequences

`no-restricted-globals` still bans `localStorage` in application modules. The exception is the script string in the root layout, which is not an identifier. Spec §3, `AGENTS.md`, and `.claude/rules/web.md` name this script as the only other reader.
