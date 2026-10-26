---
name: add-adr
description: Create a new numbered Architecture Decision Record from the template when a dependency, lint rule, layer boundary, or contract decision changes.
argument-hint: "<short decision title>"
disable-model-invocation: true
---

# Add ADR

Arguments: `$ARGUMENTS` (decision title).

## Steps

1. List `docs/adr/` and take the next free number (001 to 012 exist in the spec; continue from the highest).
2. Copy `docs/adr/000-template.md` to `docs/adr/<NNN>-<kebab-title>.md`.
3. Fill: status (`proposed`), context, decision, alternatives considered with why rejected, consequences, and which gates or rules change.
4. Do not apply the change itself. The ADR is approved by the user first.
5. Link the ADR from the place the decision affects (a lint config comment, a README line) only after approval.
