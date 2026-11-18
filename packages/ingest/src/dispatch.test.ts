import { describe, expect, it } from 'vitest';
import type { Sql } from './decisions';
import { failedDispatches, formatDispatchFailures } from './dispatch';

describe('pg_cron dispatch failures', () => {
  it('reads failed rows of the last 36 hours from dispatch_log', async () => {
    const calls: { text: string; values: readonly unknown[] | undefined }[] = [];
    const sql: Sql = {
      query: (text, values) => {
        calls.push({ text, values });
        return Promise.resolve({ rows: [{ workflow: 'ingest-bank-rates.yml', n: 2 }] });
      },
    };
    const failed = await failedDispatches(sql, Date.parse('2026-11-18T04:17:00.000Z'));
    expect(failed).toEqual(['ingest-bank-rates.yml']);
    expect(calls[0]?.text).toContain('where failed');
    expect(calls[0]?.values).toEqual(['2026-11-16T16:17:00.000Z']);
  });

  it('prints a counter and one warning per workflow, without a URL', () => {
    const line = formatDispatchFailures(['review-age.yml']);
    expect(line).toBe(
      'dispatch_failed 1\ndispatch_failed review-age.yml\n::warning::pg_cron dispatch failed: review-age.yml',
    );
    expect(line).not.toContain('http');
  });
});
