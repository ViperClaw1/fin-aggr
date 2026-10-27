import { afterEach, describe, expect, it, vi } from 'vitest';
import { gatewayContract } from './contract-suite';
import { createMockGateway, type MockGatewayOptions } from './gateway.mock';

const base: MockGatewayOptions = { seed: 20261025, latency: 'none', failureRate: 0 };

gatewayContract('mock gateway', () => createMockGateway(base));

describe('mock gateway behaviour', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is deterministic for a seed', async () => {
    const a = await createMockGateway(base).listProducts({ category: 'savings' });
    const b = await createMockGateway(base).listProducts({ category: 'savings' });
    expect(a).toEqual(b);
  });

  it('fails every request with a retryable unavailable at failure rate 1', async () => {
    const gw = createMockGateway({ ...base, failureRate: 1 });
    await expect(gw.listSources()).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('applies targeted failure scenarios', async () => {
    const gw = createMockGateway({ ...base, failures: { getProduct: 'rate_limited' } });
    await expect(gw.getProduct('prod_cd_0001')).rejects.toMatchObject({
      code: 'rate_limited',
      retryable: true,
    });
    await expect(gw.listSources()).resolves.not.toHaveLength(0);
  });

  it('simulated latency waits 150–600 ms', async () => {
    vi.useFakeTimers();
    const gw = createMockGateway({ ...base, latency: 'simulated' });
    let done = false;
    const pending = gw.listSources().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(149);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(451);
    await pending;
    expect(done).toBe(true);
  });
});
