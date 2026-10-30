import { describe, expect, it } from 'vitest';
import { bankIdFromParam, bankParam, bankPath } from './bank-param';

describe('bankParam', () => {
  it('round-trips an institution id through a path segment', () => {
    expect(bankParam('fdic:5821')).toBe('fdic_5821');
    expect(bankIdFromParam('fdic_5821')).toBe('fdic:5821');
    expect(bankIdFromParam('ncua_12')).toBe('ncua:12');
    expect(bankPath('ncua:12')).toBe('/banks/ncua_12');
  });

  it('leaves an id without a colon or an underscore unchanged', () => {
    expect(bankParam('no-such-bank')).toBe('no-such-bank');
    expect(bankIdFromParam(bankParam('no-such-bank'))).toBe('no-such-bank');
  });

  it('is a bijection, including when the id already contains an underscore', () => {
    const ids = ['fdic:5821', 'ncua:12', 'fdic:a_b', 'fdic_a:b', 'no-such-bank'];
    const params = ids.map(bankParam);
    expect(new Set(params).size).toBe(ids.length);
    for (const id of ids) expect(bankIdFromParam(bankParam(id))).toBe(id);
    for (const param of params) expect(bankParam(bankIdFromParam(param))).toBe(param);
    expect(bankParam('fdic:5821')).toBe('fdic_5821');
  });
});
