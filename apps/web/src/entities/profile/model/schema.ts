// The only module of the profile slice that runs zod. It is reached through import() in
// load-schema.ts, so the schema joins the client bundle on hydration, not in the first load (ADR-016 D5).
// Issues name schema paths and messages only, never the values (the draft may hold income).
import { ProfileDraft } from '@fa/contracts';

export type DraftCheck =
  { ok: true; draft: ProfileDraft } | { ok: false; issues: readonly string[] };

export function checkDraft(value: unknown): DraftCheck {
  // eslint-disable-next-line no-restricted-syntax -- loaded lazily through import(), ADR-016 D5
  const parsed = ProfileDraft.safeParse(value);
  return parsed.success
    ? { ok: true, draft: parsed.data }
    : {
        ok: false,
        issues: parsed.error.issues.map(
          (i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
        ),
      };
}
