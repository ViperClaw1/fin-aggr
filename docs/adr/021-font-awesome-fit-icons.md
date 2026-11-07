# ADR-021: Font Awesome for Fit icons

- Status: accepted
- Date: 2026-11-07

## Context
The compare table Fit column needs a check when a product is eligible and a cross when it is not. Inline SVG did not show up reliably in the running app. The icons are part of the client compare table (ADR-016), so they must come from a package the app imports, not a stylesheet fetched at runtime.

## Decision
`apps/web` depends on Font Awesome SVG packages, pinned exactly: `@fortawesome/fontawesome-svg-core` 7.3.1, `@fortawesome/free-solid-svg-icons` 7.3.1, `@fortawesome/react-fontawesome` 3.5.0. The Fit column imports `faCheck` and `faXmark` by their deep paths so the rest of the solid set stays out of the bundle.

## Alternatives considered
- Hand-drawn SVG in the column: already tried; the marks did not appear for the reader.
- The `font-awesome` webfont stylesheet: an extra network request and a global CSS side effect, against ADR-016.

## Consequences
A new client dependency. Only the two named icons are imported. No lint rule change.
