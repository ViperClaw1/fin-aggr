import { GatewayError } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { backoff, shouldRetry } from './query-client';

const retryable = new GatewayError('unavailable', 'down', true);
const final = new GatewayError('not_found', 'gone', false);

describe('retry policy', () => {
  it('retries a retryable gateway error twice, then stops', () => {
    expect([0, 1, 2].map((n) => shouldRetry(n, retryable))).toEqual([true, true, false]);
  });
  it('never retries a non-retryable gateway error or a foreign error', () => {
    expect([shouldRetry(0, final), shouldRetry(0, new Error('bug'))]).toEqual([false, false]);
  });
  it('backs off 1 s, 2 s, 4 s and caps at 8 s', () => {
    expect([0, 1, 2, 3, 4].map(backoff)).toEqual([1000, 2000, 4000, 8000, 8000]);
  });
});
