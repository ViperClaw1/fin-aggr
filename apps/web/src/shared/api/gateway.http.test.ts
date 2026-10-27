import { IsoDate, type DataGateway } from '@fa/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpGateway } from './gateway.http';

// Spec §4 contract test 5.
describe('http gateway', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['listInstitutions', () => httpGateway.listInstitutions({})],
    ['getInstitution', () => httpGateway.getInstitution('fdic:1')],
    ['getBankMetrics', () => httpGateway.getBankMetrics('fdic:1', IsoDate.parse('2026-01-01'))],
    ['listProducts', () => httpGateway.listProducts({ category: 'cd' })],
    ['getProduct', () => httpGateway.getProduct('prod_cd_0001')],
    ['getDocument', () => httpGateway.getDocument('doc_01')],
    ['listFacts', () => httpGateway.listFacts({ documentId: 'doc_01' })],
    ['getTaxTables', () => httpGateway.getTaxTables(2026)],
    ['getInsuranceRules', () => httpGateway.getInsuranceRules()],
    ['listSources', () => httpGateway.listSources()],
    ['listSponsored', () => httpGateway.listSponsored('compare_top')],
  ];

  it('covers all 11 DataGateway methods', () => {
    expect(new Set(calls.map(([name]) => name))).toEqual(new Set(Object.keys(httpGateway)));
  });

  it.each(calls)('%s rejects with not_implemented', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: 'not_implemented', retryable: false });
  });
});

// AC-9: the data source is chosen by NEXT_PUBLIC_DATA_SOURCE.
describe('getGateway data source switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function gatewayFor(source: string): Promise<DataGateway> {
    vi.stubEnv('NEXT_PUBLIC_DATA_SOURCE', source);
    vi.resetModules();
    const { getGateway } = await import('./index');
    return getGateway();
  }

  it('http selects the stub that rejects with not_implemented', async () => {
    const gateway = await gatewayFor('http');
    await expect(gateway.listSources()).rejects.toMatchObject({ code: 'not_implemented' });
  });

  it('mock selects the fixture gateway', async () => {
    const gateway = await gatewayFor('mock');
    await expect(gateway.listSources()).resolves.not.toHaveLength(0);
  });
});
