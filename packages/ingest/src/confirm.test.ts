import { describe, expect, it } from 'vitest';
import {
  confirmableFact,
  confirmationDate,
  confirmCommand,
  confirmFact,
  formatConfirmed,
  formatFactPreview,
} from './confirm';
import type { Sql } from './decisions';

function scripted(rows: Record<string, unknown>[]): Sql & {
  calls: string[];
  params: (readonly unknown[] | undefined)[];
} {
  const calls: string[] = [];
  const params: (readonly unknown[] | undefined)[] = [];
  return {
    calls,
    params,
    query: (text, values) => {
      calls.push(text.replace(/\s+/g, ' ').trim());
      params.push(values);
      return Promise.resolve({ rows });
    },
  };
}

describe('fact confirmation', () => {
  it('parses one known fact id', () => {
    expect(confirmCommand(['insurance:fdic'])).toEqual({ factId: 'insurance:fdic' });
    expect(confirmCommand(['treasury:tax_treatment'])).toEqual({
      factId: 'treasury:tax_treatment',
    });
    expect(() => confirmCommand([])).toThrow(/usage/i);
    expect(() => confirmCommand(['insurance:fdic', 'extra'])).toThrow(/usage/i);
    expect(() => confirmCommand(['treasury:nope'])).toThrow('unknown fact treasury:nope');
  });

  it('keeps the calendar date and drops the time', () => {
    expect(confirmationDate('2026-11-15T13:19:00.000Z')).toBe('2026-11-15');
    expect(() => confirmationDate('15 Nov 2026')).toThrow(/date/i);
  });

  it('writes verified by human with the login and the date', async () => {
    const lines: string[] = [];
    const sql = scripted([{ fact_id: 'insurance:fdic' }]);
    await confirmFact(
      sql,
      { factId: 'insurance:fdic', login: 'ViperClaw1', verifiedAt: '2026-11-15T13:19:00.000Z' },
      (line) => lines.push(line),
    );
    expect(sql.calls[0]).toContain('insert into fact_confirmations');
    expect(sql.calls[0]).toContain("'verified'");
    expect(sql.calls[0]).toContain("'human'");
    expect(sql.params[0]).toEqual(['insurance:fdic', 'ViperClaw1', '2026-11-15']);
    const preview = formatFactPreview(confirmableFact('insurance:fdic'));
    expect(preview).toContain('citation: 12 CFR 330.1(o)');
    expect(preview).toContain('url: https://www.ecfr.gov/');
    expect(lines).toEqual([
      preview,
      'fact insurance:fdic verified by human ViperClaw1 on 2026-11-15',
    ]);
    expect(formatConfirmed('treasury:tier', 'ViperClaw1', '2026-11-15')).toBe(
      'fact treasury:tier verified by human ViperClaw1 on 2026-11-15',
    );
  });

  it('refuses an email before writing', async () => {
    const lines: string[] = [];
    const sql = scripted([{ fact_id: 'insurance:ncua' }]);
    await expect(
      confirmFact(
        sql,
        { factId: 'insurance:ncua', login: 'me@example.com', verifiedAt: '2026-11-15' },
        (line) => lines.push(line),
      ),
    ).rejects.toThrow(/login/i);
    expect(sql.calls).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('prints the quote before it writes, and does not replace a stored confirmation', async () => {
    const lines: string[] = [];
    const calls: string[] = [];
    const sql: Sql = {
      query: (text) => {
        expect(lines[0]).toContain('quote: Single-price auctions.');
        calls.push(text);
        return Promise.resolve({ rows: [] });
      },
    };
    await expect(
      confirmFact(
        sql,
        { factId: 'treasury:tier', login: 'ViperClaw1', verifiedAt: '2026-11-15' },
        (line) => lines.push(line),
      ),
    ).rejects.toThrow('fact treasury:tier is already confirmed');
    expect(lines[0]).toBe(formatFactPreview(confirmableFact('treasury:tier')));
    expect(calls).toHaveLength(1);
  });
});
