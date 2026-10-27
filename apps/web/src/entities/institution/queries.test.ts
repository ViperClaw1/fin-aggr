import { GatewayError, IsoDate, type DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { bankMetricsQuery, institutionQuery, institutionsQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('institution queries', () => {
  it('a list key is the same with and without the default limit', () => {
    expect(institutionsQuery({}).queryKey).toEqual(institutionsQuery({ limit: 25 }).queryKey);
  });
  it('metrics with and without asOf get different keys', () => {
    expect(bankMetricsQuery('fdic:1').queryKey).not.toEqual(
      bankMetricsQuery('fdic:1', IsoDate.parse('2026-09-30')).queryKey,
    );
  });
  it('fetches a page, an institution and its metrics', async () => {
    install('listInstitutions');
    const page = await client().query(institutionsQuery({ kind: 'direct_bank' }));
    const id = page.items[0]!.id;
    expect((await client().query(institutionQuery(id))).id).toBe(id);
    expect((await client().query(bankMetricsQuery(id))).institutionId).toBe(id);
  });
  it('not_found arrives as a GatewayError and is not retried', async () => {
    const spy = install('getInstitution');
    await expect(client().query(institutionQuery('fdic:missing'))).rejects.toBeInstanceOf(
      GatewayError,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('unavailable is retried twice before it surfaces', async () => {
    const spy = install('getBankMetrics', { getBankMetrics: 'unavailable' });
    await expect(client().query(bankMetricsQuery('fdic:1'))).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
