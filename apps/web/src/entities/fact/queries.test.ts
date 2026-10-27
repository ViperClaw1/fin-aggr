import { GatewayError, type DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { factsQuery, sourcesQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('fact queries', () => {
  it('a facts key does not depend on property order', () => {
    expect(factsQuery({ documentId: 'doc_1', productId: 'p' }).queryKey).toEqual(
      factsQuery({ productId: 'p', documentId: 'doc_1' }).queryKey,
    );
  });
  it('fetches the source registry', async () => {
    install('listSources');
    const sources = await client().query(sourcesQuery());
    expect(sources.map((s) => s.id)).toContain('insurance-limit-reference');
  });
  it('an invalid query arrives as validation_failed and is not retried', async () => {
    const spy = install('listFacts');
    await expect(client().query(factsQuery({}))).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('rate_limited is retried twice before it surfaces', async () => {
    const spy = install('listSources', { listSources: 'rate_limited' });
    await expect(client().query(sourcesQuery())).rejects.toBeInstanceOf(GatewayError);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
