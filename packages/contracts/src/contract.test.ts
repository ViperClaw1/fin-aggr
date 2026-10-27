// Spec §4 contract tests 2 and 3: no commercial keys in organic schemas (ADR-006),
// no Profile fields in request schemas (ADR-004). Walks zod 4 definitions recursively.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Assumption, CalcStep } from './calc';
import { BankMetrics, DocumentMeta, FactRecord, Institution, Product, RateTier } from './entities';
import { Profile, ProfileDraft } from './profile';
import { Provenance } from './provenance';
import { FactQuery, InstitutionQuery, ProductQuery } from './queries';
import { InsuranceRules, SourceRegistryEntry, TaxTables } from './reference';
import { Rule } from './rules';

interface Def {
  type: string;
  [key: string]: unknown;
}
const defOf = (schema: z.ZodType): Def => schema._zod.def as unknown as Def;
const isSchema = (v: unknown): v is z.ZodType => v instanceof z.ZodType;

const WRAPPER_FIELDS = ['element', 'innerType', 'in', 'out', 'left', 'right', 'valueType'];

/** Keys a definition declares itself: object shape keys and enum keys of a record. */
function ownKeys(def: Def): string[] {
  if (def.type === 'object') return Object.keys(def['shape'] as object);
  const keyType = def['keyType'];
  if (def.type === 'record' && isSchema(keyType) && defOf(keyType).type === 'enum') {
    return Object.keys(defOf(keyType)['entries'] as object);
  }
  return [];
}

/** Sub-schemas of a definition: shape values, wrapped types, union options, lazy targets. */
function childrenOf(def: Def): unknown[] {
  if (def.type === 'object') return Object.values(def['shape'] as object);
  if (def.type === 'lazy') return [(def['getter'] as () => unknown)()];
  const options = Array.isArray(def['options']) ? (def['options'] as unknown[]) : [];
  return [...WRAPPER_FIELDS.map((f) => def[f]), ...options];
}

/** Every object key reachable from `schema`, including enum keys of records. */
function collectKeys(
  schema: z.ZodType,
  keys = new Set<string>(),
  seen = new Set<z.ZodType>(),
): Set<string> {
  if (seen.has(schema)) return keys;
  seen.add(schema);
  const def = defOf(schema);
  for (const key of ownKeys(def)) keys.add(key);
  for (const child of childrenOf(def)) if (isSchema(child)) collectKeys(child, keys, seen);
  return keys;
}

const COMMERCIAL = /sponsor|commission|payout|affiliate|cpa|cpc/i;
const ORGANIC = {
  Institution,
  BankMetrics,
  RateTier,
  Product,
  DocumentMeta,
  FactRecord,
  TaxTables,
  InsuranceRules,
  SourceRegistryEntry,
  Provenance,
  Rule,
  CalcStep,
  Assumption,
};
const REQUESTS = { InstitutionQuery, ProductQuery, FactQuery };
const commercialKeys = (schema: z.ZodType): string[] =>
  [...collectKeys(schema)].filter((k) => COMMERCIAL.test(k));

describe('the key walker', () => {
  it('reaches nested objects, unions, records, lazy rules and fact()', () => {
    const keys = collectKeys(Product);
    for (const deep of [
      'minBalance',
      'kind',
      'months',
      'quote',
      'verifiedAt',
      'args',
      'arg',
      'values',
    ]) {
      expect(keys).toContain(deep);
    }
    expect(collectKeys(BankMetrics)).toContain('tier1LeverageRatio');
  });

  it('catches a commercial key hidden deep in a copy of a schema', () => {
    expect(commercialKeys(Institution.extend({ commission: z.number() }))).toEqual(['commission']);
    const nested = z.strictObject({
      tiers: z.array(z.lazy(() => z.strictObject({ payoutRate: z.string().optional() }))),
    });
    expect(commercialKeys(nested)).toEqual(['payoutRate']);
  });
});

describe('organic schemas have no commercial keys (ADR-006)', () => {
  it.each(Object.entries(ORGANIC))('%s', (_name, schema) => {
    expect(commercialKeys(schema)).toEqual([]);
  });
});

describe('request schemas carry no Profile fields (ADR-004)', () => {
  const profileKeys = collectKeys(Profile);

  it('Profile keys include the nested scenario', () => {
    expect([...profileKeys]).toEqual(
      expect.arrayContaining([...Object.keys(Profile.shape), 'principal']),
    );
  });

  it('ProfileDraft keys are a subset of Profile keys, so this check covers drafts too', () => {
    expect([...collectKeys(ProfileDraft)].filter((k) => !profileKeys.has(k))).toEqual([]);
  });

  it.each(Object.entries(REQUESTS))('%s', (_name, schema) => {
    const leaked = [...collectKeys(schema)].filter((k) => profileKeys.has(k));
    expect(leaked).toEqual([]);
  });
});
