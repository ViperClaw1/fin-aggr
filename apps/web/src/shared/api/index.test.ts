import type { DataGateway } from '@fa/contracts';
import { describe, expect, it, vi } from 'vitest';
import { gatewayContract } from './contract-suite';
import { createMockGateway } from './gateway.mock';
import { createLazyGateway, getGateway, loadGateway } from './index';

const mock = (): DataGateway =>
  createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0 });

gatewayContract('lazy gateway over the mock', () =>
  createLazyGateway(() => Promise.resolve(mock())),
);

describe('getGateway', () => {
  it('returns one gateway by default that serves fixtures', async () => {
    const gateway = getGateway();
    expect(getGateway()).toBe(gateway);
    const page = await gateway.listProducts({ category: 'cd', limit: 5 });
    expect(page.items).toHaveLength(5);
    expect(page.items.every((p) => p.category === 'cd')).toBe(true);
  });
});

describe('createLazyGateway (ADR-016 D2)', () => {
  it('forwards every DataGateway method to the loaded gateway', async () => {
    const target = mock();
    const lazy = createLazyGateway(() => Promise.resolve(target));
    expect(Object.keys(lazy).sort()).toEqual(Object.keys(target).sort());
    const spy = vi.spyOn(target, 'getTaxTables');
    await lazy.getTaxTables(2026);
    expect(spy).toHaveBeenCalledWith(2026);
  });
  it('a failed load is a retryable unavailable, and the next call loads again', async () => {
    const load = vi
      .fn<() => Promise<DataGateway>>()
      .mockRejectedValueOnce(new Error('ChunkLoadError'))
      .mockResolvedValue(mock());
    const lazy = createLazyGateway(load);
    await expect(lazy.listSources()).rejects.toMatchObject({
      name: 'GatewayError',
      code: 'unavailable',
      retryable: true,
    });
    expect((await lazy.listSources()).length).toBeGreaterThan(0);
  });
  it('keeps the real reason of a failed load in cause', async () => {
    const reason = new Error('mock config: seed is not a number');
    const lazy = createLazyGateway(() => Promise.reject(reason));
    await expect(lazy.listSources()).rejects.toMatchObject({ cause: reason });
  });
});

describe('loadGateway', () => {
  it('on the server the mock never fails, whatever the failure rate', async () => {
    const env = { dataSource: 'mock', seed: 20261025, mockFailureRate: 1 } as const;
    const gateway = await loadGateway(env, true);
    await expect(gateway.listSources()).resolves.not.toHaveLength(0);
  });
});
