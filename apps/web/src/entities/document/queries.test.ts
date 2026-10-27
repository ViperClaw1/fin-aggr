import { GatewayError, type DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { documentQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('document queries', () => {
  it('keys differ by id', () => {
    expect(documentQuery('doc_a').queryKey).not.toEqual(documentQuery('doc_b').queryKey);
  });
  it('not_found arrives as a GatewayError and is not retried', async () => {
    const spy = install('getDocument');
    await expect(client().query(documentQuery('doc_missing'))).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('unavailable is retried twice before it surfaces', async () => {
    const spy = install('getDocument', { getDocument: 'unavailable' });
    await expect(client().query(documentQuery('doc_a'))).rejects.toBeInstanceOf(GatewayError);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
