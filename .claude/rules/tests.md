---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/web/e2e/**"
---

# Test rules

- Test names describe behavior. One reason to fail per test.
- No snapshots of engine output. Golden constants carry `// independent calc: <script or sheet>`.
- Never commit `.only` or `.skip`.
- Deterministic: fake clock, fixed seed, no sleeps (use auto-wait).
- e2e privacy test fills the profile with sentinel values and asserts that no request URL, header, or body contains them.
- axe runs on every P0 route and must report no serious or critical violations.
