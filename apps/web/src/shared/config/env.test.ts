import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('defaults to mock data, the default seed, no failures and the production origin', () => {
    expect(readEnv({})).toEqual({
      dataSource: 'mock',
      seed: 20261025,
      mockFailureRate: 0,
      siteUrl: 'https://fin-aggr.vercel.app',
    });
  });
  it('reads explicit values', () => {
    const env = readEnv({
      NEXT_PUBLIC_DATA_SOURCE: 'http',
      NEXT_PUBLIC_FA_SEED: '42',
      NEXT_PUBLIC_MOCK_FAILURE_RATE: '0.25',
      NEXT_PUBLIC_SITE_URL: 'https://preview.example.com',
    });
    expect(env).toEqual({
      dataSource: 'http',
      seed: 42,
      mockFailureRate: 0.25,
      siteUrl: 'https://preview.example.com',
    });
  });
  it.each([
    { NEXT_PUBLIC_DATA_SOURCE: 'rest' },
    { NEXT_PUBLIC_FA_SEED: '-1' },
    { NEXT_PUBLIC_FA_SEED: '1.5' },
    { NEXT_PUBLIC_MOCK_FAILURE_RATE: '2' },
    { NEXT_PUBLIC_MOCK_FAILURE_RATE: 'half' },
    { NEXT_PUBLIC_SITE_URL: 'fin-aggr.vercel.app' },
    { NEXT_PUBLIC_SITE_URL: 'https://fin-aggr.vercel.app/' },
  ])('fails fast on %o', (raw) => {
    expect(() => readEnv(raw)).toThrow();
  });
});
