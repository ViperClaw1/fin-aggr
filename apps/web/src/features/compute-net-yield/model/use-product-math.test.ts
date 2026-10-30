// Server render: effects do not run, so the engine never loads and both results stay null.
// That null is what the prerendered product page shows. The calculation after load is e2e.
import type { Product, Profile, TaxTables } from '@fa/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useProductMath } from './use-product-math';

const engineLoaded = vi.fn();
vi.mock('@fa/engine', () => {
  engineLoaded();
  return {};
});

const product = { id: 'prod_a' } as unknown as Product;
const tables = { taxYear: 2026 } as unknown as TaxTables;

function run(profile: Profile | null): unknown {
  let result: unknown;
  function Probe() {
    result = useProductMath(product, {}, profile, tables);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

describe('useProductMath', () => {
  it('is empty before the engine has loaded, and the render does not load it', () => {
    expect(run({ stateCode: 'NY' } as unknown as Profile)).toEqual({
      eligibility: null,
      net: null,
    });
    expect(run(null)).toEqual({ eligibility: null, net: null });
    expect(engineLoaded).not.toHaveBeenCalled();
  });
});
