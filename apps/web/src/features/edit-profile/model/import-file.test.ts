import { describe, expect, it, vi } from 'vitest';
import { MAX_IMPORT_BYTES } from '@/entities/profile';
import { importFile } from './import-file';

const fileOf = (size: number, text = '{}') => ({ size, text: vi.fn(() => Promise.resolve(text)) });

describe('importFile', () => {
  it('rejects a file over the limit without reading it', async () => {
    const file = fileOf(MAX_IMPORT_BYTES + 1);
    expect(await importFile(file)).toEqual({ ok: false, error: 'too_large', issues: [] });
    expect(file.text).not.toHaveBeenCalled();
  });
  it('parses a file at the limit', async () => {
    const parse = vi.fn(() => Promise.resolve({ ok: true as const, draft: {} }));
    expect(await importFile(fileOf(MAX_IMPORT_BYTES, 'x'), parse)).toEqual({ ok: true, draft: {} });
    expect(parse).toHaveBeenCalledWith('x');
  });
  it('passes a broken file on to the parser, which rejects it', async () => {
    expect((await importFile(fileOf(5, 'nope{'))).ok).toBe(false);
  });
});
