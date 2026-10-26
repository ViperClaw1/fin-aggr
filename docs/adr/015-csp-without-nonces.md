# ADR-015: Content Security Policy without nonces in Stage 1

- Status: proposed
- Date: 2026-10-26
- Relates to: ADR-004 (profile stays local), ADR-008 (rendering), ADR-014 (versions)

## Context
- AC-4 and the privacy invariant need a CSP with `connect-src 'self'` (spec §1 AC-4, §3 ADR-004, E0 deliverable "CSP and headers").
- Next.js inlines bootstrap and RSC payload scripts. A strict `script-src` without `'unsafe-inline'` needs either nonces or hashes.
- Per the Next.js CSP guide (lastUpdated 2026-03-20): nonces require dynamic rendering; static pages are built without request headers, so no nonce can be injected; Partial Prerendering is incompatible with nonce-based CSP. ISR and CDN caching are lost.
- ADR-008 chooses SSG/ISR for the catalog and static content pages. `apps/web/next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`.
- Stage 1 has no third-party scripts and no analytics (spec: open question 6, default no). There is no user-generated HTML, and `react/no-danger` is an ESLint error.

## Decision
Stage 1 sends a static CSP header from `headers()` in `next.config.ts`, no nonces, no `proxy.ts`:

```
default-src 'self';
script-src 'self' 'unsafe-inline';          (+ 'unsafe-eval' in development only)
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

- `connect-src 'self'` is the control that enforces AC-4: nothing the page runs can send data to another origin. Any new origin needs an ADR and a spec change.
- Other headers set together: `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` with camera, microphone and geolocation disabled.
- The header value lives in one module (`apps/web/security-headers.ts`) so tests and config share it.

## Verification
- e2e: response headers of every P0 route contain the exact CSP (no `'unsafe-eval'` in the production build).
- e2e: a script that calls `fetch("https://example.invalid/")` is blocked and the CSP violation is reported (AC-4, sentinel test stays as is).
- Build keeps SSG for `/`, `/compare/[category]`, `/product/[id]`, `/methodology`, `/disclosure`, `/privacy` (ADR-008).

## Alternatives considered
- Nonce via `proxy.ts`: strictest script policy, but all pages become dynamic, SSG, ISR and PPR are lost, and it conflicts with ADR-008 and `cacheComponents`. The extra protection is small in Stage 1: no third-party or user-supplied script, and `connect-src 'self'` already blocks exfiltration.
- Hash-based CSP by hand: the inline blocks change per build and per route, so hashes would have to be generated and injected. High maintenance.
- Experimental SRI (`experimental.sri`, sha256) with `script-src 'self'`: keeps static generation and removes `'unsafe-inline'` for scripts. Next documents it as experimental, App Router only, build time only. A third-party article states it works with webpack only. Whether it works with Turbopack (used here) is unverified.

## Consequences
- Weaker XSS defense than a nonce or hash policy: an injected inline script would run, but it cannot send data off-origin.
- Static rendering, PPR and CDN caching are preserved.
- Adding analytics or any third-party script reopens this decision. That change needs a new ADR, and the nonce route (dynamic pages) becomes the likely choice for the affected routes.
- `style-src 'unsafe-inline'` stays while Next and Tailwind inject inline styles.

## Open points
- Experiment (separate PR): enable `experimental.sri` on the Turbopack build and check that scripts get `integrity` and the app runs with `script-src 'self'`. If it works and is stable enough, supersede this ADR with a strict policy.
- Decide in ADR-008 whether `cacheComponents` and `partialPrefetching` are needed in E0 for an empty app.
