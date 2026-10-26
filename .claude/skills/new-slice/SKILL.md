---
name: new-slice
description: Scaffold a new FSD slice (entity, feature, or widget) in apps/web with a public API and layer-correct structure.
argument-hint: "<layer: entities|features|widgets> <slice-name>"
disable-model-invocation: true
---

# New slice

Arguments: `$ARGUMENTS` (layer and slice name, kebab-case). If either is missing or the layer is not one of entities, features, widgets, ask.

## Steps

1. Check `docs/component-registry.md` and the existing slices for a duplicate. If one exists, stop and say so.
2. Create `apps/web/src/<layer>/<slice>/` with:
   - `index.ts`: the public API (re-exports only).
   - `ui/`, `model/`, and `api/` only where the layer needs them.
   - entities also get `queries.ts` (TanStack Query hooks, exported through the public API) and `api/` as the only place that calls `getGateway()`.
   - features get no data access: they receive data through props.
3. Apply `.claude/rules/web.md`: import downward only, no imports from sibling slices, relative imports inside the slice.
4. Add a minimal test next to the code.
5. Add a row to `docs/component-registry.md` for each exported UI component.
6. Run `/verify`.

Do not add dependencies or lint exceptions. If the slice needs a boundary the rules forbid, stop and propose an ADR (`/add-adr`).
