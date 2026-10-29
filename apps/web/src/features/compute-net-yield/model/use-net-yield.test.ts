// The hook under a server render (Node, no jsdom): effects do not run there, so the engine is
// never loaded and the result is null, with or without a profile. That null is what the
// prerendered table shows (gross APY order). The ranking after the engine loads is checked by
// e2e against rankProducts on the same data (compare.spec.ts), and the order by order.test.ts.
import type { Product, Profile, TaxTables } from '@fa/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useNetYield } from './use-net-yield';

const engineLoaded = vi.fn();
vi.mock('@fa/engine', () => {
  engineLoaded();
  return { rankProducts: vi.fn() };
});

const products = [{ id: 'prod_a' }] as unknown as Product[];
const tables = { taxYear: 2026 } as unknown as TaxTables;

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
  it('is null before the engine has loaded, and the render does not load it', () => {
    expect(run({ stateCode: 'NY' } as unknown as Profile)).toBeNull();
    expect(run(null)).toBeNull();
    expect(engineLoaded).not.toHaveBeenCalled();
  });
});
