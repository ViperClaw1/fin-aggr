import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { centsFromInteger, rateFromPercent, type Cents, type Rate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { federalBrackets2026 } from './rev-proc-2025-32';

const root = join(import.meta.dirname, '../../../..');

function cents(digits: string): Cents {
  return centsFromInteger(digits);
}

function rates(percents: readonly string[]): Rate[] {
  return percents.map((percent) => rateFromPercent(percent));
}

const PERCENTS = ['10', '12', '22', '24', '32', '35', '37'] as const;

describe('Rev. Proc. 2025-32 draft', () => {
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

  it('is not wired into fixtures or TAX_YEAR', () => {
    const source = readFileSync(join(import.meta.dirname, 'rev-proc-2025-32.ts'), 'utf8');
    expect(source).not.toContain('@fa/fixtures');
    const fixtures = readFileSync(join(root, 'packages/fixtures/src/reference.ts'), 'utf8');
    const taxYear = readFileSync(join(root, 'apps/web/src/shared/config/tax-year.ts'), 'utf8');
    expect(fixtures).not.toContain('rev-proc-2025-32');
    expect(fixtures).toContain('SYNTHETIC_RATES_BPS');
    expect(taxYear).toContain('2026');
    expect(taxYear).not.toContain('rev-proc');
  });
});
