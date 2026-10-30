# ADR-018: PDF viewer and synthetic documents

- Status: accepted
- Date: 2026-10-30
- Relates to: ADR-014 (versions), ADR-015 (CSP), ADR-016 (first-load JS)

## Context

E6 (spec §8): a citation opens the right page and highlights the quote. Eight fixture documents already point at `/mock-docs/<id>.pdf`, and forty facts carry `page` and `quote`. The files do not exist. `CitationViewerHost` belongs in the root layout; the viewer loads lazily (spec §2, §6). AC-8 counts First Load JS without the PDF module.

Stage 2 will serve real bank PDFs, so a viewer is needed then as well. The profile-presence flag already occupies ADR-017. Spec §8 leaves ADR-019 for Supabase.

## Decision

Show PDFs with `pdfjs-dist` 6.4.299, a dependency of `@fa/web`. The viewer is loaded with `next/dynamic` and `ssr: false`, only when a citation opens, so it stays out of every route's first load.

Generate the eight files with `pdfkit` 0.20.2, a root devDependency used only by `tools/build-docs.mjs`. `tools/*.mjs` is already a knip entry. `@fa/web` runs the script from `predev` and `prebuild`: `pnpm build` builds that package, and `pnpm dev` does not run `prebuild`. `apps/web/public/mock-docs/` is gitignored.

The script reads `NEXT_PUBLIC_FA_SEED` and, when it is unset, uses `20261025`, the default in `apps/web/src/shared/config/env.ts` and `DEFAULT_SEED` in `@fa/fixtures`. The fixture test that checks each quote on its page uses the same seed. If the PDFs are already present for that seed, the script does not rebuild them. Quote text that changes at the same seed is picked up only after the directory is deleted or the seed changes.

The documents are our own text, with the watermark `SYNTHETIC DOCUMENT · NOT A REAL BANK AGREEMENT` on every page. No `CreationDate` and no random document id: the same seed produces the same bytes.

CSP stays as in ADR-015:

- The pdf.js worker is loaded from this origin (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`), so `script-src 'self'` covers it.
- The 6.4.299 types have no `isEvalSupported`. `getDocument` is called with `useWasm: false` (the default is `true`) so the worker does not load a WASM decoder. Our PDFs have no JPX or JBIG2 images, which are what that decoder is for, and `'wasm-unsafe-eval'` is not added.
- Fonts are embedded, or `standardFontDataUrl` points at this origin. A substituted font would move the text layer off the painted page.
- `connect-src 'self'` is unchanged: the PDFs are on this origin.

The worker file in 6.4.299 is `build/pdf.worker.min.mjs`, loaded as `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. `TextLayer` and the rest of `getDocument` are read from `types/src/pdf.d.ts` when the viewer is written. `tools/build-docs.mjs` imports `pdfkit`. The fixture test in `apps/web` imports `pdfjs-dist` to read the pages back. The viewer does not import it yet.

Opening a citation matches the profile drawer: the first open pushes a history entry, closing calls `history.back()`, a link or reload closes with `replace`, and a page change inside the open panel uses `replace`. That sequence lives in one helper under `shared/lib`. The drawer and the viewer both call it.

## Alternatives considered

- `pdf-lib` 1.17.1 for generation: rejected. Last release was in 2022.
- Commit the PDFs and check them in CI with `docs:check`: rejected. Generated files are not hand-edited (`AGENTS.md`), and a build step keeps them out of git.
- `pdfjs-dist` as a root devDependency: rejected. The viewer runs in the browser, and pnpm will not link a root devDependency into `@fa/web`.
- `'unsafe-eval'` or `'wasm-unsafe-eval'` in the CSP: rejected. The same-origin worker, `useWasm: false`, and the absence of JPX/JBIG2 keep ADR-015 intact.

## Consequences

- Versions are an accepted amendment on ADR-014. `pdfjs-dist` 6.4.299 is a dependency of `@fa/web`. `pdfkit` 0.20.2 is a root devDependency. The generator imports pdfkit; the page-text test imports pdfjs-dist.
- `tools/bundle-budget.mjs` gains a pdf.js marker: it fails when the marker is in any first-load chunk, and when no chunk in the build contains it.
- The first Vercel deploy must answer 200 for `/mock-docs/doc_01.pdf`. The deploy runs `@fa/web`'s `prebuild`, which needs the root devDependencies installed so `pdfkit` is present.
- Highlighting depends on embedded fonts and on `findQuote` normalizing spaces, line breaks, case, soft hyphens, and ligatures. The fixture test extracts page text with pdf.js in Node.
