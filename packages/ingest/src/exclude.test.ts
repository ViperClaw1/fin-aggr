import { describe, expect, it } from 'vitest';
import { applyOptOut, excludeCommand } from './exclude';
import type { Sql } from './decisions';

function scripted(rows: Record<string, unknown>[]): Sql & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    query: (text) => {
      calls.push(text.trim().split('\n')[0] ?? text);
      return Promise.resolve({ rows });
    },
  };
}

describe('bank opt-out', () => {
  it('parses the bank id and the request time', () => {
    expect(excludeCommand(['bank:fdic_1', '--requested', '2026-11-11T08:00:00.000Z'])).toEqual({
      sourceId: 'bank:fdic_1',
      requestedAt: '2026-11-11T08:00:00.000Z',
    });
    expect(() => excludeCommand(['ally', '--requested', '2026-11-11T08:00:00.000Z'])).toThrow(
      /usage/i,
    );
  });

  it('writes the flag and logs a late exclusion', async () => {
    const lines: string[] = [];
    const sql = scripted([{ id: 'bank:a' }]);
    await applyOptOut(
      sql,
      {
        sourceId: 'bank:a',
        requestedAt: '2026-11-10T00:00:00.000Z',
        appliedAt: '2026-11-11T08:00:00.000Z',
        by: 'ViperClaw1',
      },
      (line) => lines.push(line),
    );
    expect(sql.calls[0]).toContain('update sources');
    expect(lines).toEqual(['source bank:a excluded late']);
  });

  it('refuses an email as the person who applies the opt-out', async () => {
    const sql = scripted([{ id: 'bank:a' }]);
    await expect(
      applyOptOut(
        sql,
        {
          sourceId: 'bank:a',
          requestedAt: '2026-11-11T00:00:00.000Z',
          appliedAt: '2026-11-11T08:00:00.000Z',
          by: 'ops@fin-aggr.example',
        },
        () => undefined,
      ),
    ).rejects.toThrow(/login/i);
    expect(sql.calls).toEqual([]);
  });
});
