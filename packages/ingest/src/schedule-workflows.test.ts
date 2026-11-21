import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEDULE, cronLines, scheduleById } from './schedule';
import { amexAdapter } from './scrape/banks/27471';
import { allyAdapter } from './scrape/banks/57803';
import { sallieAdapter } from './scrape/banks/58177';
import { overnightUtcHours } from './scrape/rules';

const WORKFLOWS = join(process.cwd(), '.github/workflows');

function workflowText(name: string): string {
  return readFileSync(join(WORKFLOWS, name), 'utf8');
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('schedule workflows', () => {
  it('keeps every workflow cron off minute 0', () => {
    const files = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
    const minutes = files.flatMap((name) =>
      [...workflowText(name).matchAll(/cron: '([^']+)'/g)].map((match) => match[1]?.split(' ')[0]),
    );
    expect(minutes.length).toBeGreaterThan(0);
    expect(minutes.every((minute) => minute === '17' || minute === '37' || minute === '47')).toBe(
      true,
    );
  });

  it('calls the shared runner once per source, with that source concurrency and timeout', () => {
    const files = new Set(SCHEDULE.map((row) => row.workflow));
    for (const file of files) {
      const text = workflowText(file);
      const rows = SCHEDULE.filter((row) => row.workflow === file);
      const jobs = rows.filter((row) => row.embedded !== true);
      const embedded = rows.filter((row) => row.embedded === true);
      expect(count(text, 'uses: ./.github/workflows/ingest-source.yml')).toBe(jobs.length);
      expect(text).not.toContain('upload-artifact');
      expect(text).not.toContain('strategy:');
      expect(text).toContain('permissions:\n  contents: read');
      expect(text).toContain('workflow_dispatch:');
      const lines = cronLines(rows[0]?.cron ?? null);
      for (const row of rows) expect(cronLines(row.cron)).toEqual(lines);
      expect(count(text, 'cron:')).toBe(lines.length);
      expect(lines.length > 0 || text.includes('on:\n  workflow_dispatch:')).toBe(true);
      for (const line of lines) expect(text).toContain(`cron: '${line}'`);
      for (const row of embedded) expect(text).not.toContain(`source: ${row.id}`);
      for (const row of jobs) {
        expect(text).toContain(
          `source: ${row.id}\n      timeout-minutes: ${String(row.timeoutMinutes)}`,
        );
      }
    }
  });

  it('sets the source lock, the timeout, and one run command on the shared workflow', () => {
    const text = workflowText('ingest-source.yml');
    expect(text).toContain('group: ingest-${{ inputs.source }}');
    expect(text).toContain('cancel-in-progress: false');
    expect(text).toContain('timeout-minutes: ${{ inputs.timeout-minutes }}');
    expect(text).toContain('pnpm ingest:run ${{ inputs.source }}');
    expect(text).toContain('SUPABASE_DB_URL');
    expect(text).toContain('SUPABASE_SECRET_KEY');
    expect(text).toContain('REVALIDATE_SECRET');
    expect(text).toContain('REVIEW_REPO_TOKEN');
    expect(text).toContain('FRED_API_KEY');
    expect(text).toContain('FA_SCRAPE_MAILBOX');
    expect(text).toContain(
      `fromJSON('["fdic-institutions","treasury-par-yield","fdic-financials","ncua-5300","fdic-national-rates","treasury-fiscal-data","treasurydirect","ecfr-330","ecfr-745","ecfr-328","federal-register","amex-cd-page","bank-rates"]')`,
    );
    expect(text).not.toContain('upload-artifact');
    expect(text).not.toContain('console.log');
  });

  it('derives bank-rates hours from the pilot banks windows across DST', () => {
    const zones = [allyAdapter.timeZone, sallieAdapter.timeZone, amexAdapter.timeZone];
    const hours = overnightUtcHours(zones, 2026);
    const range = `${String(hours[0])}-${String(hours.at(-1))}`;
    expect(hours.length).toBe((hours.at(-1) ?? 0) - (hours[0] ?? 0) + 1);
    expect(cronLines(scheduleById('bank-rates')?.cron ?? null)).toEqual([
      `17 ${range} * * *`,
      `47 ${range} * * *`,
    ]);
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261119120000_bank_rates_slots.sql'),
      'utf8',
    );
    expect(sql).toContain(`'5,35 ${range} * * *'`);
  });

  it('runs eCFR parts one after another without skipping on a failure', () => {
    const text = workflowText('ingest-daily-rules.yml');
    for (const [part, after] of [
      ['ecfr-745', 'ecfr-330'],
      ['ecfr-328', 'ecfr-745'],
    ] as const) {
      expect(text).toContain(`  ${part}:\n    needs: ${after}\n    if: \${{ !cancelled() }}\n`);
    }
  });

  it('keeps the runner stdout on the fixed line', () => {
    const source = readFileSync(join(process.cwd(), 'packages/ingest/src/run.ts'), 'utf8');
    expect(source).not.toContain('console.log');
  });
});
