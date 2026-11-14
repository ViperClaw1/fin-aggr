import { describe, expect, it } from 'vitest';
import { recordFailure } from './failure';
import { formatRunLine, formatStageFailure } from './run-line';

describe('upstream outage', () => {
  it('opens one issue on the third 503 and comments after that', async () => {
    const lines: string[] = [];
    const notes: { created: boolean; body: string }[] = [];
    let streak = 0;
    let open: number | null = null;
    const ports = {
      now: () => '2026-11-14T18:00:00.000Z',
      finishJob: () => {
        streak += 1;
        return Promise.resolve();
      },
      failureStreak: () => Promise.resolve(streak),
      notifyFailure: (message: string) => {
        if (open === null) {
          open = 12;
          notes.push({ created: true, body: message });
          return Promise.resolve({ number: open, created: true });
        }
        notes.push({ created: false, body: message });
        return Promise.resolve({ number: open, created: false });
      },
    };
    const failure = { stage: 'fetch', code: 'http_503' };
    const run = () =>
      recordFailure(ports, {
        sourceId: 'treasury-fiscal-data',
        domain: 'treasury',
        startedAt: '2026-11-14T18:00:00.000Z',
        failure,
        log: (line) => lines.push(line),
      });
    const first = await run();
    const second = await run();
    const third = await run();
    const fourth = await run();
    expect(first.issueNumber).toBeNull();
    expect(second.issueNumber).toBeNull();
    expect(third.issueNumber).toBe(12);
    expect(fourth.issueNumber).toBe(12);
    expect(notes.map((note) => note.created)).toEqual([true, false]);
    expect(notes[1]?.body).toBe('2026-11-14T18:00:00.000Z http_503');
    expect(lines).toEqual(['issue #12 created']);
    expect(first.holdReason).toBe('upstream_unavailable:http_503');
    const held = formatRunLine({
      id: 'treasury-fiscal-data',
      status: 'failed',
      rows: 0,
      queued: 0,
      version: '-',
      reason: 'upstream_unavailable:http_503',
    });
    expect(held).toContain('reason=upstream_unavailable:http_503');
    expect(formatStageFailure('treasury-fiscal-data', 'fetch', 'http_503')).toContain(
      'code=http_503',
    );
  });

  it('opens a parse failure on the first run', async () => {
    const notes: string[] = [];
    const ports = {
      now: () => '2026-11-14T18:00:00.000Z',
      finishJob: () => Promise.resolve(),
      failureStreak: () => Promise.resolve(0),
      notifyFailure: (message: string) => {
        notes.push(message);
        return Promise.resolve({ number: 4, created: true });
      },
    };
    const recorded = await recordFailure(ports, {
      sourceId: 'treasury-fiscal-data',
      domain: 'treasury',
      startedAt: '2026-11-14T18:00:00.000Z',
      failure: { stage: 'parse', code: 'json' },
      log: () => undefined,
    });
    expect(recorded.issueNumber).toBe(4);
    expect(recorded.holdReason).toBeUndefined();
    expect(notes).toEqual(['2026-11-14T18:00:00.000Z json']);
  });
});
