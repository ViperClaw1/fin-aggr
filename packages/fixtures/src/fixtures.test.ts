// Spec §4 contract test 1 (beyond schema parsing in generate.test.ts), AC-5, volumes, references
// and variant coverage that E2 relies on.
import { ruleDepth, STAGE1_CATEGORIES, type Provenance, type Rule } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateFixtures, TREASURY_STOREFRONT_PREFIX } from './index';

const f = generateFixtures(DEFAULT_SEED);
const byId = <T extends { id: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((i) => [i.id, i]));
const institutions = byId(f.institutions);
const products = byId(f.products);
const documents = byId(f.documents);
const isStorefront = (id: string): boolean => id.startsWith(TREASURY_STOREFRONT_PREFIX);

/** Every Provenance object anywhere in a value. */
function provenances(value: unknown, out: Provenance[] = []): Provenance[] {
  if (Array.isArray(value)) for (const v of value) provenances(v, out);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'provenance') out.push(v as Provenance);
      else provenances(v, out);
    }
  }
  return out;
}

function ruleOps(rule: Rule, out = new Set<string>()): Set<string> {
  out.add(rule.op);
  if (rule.op === 'and' || rule.op === 'or') for (const a of rule.args) ruleOps(a, out);
  if (rule.op === 'not') ruleOps(rule.arg, out);
  return out;
}

/** FNV-1a 32-bit, to pin the whole data set without storing a snapshot file. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('volumes (spec §4 mock gateway)', () => {
  it('has 40 institutions, 8 documents and 40 facts', () => {
    expect([f.institutions.length, f.documents.length, f.facts.length]).toEqual([40, 8, 40]);
  });
  it('has 120 products: 60 CD, 40 savings, 20 treasury, all stage 1 categories', () => {
    const count = (c: string): number => f.products.filter((p) => p.category === c).length;
    expect(STAGE1_CATEGORIES.map(count)).toEqual([60, 40, 20]);
    expect(f.products).toHaveLength(120);
  });
  it('ids are unique in every collection', () => {
    const collections: readonly (readonly { id: string }[])[] = [
      f.institutions,
      f.products,
      f.documents,
      f.facts,
      f.sources,
      f.sponsored,
    ];
    for (const items of collections) {
      expect(byId(items).size).toBe(items.length);
    }
  });
});

describe('references resolve', () => {
  it('products point at existing institutions; treasuries only at storefronts', () => {
    for (const p of f.products) {
      expect(institutions.has(p.institutionId)).toBe(true);
      expect(isStorefront(p.institutionId)).toBe(p.category === 'treasury');
    }
  });
  it('fintechs have insured partners; storefronts have none', () => {
    for (const i of f.institutions.filter((x) => x.kind === 'fintech_partner')) {
      expect(i.partnerInstitutionIds.length > 0).toBe(!isStorefront(i.id));
      for (const id of i.partnerInstitutionIds) {
        // partners are never fintechs, so partnership cannot form a cycle
        expect(institutions.get(id)?.kind).toMatch(/^(direct_bank|credit_union)$/);
      }
    }
    for (const i of f.institutions.filter((x) => x.kind !== 'fintech_partner')) {
      expect(i.partnerInstitutionIds).toEqual([]);
    }
  });
  it('documents, facts and citations point at existing records and pages', () => {
    for (const d of f.documents)
      expect(institutions.has(d.publisherInstitutionId ?? '')).toBe(true);
    for (const fact of f.facts) {
      const doc = documents.get(fact.documentId);
      expect(doc).toBeDefined();
      expect(fact.page).toBeLessThanOrEqual(doc?.pages ?? 0);
      expect(fact.productId === null || products.has(fact.productId)).toBe(true);
    }
    for (const p of provenances(f)) {
      if (p.document === undefined) continue;
      expect(p.document.page).toBeLessThanOrEqual(documents.get(p.document.id)?.pages ?? 0);
    }
  });
  it('every provenance names a registered source', () => {
    const sourceIds = new Set(f.sources.map((s) => s.id));
    for (const p of provenances(f)) expect(sourceIds).toContain(p.sourceId);
  });
  it('bank metrics exist only for insured institutions', () => {
    for (const m of f.bankMetrics) {
      expect(institutions.get(m.institutionId)?.kind).not.toBe('fintech_partner');
    }
  });
});

describe('AC-5: mocks are never presented as data', () => {
  it('everything is isMock except reference constants, which stay unverified', () => {
    const all = provenances(f);
    expect(all.length).toBeGreaterThan(300);
    for (const p of all) {
      expect(p.verification.status).toBe('unverified');
    }
    expect(all.filter((p) => !p.isMock).map((p) => p.sourceId)).toEqual([
      'insurance-limit-reference',
    ]);
  });
  it('facts are mock and documents synthetic', () => {
    expect(f.facts.every((x) => x.isMock && x.status === 'unverified')).toBe(true);
    expect(f.documents.every((d) => d.isSynthetic)).toBe(true);
  });
});

describe('variant coverage for E2', () => {
  const countBy = (key: (p: (typeof f.products)[number]) => string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const p of f.products) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    return counts;
  };
  /** Variants present, and those with fewer than two products (should be none). */
  const coverage = (counts: Map<string, number>): { variants: string[]; rare: string[] } => ({
    variants: [...counts.keys()].sort(),
    rare: [...counts].filter(([, n]) => n < 2).map(([k]) => k),
  });
  const expected = (...variants: string[]): { variants: string[]; rare: string[] } => ({
    variants: variants.sort(),
    rare: [],
  });

  it('covers every penalty kind, compounding and tier mode', () => {
    expect(coverage(countBy((p) => p.earlyWithdrawal.value.kind))).toEqual(
      expected('none', 'days_of_interest', 'months_of_interest', 'percent_of_principal'),
    );
    expect(coverage(countBy((p) => p.compounding))).toEqual(
      expected('daily', 'monthly', 'quarterly', 'semiannual', 'annual', 'at_maturity'),
    );
    expect(coverage(countBy((p) => p.tierMode))).toEqual(expected('whole_balance', 'marginal'));
  });
  it('uses every tax treatment (federal_exempt on two synthetic CDs, E2 decision 6)', () => {
    expect(coverage(countBy((p) => p.taxTreatment))).toEqual(
      expected('taxable', 'state_local_exempt', 'federal_exempt'),
    );
  });
  it('rules use every operator, nested at least three levels', () => {
    const ops = new Set<string>();
    for (const p of f.products) ruleOps(p.eligibility, ops);
    expect([...ops].sort()).toEqual(['and', 'eq', 'gte', 'in', 'lte', 'neq', 'not', 'or']);
    expect(Math.max(...f.products.map((p) => ruleDepth(p.eligibility)))).toBeGreaterThanOrEqual(3);
  });
  it('has single- and multi-tier products', () => {
    const tierCounts = new Set(f.products.map((p) => p.tiers.length));
    expect(tierCounts.has(1) && [...tierCounts].some((n) => n > 1)).toBe(true);
  });
});

describe('stability', () => {
  it('the default data set does not change by accident', () => {
    // Update only on a deliberate fixture change, and say why in the commit message.
    expect(fnv1a(JSON.stringify(f))).toBe('00c9375e');
  });
});
