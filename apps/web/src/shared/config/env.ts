// The only place that reads process.env. Values are public (NEXT_PUBLIC_*) and inlined at build
// time, so the server and the browser generate the same fixtures (no hydration mismatch).

type DataSource = 'mock' | 'http';

export interface Env {
  dataSource: DataSource;
  /** Seed of the mock data set. */
  seed: number;
  /** Share of mock requests that fail with `unavailable`, 0..1. */
  mockFailureRate: number;
  /** Origin for canonical links and Open Graph URLs, no trailing slash. */
  siteUrl: string;
}

const DEFAULT_SEED = 20261025;
const DEFAULT_SITE_URL = 'https://fin-aggr.vercel.app';

interface RawEnv {
  NEXT_PUBLIC_DATA_SOURCE?: string | undefined;
  NEXT_PUBLIC_FA_SEED?: string | undefined;
  NEXT_PUBLIC_MOCK_FAILURE_RATE?: string | undefined;
  NEXT_PUBLIC_SITE_URL?: string | undefined;
}

/** Trimmed value, `undefined` when unset or blank; throws when set but malformed. */
function checked(
  raw: RawEnv,
  name: keyof RawEnv,
  pattern: RegExp,
  hint: string,
): string | undefined {
  const value = raw[name]?.trim();
  if (value === undefined || value === '') return undefined;
  if (!pattern.test(value)) throw new Error(`${name} must be ${hint}, got "${value}"`);
  return value;
}

/** Parses raw variables; an invalid value throws at startup instead of misbehaving later. */
export function readEnv(raw: RawEnv): Env {
  const source = checked(raw, 'NEXT_PUBLIC_DATA_SOURCE', /^(mock|http)$/, '"mock" or "http"');
  const seed = checked(raw, 'NEXT_PUBLIC_FA_SEED', /^\d{1,9}$/, 'a non-negative integer');
  const rate = checked(raw, 'NEXT_PUBLIC_MOCK_FAILURE_RATE', /^(0(\.\d+)?|1(\.0+)?)$/, '0..1');
  const site = checked(raw, 'NEXT_PUBLIC_SITE_URL', /^https?:\/\/[^/\s]+$/, 'an origin');
  return {
    siteUrl: site ?? DEFAULT_SITE_URL,
    dataSource: source === 'http' ? 'http' : 'mock',
    seed: seed === undefined ? DEFAULT_SEED : Number(seed),
    // a probability for mock failure injection, not money
    mockFailureRate: rate === undefined ? 0 : Number(rate),
  };
}

/** Dev-only routes (the component stand, spec §6 rule 7) answer 404 when this is true. */
export const isProduction = process.env.NODE_ENV === 'production';

// Dot access on each variable is required for Next's build-time inlining.
export const env: Env = readEnv({
  NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE,
  NEXT_PUBLIC_FA_SEED: process.env.NEXT_PUBLIC_FA_SEED,
  NEXT_PUBLIC_MOCK_FAILURE_RATE: process.env.NEXT_PUBLIC_MOCK_FAILURE_RATE,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
