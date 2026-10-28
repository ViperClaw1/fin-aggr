import { describe, expect, it, vi } from 'vitest';
import { lazyOnce } from './lazy-once';

describe('lazyOnce', () => {
  it('shares one success, and retries after a failure instead of caching it', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('ChunkLoadError'))
      .mockResolvedValue('module');
    const get = lazyOnce(load);
    await expect(get()).rejects.toThrow('ChunkLoadError');
    expect([await get(), await get()]).toEqual(['module', 'module']);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
