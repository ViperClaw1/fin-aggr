import { describe, expect, it } from 'vitest';
import { bankIdFromParam, bankParam, bankPath } from './bank-param';

describe('bankParam', () => {
  it('round-trips an institution id through a path segment', () => {
    expect(bankParam('fdic:5821')).toBe('fdic_5821');
    expect(bankIdFromParam('fdic_5821')).toBe('fdic:5821');
    expect(bankIdFromParam('ncua_12')).toBe('ncua:12');
    expect(bankPath('ncua:12')).toBe('/banks/ncua_12');
  });

  it('leaves an id without a colon unchanged', () => {
    expect(bankIdFromParam(bankParam('no-such-bank'))).toBe('no-such-bank');
  });
});
