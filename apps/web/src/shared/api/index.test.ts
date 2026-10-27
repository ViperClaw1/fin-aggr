import { describe, expect, it } from 'vitest';
import { getGateway } from './index';

describe('getGateway', () => {
  it('returns one mock gateway by default that serves fixtures', async () => {
    const gateway = getGateway();
    expect(getGateway()).toBe(gateway);
    const page = await gateway.listProducts({ category: 'cd', limit: 5 });
    expect(page.items).toHaveLength(5);
    expect(page.items.every((p) => p.category === 'cd')).toBe(true);
  });
});
