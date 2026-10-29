// The hook under a server render (Node, no jsdom): useDeferredValue gives the value as is there.
// rankProducts is replaced: its order is the engine's to test (golden cases); here we check that
// the hook passes the same products, profile and tables and returns the engine's order unchanged.
// Real fixtures are out of reach on purpose: this slice may not import shared/api (ADR-004).
import type { Product, Profile, TaxTables } from '@fa/contracts';
import { rankProducts, type RankedProduct } from '@fa/engine';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useNetYield } from './use-net-yield';

vi.mock('@fa/engine', () => ({ rankProducts: vi.fn() }));

const products = [{ id: 'prod_a' }, { id: 'prod_b' }] as unknown as Product[];
const tables = { taxYear: 2026 } as unknown as TaxTables;
const profile = { stateCode: 'NY' } as unknown as Profile;

function run(p: Profile | null): unknown {
  let result: unknown;
  function Probe() {
    result = useNetYield(products, p, tables);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

describe('useNetYield', () => {
  it('is null without a complete profile and does not rank: the table uses gross APY', () => {
    vi.mocked(rankProducts).mockClear();
    expect(run(null)).toBeNull();
    expect(rankProducts).not.toHaveBeenCalled();
  });
  it('returns the rankProducts order for the same products, profile and tables', () => {
    const order = [{ productId: 'prod_b' }, { productId: 'prod_a' }] as unknown as RankedProduct[];
    vi.mocked(rankProducts).mockReturnValue(order);
    expect(run(profile)).toBe(order);
    expect(rankProducts).toHaveBeenCalledWith(products, profile, tables);
  });
});
