import { describe, expect, it } from 'vitest';
import { isUnavailable } from './failure';
import { fetchOfficial, type FetchPace } from './official-fetch';

function pace(waits: number[]): FetchPace {
  return {
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    now: () => 0,
  };
}

function answers(statuses: number[]): { fetch: typeof fetch; calls: () => number } {
  let call = 0;
  const impl = (() => {
    const status = statuses[call] ?? statuses[statuses.length - 1] ?? 500;
    call += 1;
    return Promise.resolve(new Response(status === 200 ? 'ok' : null, { status }));
  }) as typeof fetch;
  return { fetch: impl, calls: () => call };
}

describe('official fetch refusals', () => {
  it('retries a 403 from a government host once after 30 seconds', async () => {
    const waits: number[] = [];
    const host = answers([403, 200]);
    const response = await fetchOfficial(host.fetch, 'https://www.ecfr.gov/api/x', {}, pace(waits));
    expect(response.status).toBe(200);
    expect(waits).toEqual([30_000]);
  });

  it('gives up with http_403 after the one retry', async () => {
    const host = answers([403]);
    await expect(
      fetchOfficial(host.fetch, 'https://api.fdic.gov/banks/x', {}, pace([])),
    ).rejects.toMatchObject({ message: 'http_403' });
    expect(host.calls()).toBe(2);
  });

  it('does not retry a 403 from another host', async () => {
    const host = answers([403]);
    await expect(
      fetchOfficial(host.fetch, 'https://example.com/x', {}, pace([])),
    ).rejects.toMatchObject({ message: 'http_403' });
    expect(host.calls()).toBe(1);
  });
});

describe('unavailable', () => {
  it('is a fetch refusal, never a shape or parse error', () => {
    expect(isUnavailable({ stage: 'fetch', code: 'http_403' })).toBe(true);
    expect(isUnavailable({ stage: 'fetch', code: 'http_429' })).toBe(true);
    expect(isUnavailable({ stage: 'fetch', code: 'http_503' })).toBe(false);
    expect(isUnavailable({ stage: 'parse', code: 'http_403' })).toBe(false);
    expect(isUnavailable(null)).toBe(false);
  });
});
