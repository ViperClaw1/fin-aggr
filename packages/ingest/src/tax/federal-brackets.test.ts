import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { centsFromInteger, rateFromPercent, type Cents, type Rate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { federalBrackets2026, federalBrackets2027 } from './federal-brackets';

const root = join(import.meta.dirname, '../../../..');

function cents(digits: string): Cents {
  return centsFromInteger(digits);
}

function rates(percents: readonly string[]): Rate[] {
  return percents.map((percent) => rateFromPercent(percent));
}

const PERCENTS = ['10', '12', '22', '24', '32', '35', '37'] as const;

describe('federal bracket drafts', () => {
  it('reads the 2026 ordinary brackets and stays unverified', () => {
    const draft = federalBrackets2026();
    const text = readFileSync(join(import.meta.dirname, 'rev-proc-2025-32.txt'), 'utf8');
    expect(draft.taxYear).toBe(2026);
    expect(draft.sourceUrl).toBe('https://www.irs.gov/irb/2025-45_IRB');
    expect(draft.page).toBe(695);
    expect(draft.verification).toEqual({ status: 'unverified' });
    expect(draft.isMock).toBe(false);
    expect(Object.keys(draft)).not.toContain('states');
    expect(draft.tables.map((table) => table.filingStatus)).toEqual([
      'married_joint',
      'head_of_household',
      'single',
      'married_separate',
    ]);
    expect(draft.tables.map((table) => table.section)).toEqual([
      '1(j)(2)(A)',
      '1(j)(2)(B)',
      '1(j)(2)(C)',
      '1(j)(2)(D)',
    ]);

    // independent calc: Form 1040-ES (2026) Tax Rate Schedules X, Y-1, Y-2 and Z, "But not over"
    // column, read 2026-11-22 from https://www.irs.gov/pub/irs-pdf/f1040es.pdf. All 28 agree.
    const bounds: Record<string, readonly (string | null)[]> = {
      married_joint: ['2480000', '10080000', '21140000', '40355000', '51245000', '76870000', null],
      head_of_household: [
        '1770000',
        '6745000',
        '10570000',
        '20175000',
        '25620000',
        '64060000',
        null,
      ],
      single: ['1240000', '5040000', '10570000', '20177500', '25622500', '64060000', null],
      married_separate: [
        '1240000',
        '5040000',
        '10570000',
        '20177500',
        '25622500',
        '38435000',
        null,
      ],
    };
    for (const table of draft.tables) {
      const expected = bounds[table.filingStatus];
      expect(expected).toBeDefined();
      expect(table.brackets.map((bracket) => bracket.upTo)).toEqual(
        expected?.map((digits) => (digits === null ? null : cents(digits))),
      );
      expect(table.brackets.map((bracket) => bracket.rate)).toEqual(rates(PERCENTS));
      for (const bracket of table.brackets) {
        expect(text).toContain(bracket.quote);
        expect(bracket.quote.length).toBeLessThanOrEqual(400);
      }
    }
    expect(text).not.toContain('TABLE 5');
  });

  it('reads the 2027 ordinary brackets from Rev. Proc. 2026-35 and stays unverified', () => {
    const draft = federalBrackets2027();
    const text = readFileSync(join(import.meta.dirname, 'rev-proc-2026-35.txt'), 'utf8');
    expect(draft).toMatchObject({
      taxYear: 2027,
      revProc: '2026-35',
      sourceUrl: 'https://www.irs.gov/pub/irs-drop/rp-26-35.pdf',
      page: null,
      verification: { status: 'unverified' },
      isMock: false,
    });
    // independent calc: single and married_joint from IRS news release IR-2026-133 (2026-11-05),
    // read 2026-11-22. head_of_household and married_separate have no second source yet.
    const bounds: Record<string, readonly (string | null)[]> = {
      married_joint: ['2560000', '10405000', '21825000', '41665000', '52910000', '79365000', null],
      head_of_household: [
        '1825000',
        '6965000',
        '10910000',
        '20830000',
        '26455000',
        '66135000',
        null,
      ],
      single: ['1280000', '5202500', '10912500', '20832500', '26455000', '66137500', null],
      married_separate: [
        '1280000',
        '5202500',
        '10912500',
        '20832500',
        '26455000',
        '39682500',
        null,
      ],
    };
    for (const table of draft.tables) {
      expect(table.brackets.map((bracket) => bracket.upTo)).toEqual(
        bounds[table.filingStatus]?.map((digits) => (digits === null ? null : cents(digits))),
      );
      expect(table.brackets.map((bracket) => bracket.rate)).toEqual(rates(PERCENTS));
      for (const bracket of table.brackets) expect(text).toContain(bracket.quote);
    }
  });

  it('is not wired into fixtures or TAX_YEAR', () => {
    const source = readFileSync(join(import.meta.dirname, 'federal-brackets.ts'), 'utf8');
    expect(source).not.toContain('@fa/fixtures');
    const fixtures = readFileSync(join(root, 'packages/fixtures/src/reference.ts'), 'utf8');
    const taxYear = readFileSync(join(root, 'apps/web/src/shared/config/tax-year.ts'), 'utf8');
    expect(fixtures).not.toContain('federal-brackets');
    expect(fixtures).toContain('SYNTHETIC_RATES_BPS');
    expect(taxYear).toContain('2026');
    expect(taxYear).not.toContain('rev-proc');
  });
});
