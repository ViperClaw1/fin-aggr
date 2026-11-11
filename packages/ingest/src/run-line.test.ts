import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatRunLine, writeStepSummary } from './run-line';

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
