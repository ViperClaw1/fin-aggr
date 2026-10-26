import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SponsoredItem } from './ads';
import { GatewayError } from './gateway';
import { FactQuery, InstitutionQuery, Page, ProductQuery } from './queries';

describe('request schemas', () => {
  it('apply default limits', () => {
    expect(InstitutionQuery.parse({}).limit).toBe(25);
    expect(ProductQuery.parse({ category: 'cd' }).limit).toBe(100);
  });
  it('reject limits outside 1..100 and unknown keys', () => {
    expect(ProductQuery.safeParse({ category: 'cd', limit: 0 }).success).toBe(false);
    expect(ProductQuery.safeParse({ category: 'cd', limit: 101 }).success).toBe(false);
    expect(ProductQuery.safeParse({ category: 'cd', taxableIncome: 1 }).success).toBe(false);
    expect(InstitutionQuery.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
  });
  it('FactQuery needs documentId or productId', () => {
    expect(FactQuery.safeParse({}).success).toBe(false);
    expect(FactQuery.safeParse({ documentId: 'doc_1' }).success).toBe(true);
    expect(FactQuery.safeParse({ productId: 'prod_1' }).success).toBe(true);
  });
});

describe('Page', () => {
  const Ids = Page(z.string());
  it('wraps items with a nullable cursor and stays strict', () => {
    expect(Ids.safeParse({ items: ['a'], nextCursor: null }).success).toBe(true);
    expect(Ids.safeParse({ items: [1], nextCursor: null }).success).toBe(false);
    expect(Ids.safeParse({ items: [], nextCursor: null, total: 0 }).success).toBe(false);
  });
});

describe('GatewayError', () => {
  it('carries code and retryable', () => {
    const e = new GatewayError('unavailable', 'down', true);
    expect(e).toBeInstanceOf(Error);
    expect([e.name, e.code, e.retryable]).toEqual(['GatewayError', 'unavailable', true]);
  });
});

describe('SponsoredItem', () => {
  const item = {
    id: 'ad_1',
    placement: 'compare_top',
    advertiser: 'Example Bank',
    headline: 'Open a CD',
    body: 'Sponsored offer.',
    ctaLabel: 'Learn more',
    ctaUrl: 'https://example.com',
    disclosure: 'Sponsored. We are paid when you click.',
    compensationType: 'cpc',
  };
  it('requires a disclosure of at least 10 characters', () => {
    expect(SponsoredItem.safeParse(item).success).toBe(true);
    expect(SponsoredItem.safeParse({ ...item, disclosure: 'Ad' }).success).toBe(false);
  });
});
