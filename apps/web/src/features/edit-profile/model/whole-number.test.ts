import { describe, expect, it } from 'vitest';
import { parseWholeNumber } from './whole-number';

describe('parseWholeNumber', () => {
  it('reads digits, spaces around them allowed', () => {
    expect(parseWholeNumber(' 42 ')).toEqual({ ok: true, value: 42 });
  });
  it('treats empty text as a cleared field', () => {
    expect(parseWholeNumber('  ')).toEqual({ ok: true, value: null });
  });
  it.each(['4.5', '-1', '1e2', '12a', '1000'])('rejects %s', (text) => {
    expect(parseWholeNumber(text)).toEqual({ ok: false });
  });
});
