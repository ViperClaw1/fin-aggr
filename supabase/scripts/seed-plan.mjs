// Turns a fixture set into parameterized inserts. Rates stay decimal strings until Postgres
// parses them into numeric (ADR-019). No float on the way in.

const DOMAINS = [
  'institutions',
  'bank_metrics',
  'products',
  'treasury',
  'reference',
  'par_yields',
  'national_rates',
  'documents',
];

const json = (value) => JSON.stringify(value);

function counts(set) {
  return {
    institutions: set.institutions.length,
    products: set.products.length,
    documents: set.documents.length,
    facts: set.facts.length,
    bankMetrics: set.bankMetrics.length,
    sponsored: set.sponsored.length,
    sources: set.sources.length,
  };
}

async function insertVersions(client, asOf) {
  const ids = {};
  for (const domain of DOMAINS) {
    const row = await client.query(
      `insert into dataset_versions (domain, as_of, is_mock, is_current)
       values ($1, $2, true, false) returning id`,
      [domain, asOf],
    );
    ids[domain] = row.rows[0].id;
  }
  return ids;
}

async function insertSources(client, sources) {
  for (const source of sources) {
    await client.query(
      `insert into sources (id, name, url, kind, license, last_updated_at, notes, operational_kind)
       values ($1, $2, $3, $4, $5, $6, $7, 'manual')`,
      [
        source.id,
        source.name,
        source.url,
        source.kind,
        source.license,
        source.lastUpdatedAt,
        source.notes ?? null,
      ],
    );
  }
}

async function insertInstitutions(client, versionId, institutions) {
  for (const row of institutions) {
    await client.query(
      `insert into institutions (
         version_id, id, name, regulator, kind, partner_institution_ids, hq_state, website, provenance
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        versionId,
        row.id,
        row.name,
        row.regulator,
        row.kind,
        row.partnerInstitutionIds,
        row.hqState,
        row.website,
        json(row.provenance),
      ],
    );
  }
}

async function insertMetrics(client, versionId, metrics) {
  for (const row of metrics) {
    await client.query(
      `insert into bank_metrics (
         version_id, institution_id, as_of, total_assets_usd_thousands, metrics, balance_sheet_mix, provenance
       ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        versionId,
        row.institutionId,
        row.asOf,
        row.totalAssetsUsdThousands,
        json(row.metrics),
        json(row.balanceSheetMix),
        json(row.provenance),
      ],
    );
  }
}

async function insertProducts(client, ids, products) {
  for (const row of products) {
    const versionId = row.category === 'treasury' ? ids.treasury : ids.products;
    await client.query(
      `insert into products (
         version_id, id, institution_id, category, name, term_months, tier_mode, compounding,
         min_opening, max_deposit, early_withdrawal, eligibility, tax_treatment,
         valid_from, valid_to, provenance
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb
       )`,
      [
        versionId,
        row.id,
        row.institutionId,
        row.category,
        row.name,
        row.termMonths,
        row.tierMode,
        row.compounding,
        row.minOpening,
        row.maxDeposit,
        json(row.earlyWithdrawal),
        json(row.eligibility),
        row.taxTreatment,
        row.validFrom,
        row.validTo,
        json(row.provenance),
      ],
    );
    for (const [ord, tier] of row.tiers.entries()) {
      await client.query(
        `insert into product_tiers (version_id, product_id, ord, min_balance, max_balance, apy)
         values ($1, $2, $3, $4, $5, $6)`,
        [versionId, row.id, ord, tier.minBalance, tier.maxBalance, tier.apy],
      );
    }
  }
}

