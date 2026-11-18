import { describe, expect, it } from 'vitest';
import type { Sql } from './decisions';
import { applyResume, resumeCommand } from './resume';

function recorder(updated: boolean): Sql & { texts: string[]; values: unknown[][] } {
  const texts: string[] = [];
  const values: unknown[][] = [];
  return {
    texts,
    values,
    query: (text, params) => {
      texts.push(text.replace(/\s+/g, ' ').trim());
      values.push([...(params ?? [])]);
      const rows = text.includes('update sources') && updated ? [{ id: 'amex-cd-page' }] : [];
      return Promise.resolve({ rows });
    },
  };
}

describe('ingest:resume', () => {
  it('parses the source id and the reason', () => {
    expect(resumeCommand(['amex-cd-page', '--reason', 'headers limit fixed'])).toEqual({
      sourceId: 'amex-cd-page',
      reason: 'headers limit fixed',
    });
    expect(() => resumeCommand(['amex-cd-page'])).toThrow('usage');
    expect(() => resumeCommand(['amex-cd-page', '--reason', ' '])).toThrow('usage');
  });

  it('sets a manual source active and logs the login and reason in one transaction', async () => {
    const sql = recorder(true);
    const lines: string[] = [];
    await applyResume(
      sql,
      { sourceId: 'amex-cd-page', reason: 'headers limit fixed', by: 'ViperClaw1' },
      (line) => lines.push(line),
    );
    expect(sql.texts[0]).toBe('begin');
    expect(sql.texts[1]).toContain("status = 'manual' and excluded is not true");
    expect(sql.texts[2]).toContain('insert into source_status_log');
    expect(sql.values[2]).toEqual(['amex-cd-page', 'headers limit fixed', 'ViperClaw1']);
    expect(sql.texts[3]).toBe('commit');
    expect(lines).toEqual(['source amex-cd-page resumed']);
  });

  it('rolls back and refuses a source that is not manual or is excluded', async () => {
    const sql = recorder(false);
    await expect(
      applyResume(sql, { sourceId: 'bank:fdic:1', reason: 'x', by: 'ViperClaw1' }, () => undefined),
    ).rejects.toThrow('is not manual, or is excluded');
    expect(sql.texts.at(-1)).toBe('rollback');
  });
});
