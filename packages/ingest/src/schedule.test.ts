import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isNetworkError, onceOnNetworkError } from './network';
import { main } from './run';
import {
  SCHEDULE,
  cronLines,
  registerAfterBanks,
  registerBank,
  registerJob,
  resetJobs,
  runOneAtATime,
  runScheduled,
  scheduleById,
} from './schedule';

const WORKFLOWS = join(process.cwd(), '.github/workflows');

function workflowText(name: string): string {
  return readFileSync(join(WORKFLOWS, name), 'utf8');
}

describe('network retry', () => {
  it('treats a failed fetch and a socket code as a network error', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
    const wrapped = new TypeError('other');
    Object.assign(wrapped, { cause: Object.assign(new Error('down'), { code: 'ETIMEDOUT' }) });
    expect(isNetworkError(wrapped)).toBe(true);
  });

  it('does not treat an abort or an http failure as a network error', () => {
    expect(isNetworkError(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }))).toBe(false);
    expect(
      isNetworkError(Object.assign(new Error('headers'), { code: 'UND_ERR_HEADERS_OVERFLOW' })),
    ).toBe(false);
    expect(isNetworkError(new Error('revalidate failed: 503'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it('runs a second time only after a network error', async () => {
    let calls = 0;
    const value = await onceOnNetworkError(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve('ok');
    });
    expect(value).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not run a third time when the second attempt also fails', async () => {
    let calls = 0;
    const failure = onceOnNetworkError(() => {
      calls += 1;
      return Promise.reject(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
    });
    await expect(failure).rejects.toThrow('reset');
    expect(calls).toBe(2);
  });

  it('does not retry a failure that is not a network error', async () => {
    let calls = 0;
    const failure = onceOnNetworkError(() => {
      calls += 1;
      return Promise.reject(new Error('validation'));
    });
    await expect(failure).rejects.toThrow('validation');
    expect(calls).toBe(1);
  });
});

describe('schedule catalog', () => {
  it('lists each plan source once', () => {
    const ids = SCHEDULE.map((row) => row.id);
    expect(ids).toEqual([
      'fdic-institutions',
      'treasury-fiscal-data',
      'treasurydirect',
      'treasury-par-yield',
      'bank-rates',
      'ecfr-330',
      'ecfr-745',
      'ecfr-328',
      'federal-register',
      'fdic-financials',
      'ncua-5300',
      'fdic-national-rates',
      'bank-pdf-hashes',
      'amex-cd-page',
      'tax-tables',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCHEDULE.filter((row) => row.ready === true).map((row) => row.id)).toEqual([
      'fdic-institutions',
      'treasury-fiscal-data',
      'treasurydirect',
      'treasury-par-yield',
      'ecfr-330',
      'ecfr-745',
      'ecfr-328',
      'federal-register',
      'fdic-financials',
      'ncua-5300',
      'fdic-national-rates',
      'amex-cd-page',
    ]);
  });

  it('keeps tax tables off the clock', () => {
    expect(scheduleById('tax-tables')?.cron).toBeNull();
    expect(scheduleById('missing')).toBeUndefined();
  });

  it('retries bank rates off the hour and keeps the overnight window', () => {
    expect(cronLines(scheduleById('bank-rates')?.cron ?? null)).toEqual([
      '17 3-10 * * *',
      '47 3-10 * * *',
    ]);
    expect(scheduleById('amex-cd-page')?.workflow).toBe('ingest-bank-rates.yml');
    expect(scheduleById('amex-cd-page')?.embedded).toBe(true);
    const text = workflowText('ingest-bank-rates.yml');
    expect(text).not.toContain('ignore_window');
    expect(text).not.toContain('source: amex-cd-page');
    expect(text).toContain('Eastern 03:00–11:00');
    expect(text).toContain('Hawaii 08:00–16:00');
  });
});

describe('scheduled run', () => {
  afterEach(() => {
    resetJobs();
  });

  it('logs a fixed line when the connector is not registered', async () => {
    const lines: string[] = [];
    await runScheduled('bank-pdf-hashes', {}, (line) => lines.push(line));
    expect(lines).toEqual(['source bank-pdf-hashes pending']);
  });

  it('fails a ready source that has no job', async () => {
    await expect(runScheduled('fdic-institutions', {}, () => undefined)).rejects.toThrow(
      'source fdic-institutions is ready but has no job',
    );
  });

  it('refuses an unknown source', async () => {
    await expect(runScheduled('nope', {}, () => undefined)).rejects.toThrow('unknown source nope');
    expect(() => {
      registerJob('nope', () => Promise.resolve());
    }).toThrow('unknown source nope');
  });

  it('retries a registered job once on a network error', async () => {
    const seen: string[] = [];
    let calls = 0;
    registerJob('fdic-institutions', (env) => {
      calls += 1;
      seen.push(env['MARK'] ?? '');
      if (calls === 1) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve();
    });
    await runScheduled('fdic-institutions', { MARK: 'a' }, () => undefined);
    expect(calls).toBe(2);
    expect(seen).toEqual(['a', 'a']);
  });

  it('refuses a second registration of the same source', () => {
    registerJob('fdic-institutions', () => Promise.resolve());
    expect(() => {
      registerJob('fdic-institutions', () => Promise.resolve());
    }).toThrow('source fdic-institutions is already registered');
    expect(() => {
      registerJob('bank-rates', () => Promise.resolve());
    }).toThrow('register banks with registerBank');
  });

  it('runs registered banks one at a time', async () => {
    const gate: { resolve: () => void } = { resolve: () => undefined };
    const pending = new Promise<void>((resolve) => {
      gate.resolve = () => {
        resolve();
      };
    });
    let started = 0;
    registerBank('bank:a', async () => {
      started += 1;
      await pending;
    });
    registerBank('bank:b', () => {
      started += 1;
      return Promise.resolve();
    });
    const running = runScheduled(
      'bank-rates',
      { FA_SCRAPE_MAILBOX: 'ops@fin-aggr.example' },
      () => undefined,
    );
    expect(started).toBe(1);
    gate.resolve();
    await running;
    expect(started).toBe(2);
  });

  it('runs the follow-up after a bank failure, on the same session', async () => {
    let scrape: object | undefined;
    let followed = false;
    registerBank('bank:a', (_env, session) => {
      scrape = session;
      return Promise.reject(new Error('validation'));
    });
    registerAfterBanks((_env, session) => {
      followed = session === scrape;
      return Promise.resolve();
    });
    await expect(
      runScheduled('bank-rates', { FA_SCRAPE_MAILBOX: 'ops@fin-aggr.example' }, () => undefined),
    ).rejects.toThrow('bank-rates failed 1: validation');
    expect(followed).toBe(true);
  });

  it('logs a failed follow-up and still succeeds when the banks succeeded', async () => {
    const lines: string[] = [];
    registerBank('bank:a', () => Promise.resolve());
    registerAfterBanks(() => Promise.reject(new Error('headers_overflow')));
    await expect(
      runScheduled('bank-rates', { FA_SCRAPE_MAILBOX: 'ops@fin-aggr.example' }, (line) =>
        lines.push(line),
      ),
    ).resolves.toBeUndefined();
    expect(lines).toContain('source bank-rates followup failed');
  });

  it('rejects a bank id that is not a source id', () => {
    expect(() => {
      registerBank('ally', () => Promise.resolve());
    }).toThrow('unknown source ally');
  });

  it('refuses registered banks when the project mailbox is missing', async () => {
    registerBank('bank:a', () => Promise.resolve());
    await expect(runScheduled('bank-rates', {}, () => undefined)).rejects.toThrow(
      /FA_SCRAPE_MAILBOX/,
    );
  });

  it('runs banks one at a time and continues after a failure', async () => {
    const order: string[] = [];
    await runOneAtATime([
      () => {
        order.push('first');
        return Promise.resolve();
      },
      () => {
        order.push('second');
        return Promise.resolve();
      },
    ]);
    expect(order).toEqual(['first', 'second']);

    const seen: string[] = [];
    const failure = runOneAtATime([
      () => {
        seen.push('first');
        return Promise.reject(new Error('validation'));
      },
      () => {
        seen.push('second');
        return Promise.resolve();
      },
    ]);
    await expect(failure).rejects.toThrow('bank-rates failed 1: validation');
    expect(seen).toEqual(['first', 'second']);
  });
});

describe('ingest run command', () => {
  afterEach(() => {
    resetJobs();
  });

  it('requires one source id', async () => {
    await expect(main([], {}, () => undefined)).rejects.toThrow('usage: ingest:run <source-id>');
    await expect(main(['a', 'b'], {}, () => undefined)).rejects.toThrow(
      'usage: ingest:run <source-id>',
    );
  });

  it('keeps the CI smoke run on a source that is not ready', () => {
    const text = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const match = /pnpm ingest:run (\S+)/.exec(text);
    const id = match?.[1] ?? '';
    expect(scheduleById(id)?.ready).toBeUndefined();
  });

  it('logs pending for a known source', async () => {
    const lines: string[] = [];
    await main(['tax-tables'], {}, (line) => lines.push(line));
    expect(lines).toEqual(['source tax-tables pending']);
  });
});
