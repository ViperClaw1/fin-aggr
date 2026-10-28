import { GatewayError, type DataGateway } from '@fa/contracts';
import { hashKey } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { productQuery, productsQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('product queries', () => {
  it('a list key is the same with and without the default limit', () => {
    expect(productsQuery({ category: 'cd' }).queryKey).toEqual(
      productsQuery({ category: 'cd', limit: 100 }).queryKey,
    );
  });
  it('an optional field set to undefined hashes like an absent one (D1 hydration relies on it)', () => {
    expect(hashKey(productsQuery({ category: 'cd', institutionId: undefined }).queryKey)).toBe(
      hashKey(productsQuery({ category: 'cd' }).queryKey),
    );
  });
  it('different categories get different keys', () => {
    expect(productsQuery({ category: 'cd' }).queryKey).not.toEqual(
      productsQuery({ category: 'savings' }).queryKey,
    );
  });
  it('fetches a page and a product through the gateway', async () => {
    install('listProducts');
    const page = await client().query(productsQuery({ category: 'savings' }));
    const first = page.items[0]!;
    expect(page.items.every((p) => p.category === 'savings')).toBe(true);
    expect((await client().query(productQuery(first.id))).id).toBe(first.id);
  });
  it('not_found arrives as a GatewayError and is not retried', async () => {
    const spy = install('getProduct');
    await expect(client().query(productQuery('prod_missing'))).rejects.toBeInstanceOf(GatewayError);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('unavailable is retried twice before it surfaces', async () => {
    const spy = install('listProducts', { listProducts: 'unavailable' });
    await expect(client().query(productsQuery({ category: 'cd' }))).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
