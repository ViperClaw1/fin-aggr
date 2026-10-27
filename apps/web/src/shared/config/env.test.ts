import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('defaults to mock data, the default seed and no failures', () => {
    expect(readEnv({})).toEqual({ dataSource: 'mock', seed: 20261025, mockFailureRate: 0 });
  });
  it('reads explicit values', () => {
    const env = readEnv({
      NEXT_PUBLIC_DATA_SOURCE: 'http',
      NEXT_PUBLIC_FA_SEED: '42',
      NEXT_PUBLIC_MOCK_FAILURE_RATE: '0.25',
    });
    expect(env).toEqual({ dataSource: 'http', seed: 42, mockFailureRate: 0.25 });
  });
  it.each([
    { NEXT_PUBLIC_DATA_SOURCE: 'rest' },
    { NEXT_PUBLIC_FA_SEED: '-1' },
    { NEXT_PUBLIC_FA_SEED: '1.5' },
    { NEXT_PUBLIC_MOCK_FAILURE_RATE: '2' },
    { NEXT_PUBLIC_MOCK_FAILURE_RATE: 'half' },
  ])('fails fast on %o', (raw) => {
    expect(() => readEnv(raw)).toThrow();
  });
});
