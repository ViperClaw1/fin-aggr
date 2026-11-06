// Maps PostgREST rows onto the contracts. Rates arrive as text from the *_text views (ADR-019).
import type {
  BankMetrics,
  DocumentMeta,
  FactRecord,
  Institution,
  InsuranceRules,
  Product,
  TaxTables,
} from '@fa/contracts';
import type { SponsoredItem } from '@fa/contracts/ads';

type Row = Record<string, unknown>;

function cents(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function institutionFrom(row: Row): unknown {
  return {
    id: row['id'],
    name: row['name'],
    regulator: row['regulator'],
    kind: row['kind'],
    partnerInstitutionIds: row['partner_institution_ids'],
    hqState: row['hq_state'],
    website: row['website'],
    provenance: row['provenance'],
  } satisfies Record<keyof Institution, unknown>;
}

export function metricsFrom(row: Row): unknown {
  return {
    institutionId: row['institution_id'],
    asOf: row['as_of'],
    totalAssetsUsdThousands: cents(row['total_assets_usd_thousands']),
    metrics: row['metrics'],
    balanceSheetMix: row['balance_sheet_mix'],
    provenance: row['provenance'],
  } satisfies Record<keyof BankMetrics, unknown>;
}

export function productFrom(row: Row, tiers: readonly Row[]): unknown {
  const ordered = [...tiers].sort((a, b) => Number(a['ord']) - Number(b['ord']));
  return {
    id: row['id'],
    institutionId: row['institution_id'],
    category: row['category'],
    name: row['name'],
    termMonths: row['term_months'],
    tierMode: row['tier_mode'],
    tiers: ordered.map((tier) => ({
      minBalance: cents(tier['min_balance']),
      maxBalance: tier['max_balance'] === null ? null : cents(tier['max_balance']),
      apy: tier['apy'],
    })),
    compounding: row['compounding'],
    minOpening: cents(row['min_opening']),
    maxDeposit: row['max_deposit'] === null ? null : cents(row['max_deposit']),
    earlyWithdrawal: row['early_withdrawal'],
    eligibility: row['eligibility'],
    taxTreatment: row['tax_treatment'],
    validFrom: row['valid_from'],
    validTo: row['valid_to'],
    provenance: row['provenance'],
  } satisfies Record<keyof Product, unknown>;
}

export function documentFrom(row: Row): unknown {
  return {
    id: row['id'],
    title: row['title'],
    publisherInstitutionId: row['publisher_institution_id'],
    pages: row['pages'],
    fileUrl: row['file_url'],
    publishedAt: row['published_at'],
    isSynthetic: row['is_synthetic'],
  } satisfies Record<keyof DocumentMeta, unknown>;
}

export function factFrom(row: Row): unknown {
  return {
    id: row['id'],
    productId: row['product_id'],
    documentId: row['document_id'],
    key: row['key'],
    humanLabel: row['human_label'],
    valueText: row['value_text'],
    page: row['page'],
    quote: row['quote'],
    status: row['status'],
    isMock: row['is_mock'],
  } satisfies Record<keyof FactRecord, unknown>;
}

export function sourceFrom(row: Row): unknown {
  return {
    id: row['id'],
    name: row['name'],
    url: row['url'],
    kind: row['kind'],
    license: row['license'],
    lastUpdatedAt: row['last_updated_at'],
    ...(optionalText(row['notes']) === undefined ? {} : { notes: row['notes'] }),
  };
}

export function sponsoredFrom(row: Row): unknown {
  return {
    id: row['id'],
    placement: row['placement'],
    advertiser: row['advertiser'],
    headline: row['headline'],
    body: row['body'],
    ctaLabel: row['cta_label'],
    ctaUrl: row['cta_url'],
    disclosure: row['disclosure'],
    compensationType: row['compensation_type'],
  } satisfies Record<keyof SponsoredItem, unknown>;
}

export function taxFrom(
  year: unknown,
  provenance: unknown,
  brackets: readonly Row[],
  states: readonly Row[],
): unknown {
  const federal: Record<string, { upTo: unknown; rate: unknown }[]> = {};
  for (const row of [...brackets].sort((a, b) => Number(a['ord']) - Number(b['ord']))) {
    const status = String(row['filing_status']);
    const list = federal[status] ?? [];
    list.push({
      upTo: row['up_to'] === null ? null : cents(row['up_to']),
      rate: row['rate'],
    });
    federal[status] = list;
  }
  const stateRates: Record<string, { assumedMarginalRate: unknown }> = {};
  for (const row of states) {
    stateRates[String(row['state_code'])] = { assumedMarginalRate: row['assumed_marginal_rate'] };
  }
  return { taxYear: year, federal, states: stateRates, provenance } satisfies Record<
    keyof TaxTables,
    unknown
  >;
}

export function insuranceFrom(row: Row, limits: readonly Row[]): unknown {
  const byRegulator: Record<string, { limitPerOwnerPerInstitutionPerCategory: unknown }> = {};
  for (const limit of limits) {
    byRegulator[String(limit['regulator'])] = {
      limitPerOwnerPerInstitutionPerCategory: cents(limit['limit_per_owner']),
    };
  }
  return {
    asOf: row['as_of'],
    byRegulator,
    supportedCategories: row['supported_categories'],
    jointOwnersAssumed: row['joint_owners_assumed'],
    accruedInterestCountsTowardLimit: row['accrued_interest_counts_toward_limit'],
    provenance: row['provenance'],
  } satisfies Record<keyof InsuranceRules, unknown>;
}
