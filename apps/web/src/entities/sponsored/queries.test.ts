import { GatewayError, type DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { sponsoredQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('sponsored queries', () => {
  it('keys differ by placement', () => {
    expect(sponsoredQuery('compare_top').queryKey).not.toEqual(
      sponsoredQuery('product_aside').queryKey,
    );
  });
  it('fetches the items of one placement', async () => {
    install('listSponsored');
    const items = await client().query(sponsoredQuery('compare_top'));
    expect(items.every((i) => i.placement === 'compare_top')).toBe(true);
  });
  it('not_found arrives as a GatewayError and is not retried', async () => {
    const spy = install('listSponsored', { listSponsored: 'not_found' });
    await expect(client().query(sponsoredQuery('compare_top'))).rejects.toBeInstanceOf(
      GatewayError,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('unavailable is retried twice before it surfaces', async () => {
    const spy = install('listSponsored', { listSponsored: 'unavailable' });
    await expect(client().query(sponsoredQuery('compare_top'))).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
