import type { Id } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { issuersFor, type Issuer } from './issuers';

function issuer(id: Id, partners: readonly Id[] = []): Issuer {
  return { id, name: id, kind: 'direct_bank', partnerInstitutionIds: [...partners] };
}

describe('issuers for the products on the page', () => {
  it('loads each issuer once and adds a partner that is not itself an issuer', async () => {
    const calls: Id[] = [];
    const known = new Map<Id, Issuer>([
      ['fdic:1', issuer('fdic:1', ['fdic:2'])],
      ['fdic:2', issuer('fdic:2')],
    ]);
    const rows = await issuersFor(['fdic:1', 'fdic:1'], (id) => {
      calls.push(id);
      return Promise.resolve(known.get(id) ?? null);
    });
    expect(calls).toEqual(['fdic:1', 'fdic:2']);
    expect(rows.map((row) => row.id)).toEqual(['fdic:1', 'fdic:2']);
  });

  it('drops an issuer the gateway does not have', async () => {
    const rows = await issuersFor(['fdic:9'], () => Promise.resolve(null));
    expect(rows).toEqual([]);
  });
});
