// ~40 fictional institutions. Names come from word lists; no real bank names, example.com only.
import type { Institution } from '@fa/contracts';
import { STATE_CODES, mockProvenance } from './common';
import type { Rng } from './prng';

const PREFIXES = [
  'Harbor',
  'Pinecrest',
  'Ironwood',
  'Silverlake',
  'Bluestone',
  'Meadowline',
  'Northgate',
  'Cedar Ridge',
  'Lantern',
  'Granite',
  'Willowbrook',
  'Summit Trail',
  'Copperfield',
  'Redwood Hollow',
  'Clearwater',
  'Oakmont',
  'Brightwater',
  'Stonebridge',
  'Maplewood',
  'Riverside',
  'Foxglove',
  'Highland',
  'Ashford',
  'Kestrel',
  'Larkspur',
  'Juniper',
  'Marigold',
  'Thistle',
  'Bramble',
  'Quarry',
  'Saltmarsh',
  'Tidewater',
  'Wrenfield',
  'Hearthstone',
  'Driftwood',
  'Elmstead',
  'Fairhaven',
  'Glenmoor',
  'Hollowell',
  'Ivybridge',
] as const;

/** Counts per kind; sums to 40. */
const BANKS = 24;
const CREDIT_UNIONS = 8;
const FINTECHS = 5;
const TREASURY_STOREFRONTS = 3;

/** Treasury storefronts are fintech_partner with no partner bank: treasuries are not deposit-insured. */
export const TREASURY_STOREFRONT_PREFIX = 'fintech:tsy-';

function uniqueNumbers(rng: Rng, count: number): number[] {
  const seen = new Set<number>();
  while (seen.size < count) seen.add(rng.int(1000, 99999));
  return [...seen];
}

const slug = (name: string): string => name.toLowerCase().replaceAll(' ', '-');

export function generateInstitutions(rng: Rng): Institution[] {
  const numbers = uniqueNumbers(rng, BANKS + CREDIT_UNIONS + FINTECHS + TREASURY_STOREFRONTS);
  const at = (i: number): { name: string; number: number } => ({
    name: PREFIXES[i] ?? `Institution ${String(i)}`,
    number: numbers[i] ?? i,
  });
  const base = (name: string) => ({
    name,
    hqState: rng.pick(STATE_CODES),
    website: `https://example.com/institutions/${slug(name)}`,
    provenance: mockProvenance('mock-institution-registry'),
  });

  const banks: Institution[] = Array.from({ length: BANKS }, (_, i) => {
    const { name, number } = at(i);
    return {
      id: `fdic:${String(number)}`,
      regulator: 'FDIC',
      kind: 'direct_bank',
      partnerInstitutionIds: [],
      ...base(`${name} Bank`),
    };
  });
  const creditUnions: Institution[] = Array.from({ length: CREDIT_UNIONS }, (_, k) => {
    const { name, number } = at(BANKS + k);
    return {
      id: `ncua:${String(number)}`,
      regulator: 'NCUA',
      kind: 'credit_union',
      partnerInstitutionIds: [],
      ...base(`${name} Credit Union`),
    };
  });
  const fintechs: Institution[] = Array.from({ length: FINTECHS }, (_, k) => {
    const { name, number } = at(BANKS + CREDIT_UNIONS + k);
    const partners = [...new Set([rng.pick(banks).id, rng.pick(banks).id])];
    return {
      id: `fintech:${String(number)}`,
      regulator: 'FDIC',
      kind: 'fintech_partner',
      partnerInstitutionIds: partners,
      ...base(`${name} Money`),
    };
  });
  const storefronts: Institution[] = Array.from({ length: TREASURY_STOREFRONTS }, (_, k) => {
    const { name, number } = at(BANKS + CREDIT_UNIONS + FINTECHS + k);
    // ponytail: regulator is meaningless for a treasury storefront; contract change deferred to E2
    return {
      id: `${TREASURY_STOREFRONT_PREFIX}${String(number)}`,
      regulator: 'FDIC',
      kind: 'fintech_partner',
      partnerInstitutionIds: [],
      ...base(`${name} Treasury Desk`),
    };
  });
  return [...banks, ...creditUnions, ...fintechs, ...storefronts];
}
