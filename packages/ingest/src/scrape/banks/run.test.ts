import type { ScrapeClient } from '../session';
import { describe, expect, it } from 'vitest';
import { readAlly } from './57803';
import type { BankPorts } from './run';
import { runBankPage } from './run';

const HTML = `<section><h3>Savings</h3><p>Access your money at any time.</p><p>3.2% correct as of 11/12/26</p></section>`;
const NIGHT = '2026-11-11T08:00:00.000Z';
const DAY = '2026-11-11T15:00:00.000Z';

interface RecordedJob {
  status: string;
  requestCount: number;
  errors: readonly { code: string }[];
}

function client(kind: 'ok' | 'manual'): ScrapeClient {
  return {
    get: () =>
      Promise.resolve(
        kind === 'ok'
          ? {
              kind: 'ok',
              url: 'https://www.ally.com/bank/view-rates/',
              body: new TextEncoder().encode(HTML),
              status: 200 as const,
            }
          : { kind: 'manual', reason: 'headers_overflow' as const },
      ),
    flushLoad() {
      return undefined;
    },
    quote: (text) => text,
  };
}

function ports(alreadyFetched = false): BankPorts & {
  published: unknown;
  queued: string | null;
  manual: string | null;
  jobs: RecordedJob[];
} {
  const state = {
    published: null as unknown,
    queued: null as string | null,
    manual: null as string | null,
    jobs: [] as RecordedJob[],
  };
  return {
    ...state,
    confirmation: () => Promise.resolve({ confirmed: false }),
    previous: () => Promise.resolve([]),
    confirmedIds: () => Promise.resolve([]),
    saveSnapshot: () => Promise.resolve(9),
    commit: (input) => {
      state.published = input.publish;
      state.queued = input.queue?.reason ?? null;
      return Promise.resolve({
        versionId: input.publish === null ? null : 3,
        queueId: input.queue === null ? null : 4,
      });
    },
    markManual: (reason) => {
      state.manual = reason;
      return Promise.resolve();
    },
    requestedSince: () => Promise.resolve(alreadyFetched),
    finishJob: (job) => {
      state.jobs.push(job);
      return Promise.resolve();
    },
    get published() {
      return state.published;
    },
    get queued() {
      return state.queued;
    },
    get manual() {
      return state.manual;
    },
    get jobs() {
      return state.jobs;
    },
  };
}

describe('bank page run', () => {
  it('holds every row on the first connection and publishes nothing', async () => {
    const bank = ports();
    const lines: string[] = [];
    await runBankPage({
      client: client('ok'),
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: readAlly,
      ports: bank,
      log: (line) => {
        lines.push(line);
      },
      now: () => NIGHT,
    });
    expect(bank.published).toBeNull();
    expect(bank.queued).toContain('first_connection');
    expect(lines[0]).toContain('held');
    expect(lines[0]).toContain('version=-');
    expect(bank.jobs[0]).toMatchObject({ status: 'held', requestCount: 1 });
  });

  it('does not publish when the session already stopped', async () => {
    const bank = ports();
    await runBankPage({
      client: client('manual'),
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: readAlly,
      ports: bank,
      log: () => undefined,
      now: () => NIGHT,
    });
    expect(bank.published).toBeNull();
    expect(bank.queued).toBeNull();
    expect(bank.manual).toBeNull();
    expect(bank.jobs[0]).toMatchObject({ requestCount: 1, errors: [{ code: 'headers_overflow' }] });
  });

  it('marks a thrown adapter manual and publishes nothing', async () => {
    const bank = ports();
    const lines: string[] = [];
    await runBankPage({
      client: client('ok'),
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: () => {
        throw new Error('selector missing');
      },
      ports: bank,
      log: (line) => {
        lines.push(line);
      },
      now: () => NIGHT,
    });
    expect(bank.manual).toBe('adapter');
    expect(bank.published).toBeNull();
    expect(lines[0]).toBe('source bank:fdic:57803 manual adapter');
  });

  it('publishes a confirmed clean row as verified by a person', async () => {
    const bank = ports();
    bank.confirmation = () => Promise.resolve({ confirmed: true, verifiedAt: '2026-11-15' });
    bank.previous = () => Promise.resolve(readAlly(HTML).products);
    await runBankPage({
      client: client('ok'),
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: readAlly,
      ports: bank,
      log: () => undefined,
      now: () => NIGHT,
    });
    const published = bank.published as {
      provenance: { verification: { status: string; by: string } };
      tiers: { apy: string }[];
    }[];
    expect(published).toHaveLength(1);
    expect(published[0]?.tiers[0]?.apy).toBe('0.032');
    expect(published[0]?.provenance.verification).toEqual({
      status: 'verified',
      verifiedAt: '2026-11-15',
      by: 'human',
    });
    expect(bank.queued).toBeNull();
    expect(bank.jobs[0]).toMatchObject({ status: 'published', requestCount: 1, rowCount: 1 });
  });

  it('logs outside_window and writes a job row without requesting the bank', async () => {
    const bank = ports();
    const lines: string[] = [];
    let calls = 0;
    await runBankPage({
      client: {
        get: () => {
          calls += 1;
          return Promise.reject(new Error('fetched'));
        },
        flushLoad() {
          return undefined;
        },
        quote: (text) => text,
      },
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: readAlly,
      ports: bank,
      log: (line) => {
        lines.push(line);
      },
      now: () => DAY,
    });
    expect(calls).toBe(0);
    expect(lines).toEqual(['source bank:fdic:57803 held reason=outside_window']);
    expect(bank.jobs).toEqual([
      expect.objectContaining({
        status: 'held',
        requestCount: 0,
        errors: [{ code: 'outside_window' }],
      }),
    ]);
  });

  it('skips a bank already requested in this window', async () => {
    const bank = ports(true);
    const lines: string[] = [];
    let calls = 0;
    await runBankPage({
      client: {
        get: () => {
          calls += 1;
          return Promise.reject(new Error('fetched'));
        },
        flushLoad() {
          return undefined;
        },
        quote: (text) => text,
      },
      request: {
        sourceId: 'bank:fdic:57803',
        url: 'https://www.ally.com/bank/view-rates/',
        timeZone: 'America/Denver',
        excluded: false,
      },
      institutionId: 'fdic:57803',
      retrievedDay: '2026-11-16',
      read: readAlly,
      ports: bank,
      log: (line) => {
        lines.push(line);
      },
      now: () => NIGHT,
    });
    expect(calls).toBe(0);
    expect(lines).toEqual(['source bank:fdic:57803 held reason=already_fetched']);
    expect(bank.jobs[0]).toMatchObject({
      status: 'held',
      requestCount: 0,
      errors: [{ code: 'already_fetched' }],
    });
  });
});
