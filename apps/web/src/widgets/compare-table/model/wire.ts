// Compare props are the static shell (ADR-016). A product repeated as a full object is mostly the
// same source, the same penalty source and one of a handful of eligibility rules. The wire keeps
// one copy of each and stores an index per row. compounding, validFrom and validTo stay off the
// page: the row and the engine do not read them.
import type {
  Cents,
  EarlyWithdrawal,
  Id,
  IsoDateTime,
  Product,
  ProductCategory,
  Provenance,
  Rule,
} from '@fa/contracts';

export type CompareProduct = Pick<
  Product,
  | 'id'
  | 'institutionId'
  | 'category'
  | 'name'
  | 'termMonths'
  | 'tierMode'
  | 'tiers'
  | 'taxTreatment'
  | 'minOpening'
  | 'maxDeposit'
  | 'earlyWithdrawal'
  | 'eligibility'
  | 'provenance'
>;

interface SourceHead {
  sourceId: Id;
  sourceUrl: string;
  verification: Provenance['verification'];
  isMock: boolean;
}

type DocumentRef = NonNullable<Provenance['document']>;

export interface CompareWire {
  id: Id[];
  institutionId: Id[];
  name: string[];
  termMonths: (number | null)[];
  category: ProductCategory;
  tierMode: Product['tierMode'][];
  tiers: Product['tiers'][];
  taxTreatment: Product['taxTreatment'][];
  minOpening: Cents[];
  maxDeposit: (Cents | null)[];
  penalty: EarlyWithdrawal[];
  penaltyRetrievedAt: IsoDateTime[];
  penaltyDocument: (number | null)[];
  penaltySource: number[];
  rule: number[];
  apyRetrievedAt: IsoDateTime[];
  apySource: number[];
  sources: SourceHead[];
  documents: DocumentRef[];
  rules: Rule[];
}

function intern<T>(list: T[]): (value: T) => number {
  const seen = new Map<string, number>();
  return (value) => {
    const key = JSON.stringify(value);
    const hit = seen.get(key);
    if (hit !== undefined) return hit;
    const index = list.length;
    list.push(value);
    seen.set(key, index);
    return index;
  };
}

function head(p: Provenance): SourceHead {
  return {
    sourceId: p.sourceId,
    sourceUrl: p.sourceUrl,
    verification: p.verification,
    isMock: p.isMock,
  };
}

/** Column form of one category. Every product must already be that category. */
export function packCompareProducts(
  products: readonly Product[],
  category: ProductCategory,
): CompareWire {
  const sources: SourceHead[] = [];
  const documents: DocumentRef[] = [];
  const rules: Rule[] = [];
  const sourceIndex = intern(sources);
  const documentIndex = intern(documents);
  const ruleIndex = intern(rules);
  const wire: CompareWire = {
    id: [],
    institutionId: [],
    name: [],
    termMonths: [],
    category,
    tierMode: [],
    tiers: [],
    taxTreatment: [],
    minOpening: [],
    maxDeposit: [],
    penalty: [],
    penaltyRetrievedAt: [],
    penaltyDocument: [],
    penaltySource: [],
    rule: [],
    apyRetrievedAt: [],
    apySource: [],
    sources,
    documents,
    rules,
  };
  for (const p of products) {
    if (p.category !== category) throw new Error('compare wire mixes categories');
    const doc = p.earlyWithdrawal.provenance.document;
    wire.id.push(p.id);
    wire.institutionId.push(p.institutionId);
    wire.name.push(p.name);
    wire.termMonths.push(p.termMonths);
    wire.tierMode.push(p.tierMode);
    wire.tiers.push(p.tiers);
    wire.taxTreatment.push(p.taxTreatment);
    wire.minOpening.push(p.minOpening);
    wire.maxDeposit.push(p.maxDeposit);
    wire.penalty.push(p.earlyWithdrawal.value);
    wire.penaltyRetrievedAt.push(p.earlyWithdrawal.provenance.retrievedAt);
    wire.penaltyDocument.push(doc === undefined ? null : documentIndex(doc));
    wire.penaltySource.push(sourceIndex(head(p.earlyWithdrawal.provenance)));
    wire.rule.push(ruleIndex(p.eligibility));
    wire.apyRetrievedAt.push(p.provenance.retrievedAt);
    wire.apySource.push(sourceIndex(head(p.provenance)));
  }
  return wire;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error('compare wire is missing a row field');
  return item;
}

function provenance(
  wire: CompareWire,
  source: number,
  retrievedAt: IsoDateTime,
  document: number | null,
): Provenance {
  const base = at(wire.sources, source);
  const doc = document === null ? undefined : at(wire.documents, document);
  return doc === undefined ? { ...base, retrievedAt } : { ...base, retrievedAt, document: doc };
}

/** Rebuilds the row the table and the engine read. Shared rules stay one object. */
export function unpackCompareProducts(wire: CompareWire): CompareProduct[] {
  return wire.id.map((_, i) => {
    const doc = at(wire.penaltyDocument, i);
    return {
      id: at(wire.id, i),
      institutionId: at(wire.institutionId, i),
      category: wire.category,
      name: at(wire.name, i),
      termMonths: at(wire.termMonths, i),
      tierMode: at(wire.tierMode, i),
      tiers: at(wire.tiers, i),
      taxTreatment: at(wire.taxTreatment, i),
      minOpening: at(wire.minOpening, i),
      maxDeposit: at(wire.maxDeposit, i),
      earlyWithdrawal: {
        value: at(wire.penalty, i),
        provenance: provenance(
          wire,
          at(wire.penaltySource, i),
          at(wire.penaltyRetrievedAt, i),
          doc,
        ),
      },
      eligibility: at(wire.rules, at(wire.rule, i)),
      provenance: provenance(wire, at(wire.apySource, i), at(wire.apyRetrievedAt, i), null),
    };
  });
}
