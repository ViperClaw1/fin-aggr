import { onceOnNetworkError } from './network';

export type Cadence =
  'daily-0700' | 'daily-2330' | 'bank-rates' | 'daily-rules' | 'weekly-monday' | 'manual-yearly';

export interface ScheduleEntry {
  id: string;
  cadence: Cadence;
  /** UTC cron. `null` is workflow_dispatch only (tax tables). */
  cron: string | null;
  workflow: string;
  timeoutMinutes: number;
}

/**
 * Cadence table from plan step 5.
 * 05:00 UTC is the daily rules pull: it misses db-contract (03:00), review age (04:00), and the 07:00 pull.
 * Monday 11:00 UTC starts after the 08:00–10:00 bank window.
 */
export const SCHEDULE: readonly ScheduleEntry[] = [
  {
    id: 'fdic-institutions',
    cadence: 'daily-0700',
    cron: '0 7 * * *',
    workflow: 'ingest-daily-0700.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'treasury-fiscal-data',
    cadence: 'daily-0700',
    cron: '0 7 * * *',
    workflow: 'ingest-daily-0700.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'treasurydirect',
    cadence: 'daily-0700',
    cron: '0 7 * * *',
    workflow: 'ingest-daily-0700.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'treasury-par-yield',
    cadence: 'daily-2330',
    cron: '30 23 * * *',
    workflow: 'ingest-daily-2330.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'bank-rates',
    cadence: 'bank-rates',
    cron: '0 8 * * *',
    workflow: 'ingest-bank-rates.yml',
    timeoutMinutes: 120,
  },
  {
    id: 'ecfr-330',
    cadence: 'daily-rules',
    cron: '0 5 * * *',
    workflow: 'ingest-daily-rules.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'ecfr-745',
    cadence: 'daily-rules',
    cron: '0 5 * * *',
    workflow: 'ingest-daily-rules.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'ecfr-328',
    cadence: 'daily-rules',
    cron: '0 5 * * *',
    workflow: 'ingest-daily-rules.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'federal-register',
    cadence: 'daily-rules',
    cron: '0 5 * * *',
    workflow: 'ingest-daily-rules.yml',
    timeoutMinutes: 15,
  },
  {
    id: 'fdic-financials',
    cadence: 'weekly-monday',
    cron: '0 11 * * 1',
    workflow: 'ingest-weekly.yml',
    timeoutMinutes: 45,
  },
  {
    id: 'ncua-5300',
    cadence: 'weekly-monday',
    cron: '0 11 * * 1',
    workflow: 'ingest-weekly.yml',
    timeoutMinutes: 45,
  },
  {
    id: 'fdic-national-rates',
    cadence: 'weekly-monday',
    cron: '0 11 * * 1',
    workflow: 'ingest-weekly.yml',
    timeoutMinutes: 45,
  },
  {
    id: 'bank-pdf-hashes',
    cadence: 'weekly-monday',
    cron: '0 11 * * 1',
    workflow: 'ingest-weekly.yml',
    timeoutMinutes: 45,
  },
  {
    id: 'tax-tables',
    cadence: 'manual-yearly',
    cron: null,
    workflow: 'ingest-tax-tables.yml',
    timeoutMinutes: 15,
  },
];

export type ScheduledJob = (env: NodeJS.ProcessEnv) => Promise<void>;

/** Same shape as `sources.id` (ADR-019). */
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;

const jobs = new Map<string, ScheduledJob>();
const banks = new Map<string, ScheduledJob>();

/** Step 6 registers a connector here. A second registration is a mistake. */
export function registerJob(id: string, job: ScheduledJob): void {
  if (id === 'bank-rates') throw new Error('register banks with registerBank');
  if (!SCHEDULE.some((row) => row.id === id)) throw new Error(`unknown source ${id}`);
  if (jobs.has(id)) throw new Error(`source ${id} is already registered`);
  jobs.set(id, job);
}

/** Step 8 registers one bank. `runScheduled('bank-rates')` runs them in registration order. */
export function registerBank(id: string, job: ScheduledJob): void {
  if (!id.startsWith('bank:') || !SOURCE_ID.test(id)) throw new Error(`unknown source ${id}`);
  if (banks.has(id)) throw new Error(`source ${id} is already registered`);
  banks.set(id, job);
}

/** Drops registered jobs. Tests use this so one file does not leak into the next. */
export function resetJobs(): void {
  jobs.clear();
  banks.clear();
}

export function scheduleById(id: string): ScheduleEntry | undefined {
  return SCHEDULE.find((row) => row.id === id);
}

/**
 * Runs one scheduled source.
 * No connector yet: log a fixed line and return. The workflow stays green until step 6.
 */
export async function runScheduled(
  id: string,
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<void> {
  if (scheduleById(id) === undefined) throw new Error(`unknown source ${id}`);
  if (id === 'bank-rates') {
    if (banks.size === 0) {
      log('source bank-rates pending');
      return;
    }
    await runOneAtATime([...banks.values()].map((job) => () => job(env)));
    return;
  }
  const job = jobs.get(id);
  if (job === undefined) {
    log(`source ${id} pending`);
    return;
  }
  await onceOnNetworkError(() => job(env));
}

/**
 * Bank rates run one after another. The next starts only after the previous settles.
 * One failure does not skip the rest. The first error is raised after the last bank.
 */
export async function runOneAtATime(runs: readonly (() => Promise<void>)[]): Promise<void> {
  let failures = 0;
  let first: unknown;
  for (const run of runs) {
    try {
      await onceOnNetworkError(run);
    } catch (error) {
      failures += 1;
      first ??= error;
    }
  }
  if (failures === 0) return;
  const message = first instanceof Error ? first.message : 'ingest failed';
  throw new Error(`bank-rates failed ${String(failures)}: ${message}`);
}