async function insertDocuments(client, versionId, documents) {
  for (const row of documents) {
    await client.query(
      `insert into documents (
         version_id, id, title, publisher_institution_id, pages, file_url, published_at, is_synthetic
       ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        versionId,
        row.id,
        row.title,
        row.publisherInstitutionId,
        row.pages,
        row.fileUrl,
        row.publishedAt,
        row.isSynthetic,
      ],
    );
  }
}

async function insertFacts(client, versionId, facts) {
  for (const row of facts) {
    await client.query(
      `insert into facts (
         version_id, id, product_id, document_id, key, human_label, value_text, page, quote, status, is_mock
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        versionId,
        row.id,
        row.productId,
        row.documentId,
        row.key,
        row.humanLabel,
        row.valueText,
        row.page,
        row.quote,
        row.status,
        row.isMock,
      ],
    );
  }
}

async function insertTax(client, versionId, tax) {
  await client.query(
    `insert into tax_tables (version_id, tax_year, provenance) values ($1, $2, $3::jsonb)`,
    [versionId, tax.taxYear, json(tax.provenance)],
  );
  for (const [status, brackets] of Object.entries(tax.federal)) {
    for (const [ord, bracket] of brackets.entries()) {
      await client.query(
        `insert into tax_brackets (version_id, tax_year, filing_status, ord, up_to, rate)
         values ($1, $2, $3, $4, $5, $6)`,
        [versionId, tax.taxYear, status, ord, bracket.upTo, bracket.rate],
      );
    }
  }
  for (const [code, state] of Object.entries(tax.states)) {
    await client.query(
      `insert into state_tax_rates (version_id, tax_year, state_code, assumed_marginal_rate)
       values ($1, $2, $3, $4)`,
      [versionId, tax.taxYear, code, state.assumedMarginalRate],
    );
  }
}

async function insertInsurance(client, versionId, rules) {
  await client.query(
    `insert into insurance_rules (
       version_id, as_of, supported_categories, joint_owners_assumed,
       accrued_interest_counts_toward_limit, provenance
     ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      versionId,
      rules.asOf,
      rules.supportedCategories,
      rules.jointOwnersAssumed,
      rules.accruedInterestCountsTowardLimit,
      json(rules.provenance),
    ],
  );
  for (const [regulator, limit] of Object.entries(rules.byRegulator)) {
    await client.query(
      `insert into insurance_limits (version_id, regulator, limit_per_owner)
       values ($1, $2, $3)`,
      [versionId, regulator, limit.limitPerOwnerPerInstitutionPerCategory],
    );
  }
}

async function insertAds(client, items) {
  for (const row of items) {
    await client.query(
      `insert into ads.sponsored_items (
         id, placement, advertiser, headline, body, cta_label, cta_url, disclosure, compensation_type
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.id,
        row.placement,
        row.advertiser,
        row.headline,
        row.body,
        row.ctaLabel,
        row.ctaUrl,
        row.disclosure,
        row.compensationType,
      ],
    );
  }
}

const TRUNCATE = `truncate table
  review_queue, job_runs, raw_snapshots,
  insurance_limits, insurance_rules,
  state_tax_rates, tax_brackets, tax_tables,
  facts, documents, product_tiers, products,
  bank_metrics, institutions, dataset_versions,
  ads.sponsored_items, sources
restart identity cascade`;

/** Replaces the dataset with this fixture set and publishes every domain. */
export async function loadFixtures(client, set) {
  await client.query(TRUNCATE);
  const ids = await insertVersions(client, set.asOf);
  await insertSources(client, set.sources);
  await insertInstitutions(client, ids.institutions, set.institutions);
  await insertMetrics(client, ids.bank_metrics, set.bankMetrics);
  await insertProducts(client, ids, set.products);
  await insertDocuments(client, ids.documents, set.documents);
  await insertFacts(client, ids.documents, set.facts);
  await insertTax(client, ids.reference, set.taxTables);
  await insertInsurance(client, ids.reference, set.insuranceRules);
  await insertAds(client, set.sponsored);
  for (const id of Object.values(ids)) {
    await client.query('select publish_domain(domain, id) from dataset_versions where id = $1', [
      id,
    ]);
  }
}

export { counts };
