import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatRunLine, formatStageFailure, writeStepSummary } from './run-line';

describe('run line', () => {
  it('counts a published fdic run', () => {
    expect(
      formatRunLine({
        id: 'fdic-institutions',
        status: 'published',
        rows: 4123,
        queued: 0,
        version: '17',
      }),
    ).toBe('source fdic-institutions published rows=4123 queued=0 version=17');
  });

  it('marks a published run whose cache clear failed', () => {
    expect(
      formatRunLine({
        id: 'fdic-institutions',
        status: 'published',
        rows: 4123,
        queued: 0,
        version: '17',
        revalidate: 'failed',
      }),
    ).toBe('source fdic-institutions published rows=4123 queued=0 version=17 revalidate=failed');
  });

  it('states why a run was held', () => {
    expect(
      formatRunLine({
        id: 'fdic-institutions',
        status: 'held',
        rows: 0,
        queued: 0,
        version: '-',
        reason: 'unchanged',
      }),
    ).toBe('source fdic-institutions held rows=0 queued=0 version=- reason=unchanged');
    expect(
      formatRunLine({
        id: 'fdic-national-rates',
        status: 'held',
        rows: 0,
        queued: 1,
        version: '-',
        reason: 'queued:empty',
      }),
    ).toBe('source fdic-national-rates held rows=0 queued=1 version=- reason=queued:empty');
    expect(
      formatRunLine({
        id: 'treasury-auctions',
        status: 'held',
        rows: 0,
        queued: 0,
        version: '-',
        reason: 'missing_fields:tier,early_withdrawal,eligibility,tax_treatment',
      }),
    ).toContain('reason=missing_fields:');
    expect(
      formatRunLine({
        id: 'fdic-financials',
        status: 'held',
        rows: 0,
        queued: 1,
        version: '-',
        reason: 'blocked:shrunk',
      }),
    ).toContain('reason=blocked:shrunk');
  });

  it('names the stage and the code when a run throws', () => {
    expect(formatStageFailure('fdic-financials', 'fetch', 'timeout')).toBe(
      'source fdic-financials failed stage=fetch code=timeout',
    );
  });

  it('appends the same line to the actions summary', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'fa-ingest-')), 'summary.md');
    const line = formatRunLine({
      id: 'fdic-institutions',
      status: 'published',
      rows: 2,
      queued: 0,
      version: '17',
    });
    writeStepSummary(line, { GITHUB_STEP_SUMMARY: path });
    writeStepSummary(line, {});
    expect(readFileSync(path, 'utf8')).toBe(`${line}\n`);
  });
});
