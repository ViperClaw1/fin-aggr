// Export and import of the profile as a file the user keeps. Errors name schema paths and
// messages only, never the values (the file may hold income).
import { ProfileDraft } from '@fa/contracts';
import { CURRENT_VERSION, migrateDraft, ProfileVersionError, type Migrator } from './migrate';

const FORMAT = 'fa-profile';
export const MAX_IMPORT_BYTES = 16 * 1024;

type ImportError =
  'too_large' | 'invalid_json' | 'wrong_format' | 'unsupported_version' | 'invalid_profile';
export type ImportResult =
  { ok: true; draft: ProfileDraft } | { ok: false; error: ImportError; issues: readonly string[] };

export const exportProfile = (draft: ProfileDraft): string =>
  `${JSON.stringify({ format: FORMAT, version: CURRENT_VERSION, profile: draft }, null, 2)}\n`;

const fail = (error: ImportError, issues: readonly string[] = []): ImportResult => ({
  ok: false,
  error,
  issues,
});

/** Schema issues as "path: message"; zod messages describe the expectation, not the input. */
export const issuesOf = (error: { issues: readonly { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`);

function envelope(data: unknown): { version: number; profile: unknown } | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const keys = Object.keys(data).sort().join(',');
  const { format, version, profile } = data as Record<string, unknown>;
  if (keys !== 'format,profile,version' || format !== FORMAT || typeof version !== 'number')
    return null;
  return { version, profile };
}

export function parseImport(text: string, migrate: Migrator = migrateDraft): ImportResult {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return fail('too_large');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('invalid_json');
  }
  const env = envelope(data);
  if (env === null) return fail('wrong_format');
  let migrated: unknown;
  try {
    migrated = migrate(env.profile, env.version);
  } catch (e) {
    if (e instanceof ProfileVersionError) return fail('unsupported_version');
    throw e;
  }
  const parsed = ProfileDraft.safeParse(migrated);
  return parsed.success
    ? { ok: true, draft: parsed.data }
    : fail('invalid_profile', issuesOf(parsed.error));
}
