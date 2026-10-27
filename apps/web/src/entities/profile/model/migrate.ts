// Versioned profile drafts. Changing the shape of Profile means: bump CURRENT_VERSION, add the
// step from the previous version to MIGRATIONS, and a test (.claude/rules/web.md).

export const CURRENT_VERSION = 1;

/** Turns a draft of version `from` into version `from + 1`. The result is validated by the caller. */
type Migration = (draft: unknown) => unknown;
export type MigrationTable = Readonly<Partial<Record<number, Migration>>>;

/** No older versions exist yet. */
const MIGRATIONS: MigrationTable = {};

export class ProfileVersionError extends Error {
  constructor(
    readonly code: 'future' | 'missing_step',
    version: unknown,
  ) {
    super(`${code}: profile version ${String(version)}`);
    this.name = 'ProfileVersionError';
  }
}

export type Migrator = (draft: unknown, version: number) => unknown;

export function createMigrator(table: MigrationTable, current: number): Migrator {
  return (draft, version) => {
    if (!Number.isSafeInteger(version) || version < 0)
      throw new ProfileVersionError('missing_step', version);
    if (version > current) throw new ProfileVersionError('future', version);
    let out = draft;
    for (let v = version; v < current; v += 1) {
      const step = table[v];
      if (step === undefined) throw new ProfileVersionError('missing_step', v);
      out = step(out);
    }
    return out;
  };
}

export const migrateDraft = createMigrator(MIGRATIONS, CURRENT_VERSION);
