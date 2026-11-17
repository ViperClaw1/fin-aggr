import { describe, expect, it } from 'vitest';
import type { Sql } from './decisions';
import { formatSilence, SILENCE_HOURS, WEEKLY_SILENCE_HOURS } from './policy';
import { cutoffIso, silenceTargets, silentSourceIds } from './silence';

function scripted(
  rowsFor: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[],
): Sql & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    query: (text, values) => {
      texts.push(text.replace(/\s+/g, ' ').trim());
      return Promise.resolve({ rows: rowsFor(text, values) });
    },
  };
}

function hasId(values: readonly unknown[] | undefined, id: string): boolean {
  return values?.some((value) => Array.isArray(value) && value.includes(id)) === true;
}

describe('schedule silence', () => {
  it('uses 36 hours for a daily source and 7 days plus 12 hours for a weekly source', () => {
    const targets = silenceTargets();
    expect(targets.find((target) => target.id === 'fdic-institutions')).toMatchObject({
      hours: SILENCE_HOURS,
      request: false,
      bank: false,
    });
    expect(targets.find((target) => target.id === 'fdic-financials')).toMatchObject({
      hours: WEEKLY_SILENCE_HOURS,
      request: false,
    });
    expect(targets.find((target) => target.id === 'amex-cd-page')).toMatchObject({
      hours: WEEKLY_SILENCE_HOURS,
      request: true,
    });
    expect(targets.at(-1)).toEqual({
      id: 'bank-rates',
      hours: SILENCE_HOURS,
      request: true,
      bank: true,
    });
    expect(targets.some((target) => target.id === 'tax-tables')).toBe(false);
    expect(targets.some((target) => target.id === 'bank-pdf-hashes')).toBe(false);
    expect(cutoffIso(Date.parse('2026-11-17T08:48:00.000Z'), SILENCE_HOURS)).toBe(
      '2026-11-15T20:48:00.000Z',
    );
  });

  it('names a daily source with no row and a night with no bank request', async () => {
    const sql = scripted((_text, values) =>
      hasId(values, 'fdic-institutions') ? [{ source_id: 'fdic-institutions' }] : [],
    );
    const silent = await silentSourceIds(sql, Date.parse('2026-11-17T08:48:00.000Z'));
    expect(silent).toContain('treasury-par-yield');
    expect(silent).toContain('bank-rates');
    expect(silent).not.toContain('fdic-institutions');
    expect(sql.texts.some((text) => text.includes("source_id like 'bank:%'"))).toBe(true);
    expect(sql.texts.some((text) => text.includes('request_count > 0'))).toBe(true);
    const line = formatSilence(['bank-rates']);
    expect(line).toBe('silent 1\nsilent bank-rates\n::warning::schedule silent: bank-rates');
    expect(line).not.toContain('http');
  });

  it('counts a bank request and ignores a weekly skip row', async () => {
    const sql = scripted((text, values) => {
      if (text.includes("like 'bank:%'")) return [{ hit: 1 }];
      if (text.includes('request_count > 0')) return [];
      if (hasId(values, 'fdic-financials')) return [{ source_id: 'fdic-financials' }];
      if (hasId(values, 'fdic-institutions')) return [{ source_id: 'fdic-institutions' }];
      return [];
    });
    const silent = await silentSourceIds(sql, Date.parse('2026-11-17T04:17:00.000Z'));
    expect(silent).not.toContain('bank-rates');
    expect(silent).toContain('amex-cd-page');
    expect(silent).not.toContain('fdic-financials');
    expect(silent).not.toContain('fdic-institutions');
  });
});
