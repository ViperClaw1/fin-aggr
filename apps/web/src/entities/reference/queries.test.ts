import { GatewayError, type DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMockGateway, type MockGatewayOptions } from '@/shared/api/gateway.mock';
import { makeQueryClient } from '@/shared/lib/query-client';
import { insuranceRulesQuery, taxTablesQuery } from './queries';

const holder = vi.hoisted(() => ({ gateway: undefined as DataGateway | undefined }));
vi.mock('@/shared/api', () => ({ getGateway: () => holder.gateway }));

const client = () => makeQueryClient({ retryDelay: 0 });
function install(method: keyof DataGateway, failures: MockGatewayOptions['failures'] = {}) {
  const gateway = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0, failures });
  holder.gateway = gateway;
  return vi.spyOn(gateway, method);
}

describe('reference queries', () => {
  it('tax table keys differ by year', () => {
    expect(taxTablesQuery(2026).queryKey).not.toEqual(taxTablesQuery(2025).queryKey);
  });
  it('fetches tax tables and insurance rules', async () => {
    install('getTaxTables');
    expect((await client().query(taxTablesQuery(2026))).taxYear).toBe(2026);
    expect((await client().query(insuranceRulesQuery())).jointOwnersAssumed).toBe(2);
  });
  it('not_found arrives as a GatewayError and is not retried', async () => {
    const spy = install('getTaxTables', { getTaxTables: 'not_found' });
    await expect(client().query(taxTablesQuery(2026))).rejects.toBeInstanceOf(GatewayError);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('unavailable is retried twice before it surfaces', async () => {
    const spy = install('getInsuranceRules', { getInsuranceRules: 'unavailable' });
    await expect(client().query(insuranceRulesQuery())).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
