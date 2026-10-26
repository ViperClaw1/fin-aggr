import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Id, IsoDate, IsoDateTime } from './primitives';
import { fact, Provenance } from './provenance';

const base = {
  sourceId: 'fdic:628',
  sourceUrl: 'https://example.com/rates',
  retrievedAt: '2026-10-26T12:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
};

describe('IsoDate', () => {
  it.each(['2026-10-26', '2024-02-29', '2026-12-31'])('accepts %s', (s) => {
    expect(IsoDate.safeParse(s).success).toBe(true);
  });
  it.each(['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '26-10-26'])(
    'rejects %s',
    (s) => {
      expect(IsoDate.safeParse(s).success).toBe(false);
    },
  );
});

describe('IsoDateTime', () => {
  it.each(['2026-10-26T12:00:00Z', '2026-10-26T12:00:00+02:00', '2026-10-26T12:00:00.123Z'])(
    'accepts %s',
    (s) => {
      expect(IsoDateTime.safeParse(s).success).toBe(true);
    },
  );
  it.each(['2026-10-26T12:00:00', '2026-10-26', '2026-02-31T12:00:00Z'])('rejects %s', (s) => {
    expect(IsoDateTime.safeParse(s).success).toBe(false);
  });
});

describe('Id', () => {
  it.each(['fdic:628', 'prod_cd_0042', 'A1'])('accepts %s', (s) => {
    expect(Id.safeParse(s).success).toBe(true);
  });
  it.each(['', ':x', 'has space', 'a'.repeat(65)])('rejects %j', (s) => {
    expect(Id.safeParse(s).success).toBe(false);
  });
});

describe('Provenance', () => {
  it('accepts an unverified mock source without a document', () => {
    expect(Provenance.safeParse(base).success).toBe(true);
  });
  it('accepts a verified source with a document citation', () => {
    const verified = {
      ...base,
      document: { id: 'doc_1', page: 3, quote: 'Penalty: 90 days of interest.' },
      verification: { status: 'verified', verifiedAt: '2026-10-20', by: 'human' },
    };
    expect(Provenance.safeParse(verified).success).toBe(true);
  });
  it('rejects verified without verifiedAt', () => {
    const bad = { ...base, verification: { status: 'verified', by: 'human' } };
    expect(Provenance.safeParse(bad).success).toBe(false);
  });
  it('rejects extra keys at every level', () => {
    expect(Provenance.safeParse({ ...base, commission: 1 }).success).toBe(false);
    const nested = { ...base, verification: { status: 'unverified', note: 'x' } };
    expect(Provenance.safeParse(nested).success).toBe(false);
  });
  it('rejects a quote longer than 400 characters and page 0', () => {
    const longQuote = { ...base, document: { id: 'd', page: 1, quote: 'x'.repeat(401) } };
    const pageZero = { ...base, document: { id: 'd', page: 0, quote: 'q' } };
    expect(Provenance.safeParse(longQuote).success).toBe(false);
    expect(Provenance.safeParse(pageZero).success).toBe(false);
  });
});

describe('fact()', () => {
  const RateFact = fact(z.string());
  it('requires both value and provenance', () => {
    expect(RateFact.safeParse({ value: '0.04', provenance: base }).success).toBe(true);
    expect(RateFact.safeParse({ value: '0.04' }).success).toBe(false);
  });
  it('rejects extra keys', () => {
    expect(RateFact.safeParse({ value: '0.04', provenance: base, x: 1 }).success).toBe(false);
  });
});
