import { Cents, Rate, type ProfileDraft } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { createMigrator } from './migrate';
import { exportProfile, MAX_IMPORT_BYTES, parseImport } from './serialize';

const DRAFT: ProfileDraft = {
  filingStatus: 'married_joint',
  stateCode: 'NY',
  taxableIncome: Cents.parse(12345600),
  cityMarginalRate: Rate.parse('0.03'),
  scenario: { principal: Cents.parse(2500000) },
};
const file = (body: unknown): string => JSON.stringify(body);
const errorOf = (text: string): string | undefined => {
  const r = parseImport(text);
  return r.ok ? undefined : r.error;
};

describe('export and import', () => {
  it('a round trip gives the same draft', () => {
    expect(parseImport(exportProfile(DRAFT))).toEqual({ ok: true, draft: DRAFT });
  });
  it('the export has the format tag and version and no timestamp', () => {
    expect(Object.keys(JSON.parse(exportProfile(DRAFT)) as object)).toEqual([
      'format',
      'version',
      'profile',
    ]);
  });
  it('imports an older version through the migrations', () => {
    const migrate = createMigrator({ 0: (d) => ({ ...(d as object), stateCode: 'TX' }) }, 1);
    const old = file({ format: 'fa-profile', version: 0, profile: {} });
    expect(parseImport(old, migrate)).toEqual({ ok: true, draft: { stateCode: 'TX' } });
  });
});

describe('rejected imports', () => {
  it.each([
    ['too large', 'x'.repeat(MAX_IMPORT_BYTES + 1), 'too_large'],
    ['invalid JSON', '{"format":', 'invalid_json'],
    ['another format', file({ format: 'other', version: 1, profile: {} }), 'wrong_format'],
    [
      'an extra envelope key',
      file({ format: 'fa-profile', version: 1, profile: {}, at: 1 }),
      'wrong_format',
    ],
    ['an array', file([]), 'wrong_format'],
    [
      'a future version',
      file({ format: 'fa-profile', version: 9, profile: {} }),
      'unsupported_version',
    ],
    [
      'an extra profile key',
      file({ format: 'fa-profile', version: 1, profile: { email: 'a' } }),
      'invalid_profile',
    ],
  ])('%s → %s', (_, text, error) => {
    expect(errorOf(text)).toBe(error);
  });
  it('counts the size in UTF-8 bytes, not characters', () => {
    const body = file({ format: 'fa-profile', version: 1, profile: {} });
    const padded = body + ' '.repeat(MAX_IMPORT_BYTES - body.length);
    expect(errorOf(padded)).toBeUndefined();
    // same character count, one more byte: "é" is two bytes in UTF-8
    expect(errorOf(`${padded.slice(0, -1)}é`)).toBe('too_large');
  });
  it('issues name the path, never the value (the file may hold income)', () => {
    const text = file({
      format: 'fa-profile',
      version: 1,
      profile: { taxableIncome: 'SENTINEL-987654' },
    });
    const r = parseImport(text);
    expect(r.ok ? [] : r.issues).toEqual([expect.stringMatching(/^taxableIncome: /)]);
    expect(JSON.stringify(r)).not.toContain('SENTINEL-987654');
  });
});
