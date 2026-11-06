-- Stage 2 dataset (ADR-019). Rates are numeric(11,8); readers use the *_text views.
-- Nested rules, metrics and provenance stay jsonb. Their rate strings are text inside jsonb,
-- not JSON numbers, so a seed does not pass them through float.

create schema if not exists ads;

-- Preview forks a database that already has this schema, then applies the file again.
do $$
begin
  create domain cents as bigint
    constraint cents_safe check (value between -9007199254740991 and 9007199254740991);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create domain rate as numeric(11, 8)
    constraint rate_unit check (value >= 0 and value <= 1);
exception
  when duplicate_object then null;
end
$$;

create table if not exists dataset_versions (
  id bigint generated always as identity primary key,
  domain text not null check (
    domain in (
      'institutions',
      'bank_metrics',
      'products',
      'treasury',
      'reference',
      'documents'
    )
  ),
  as_of date not null,
  is_mock boolean not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists dataset_versions_one_current on dataset_versions (domain)
  where is_current;

create table if not exists sources (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  name text not null check (name <> ''),
  url text not null,
  kind text not null check (
    kind in ('official_api', 'official_document', 'issuer_document', 'partner_feed', 'manual')
  ),
  license text not null check (license <> ''),
  last_updated_at timestamptz,
  notes text,
  -- operational registry (ADR-020); not the public SourceRegistryEntry.kind
  operational_kind text not null default 'manual' check (
    operational_kind in ('official_api', 'scrape', 'manual')
  ),
  schedule text,
  status text not null default 'active' check (status in ('active', 'paused', 'manual')),
  excluded boolean not null default false
);

create table if not exists institutions (
  version_id bigint not null references dataset_versions (id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  name text not null check (name <> ''),
  regulator text not null check (regulator in ('FDIC', 'NCUA')),
  kind text not null check (kind in ('direct_bank', 'credit_union', 'fintech_partner')),
  partner_institution_ids text[] not null default '{}',
  hq_state text not null check (char_length(hq_state) = 2),
  website text,
  provenance jsonb not null,
  primary key (version_id, id)
);

create table if not exists bank_metrics (
  version_id bigint not null references dataset_versions (id),
  institution_id text not null,
  as_of date not null,
  total_assets_usd_thousands bigint not null check (total_assets_usd_thousands >= 0),
  metrics jsonb not null,
  balance_sheet_mix jsonb not null,
  provenance jsonb not null,
  primary key (version_id, institution_id)
);

create table if not exists products (
  version_id bigint not null references dataset_versions (id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  institution_id text not null,
  category text not null check (
    category in (
      'cd',
      'savings',
      'money_market',
      'treasury',
      'muni',
      'credit_card',
      'mortgage',
      'auto_loan',
      'personal_loan',
      'refinance'
    )
  ),
  name text not null check (name <> ''),
  term_months integer check (term_months is null or term_months > 0),
  tier_mode text not null check (tier_mode in ('whole_balance', 'marginal')),
  compounding text not null check (
    compounding in ('daily', 'monthly', 'quarterly', 'semiannual', 'annual', 'at_maturity')
  ),
  min_opening cents not null check (min_opening >= 0),
  max_deposit cents check (max_deposit is null or max_deposit >= 0),
  early_withdrawal jsonb not null,
  eligibility jsonb not null,
  tax_treatment text not null check (
    tax_treatment in ('taxable', 'state_local_exempt', 'federal_exempt')
  ),
  valid_from date not null,
  valid_to date,
  provenance jsonb not null,
  primary key (version_id, id),
  check (valid_to is null or valid_to >= valid_from),
  check (max_deposit is null or max_deposit >= min_opening)
);

create table if not exists product_tiers (
  version_id bigint not null,
  product_id text not null,
  ord integer not null check (ord >= 0),
  min_balance cents not null check (min_balance >= 0),
  max_balance cents check (max_balance is null or max_balance >= 0),
  apy rate not null,
  primary key (version_id, product_id, ord),
  foreign key (version_id, product_id) references products (version_id, id),
  check (max_balance is null or max_balance >= min_balance)
);

create table if not exists documents (
  version_id bigint not null references dataset_versions (id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  title text not null check (title <> ''),
  publisher_institution_id text,
  pages integer not null check (pages > 0),
  file_url text not null check (file_url <> ''),
  published_at date,
  is_synthetic boolean not null,
  primary key (version_id, id)
);

create table if not exists facts (
  version_id bigint not null references dataset_versions (id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  product_id text,
  document_id text not null,
  key text not null check (
    key in (
      'earlyWithdrawalPenalty',
      'achWithdrawalLimit',
      'monthlyFee',
      'minBalanceForApy',
      'rateChangePolicy'
    )
  ),
  human_label text not null check (human_label <> ''),
  value_text text not null check (value_text <> ''),
  page integer not null check (page > 0),
  quote text not null check (char_length(quote) between 1 and 400),
  status text not null check (status in ('verified', 'unverified')),
  is_mock boolean not null,
  primary key (version_id, id)
);

create table if not exists tax_tables (
  version_id bigint not null references dataset_versions (id),
  tax_year integer not null,
  provenance jsonb not null,
  primary key (version_id, tax_year)
);

create table if not exists tax_brackets (
  version_id bigint not null,
  tax_year integer not null,
  filing_status text not null check (
    filing_status in ('single', 'married_joint', 'married_separate', 'head_of_household')
  ),
  ord integer not null check (ord >= 0),
  up_to cents,
  rate rate not null,
  primary key (version_id, tax_year, filing_status, ord),
  foreign key (version_id, tax_year) references tax_tables (version_id, tax_year)
);

create table if not exists state_tax_rates (
  version_id bigint not null,
  tax_year integer not null,
  state_code text not null check (char_length(state_code) = 2),
  assumed_marginal_rate rate not null,
  primary key (version_id, tax_year, state_code),
  foreign key (version_id, tax_year) references tax_tables (version_id, tax_year)
);

create table if not exists insurance_rules (
  version_id bigint primary key references dataset_versions (id),
  as_of date not null,
  supported_categories text[] not null,
  joint_owners_assumed integer not null check (joint_owners_assumed = 2),
  accrued_interest_counts_toward_limit boolean not null check (
    accrued_interest_counts_toward_limit
  ),
  provenance jsonb not null
);

create table if not exists insurance_limits (
  version_id bigint not null references insurance_rules (version_id),
  regulator text not null check (regulator in ('FDIC', 'NCUA')),
  limit_per_owner cents not null,
  primary key (version_id, regulator)
);

create table if not exists ads.sponsored_items (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  placement text not null check (placement in ('compare_top', 'compare_sidebar', 'product_aside')),
  advertiser text not null check (advertiser <> ''),
  headline text not null check (char_length(headline) between 1 and 90),
  body text not null check (char_length(body) <= 200),
  cta_label text not null check (cta_label <> ''),
  cta_url text not null,
  disclosure text not null check (char_length(disclosure) >= 10),
  compensation_type text not null check (compensation_type in ('cpa', 'cpc', 'flat_fee'))
);

create table if not exists raw_snapshots (
  id bigint generated always as identity primary key,
  source_id text not null references sources (id),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bucket_path text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists job_runs (
  id bigint generated always as identity primary key,
  source_id text not null references sources (id),
  domain text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('running', 'published', 'held', 'failed')),
  row_count integer check (row_count is null or row_count >= 0),
  errors jsonb not null default '[]',
  bytes bigint not null default 0 check (bytes >= 0),
  request_count integer not null default 0 check (request_count >= 0)
);

create table if not exists review_queue (
  id bigint generated always as identity primary key,
  source_id text not null references sources (id),
  domain text not null,
  snapshot_id bigint references raw_snapshots (id),
  reason text not null check (reason <> ''),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- A product's version domain follows its category (ADR-019): treasury publishes alone.
create or replace function product_version_domain() returns trigger
language plpgsql
as $$
declare
  version_domain text;
begin
  select domain into version_domain from dataset_versions where id = new.version_id;
  if new.category = 'treasury' and version_domain is distinct from 'treasury' then
    raise exception 'treasury product % needs a treasury version', new.id;
  end if;
  if new.category <> 'treasury' and version_domain is distinct from 'products' then
    raise exception 'product % needs a products version', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists product_version_domain on products;
create trigger product_version_domain
before insert or update on products
for each row execute function product_version_domain();

create or replace function publish_domain(p_domain text, p_version bigint) returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from dataset_versions where id = p_version and domain = p_domain
  ) then
    raise exception 'version % is not in domain %', p_version, p_domain;
  end if;
  update dataset_versions set is_current = false where domain = p_domain and is_current;
  update dataset_versions set is_current = true where id = p_version;
end;
$$;

create or replace function rollback_domain(p_domain text, p_version bigint) returns void
language plpgsql
as $$
declare
  born timestamptz;
begin
  select created_at into born
  from dataset_versions
  where id = p_version and domain = p_domain;
  if born is null then
    raise exception 'version % is not in domain %', p_version, p_domain;
  end if;
  if born < now() - interval '30 days' then
    raise exception 'version % is outside the 30 day window', p_version;
  end if;
  perform publish_domain(p_domain, p_version);
end;
$$;

create or replace view product_tiers_text as
select version_id, product_id, ord, min_balance, max_balance, apy::text as apy
from product_tiers;

create or replace view tax_brackets_text as
select version_id, tax_year, filing_status, ord, up_to, rate::text as rate
from tax_brackets;

create or replace view state_tax_rates_text as
select version_id, tax_year, state_code, assumed_marginal_rate::text as assumed_marginal_rate
from state_tax_rates;

alter table dataset_versions enable row level security;
alter table sources enable row level security;
alter table institutions enable row level security;
alter table bank_metrics enable row level security;
alter table products enable row level security;
alter table product_tiers enable row level security;
alter table documents enable row level security;
alter table facts enable row level security;
alter table tax_tables enable row level security;
alter table tax_brackets enable row level security;
alter table state_tax_rates enable row level security;
alter table insurance_rules enable row level security;
alter table insurance_limits enable row level security;
alter table raw_snapshots enable row level security;
alter table job_runs enable row level security;
alter table review_queue enable row level security;
alter table ads.sponsored_items enable row level security;

drop policy if exists dataset_versions_read on dataset_versions;
create policy dataset_versions_read on dataset_versions
for select to anon, authenticated using (is_current);

drop policy if exists sources_read on sources;
create policy sources_read on sources for select to anon, authenticated using (true);

drop policy if exists institutions_read on institutions;
create policy institutions_read on institutions
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists bank_metrics_read on bank_metrics;
create policy bank_metrics_read on bank_metrics
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists products_read on products;
create policy products_read on products
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists product_tiers_read on product_tiers;
create policy product_tiers_read on product_tiers
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists documents_read on documents;
create policy documents_read on documents
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists facts_read on facts;
create policy facts_read on facts
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists tax_tables_read on tax_tables;
create policy tax_tables_read on tax_tables
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists tax_brackets_read on tax_brackets;
create policy tax_brackets_read on tax_brackets
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists state_tax_rates_read on state_tax_rates;
create policy state_tax_rates_read on state_tax_rates
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists insurance_rules_read on insurance_rules;
create policy insurance_rules_read on insurance_rules
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists insurance_limits_read on insurance_limits;
create policy insurance_limits_read on insurance_limits
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

drop policy if exists sponsored_read on ads.sponsored_items;
create policy sponsored_read on ads.sponsored_items
for select to anon, authenticated using (true);

-- raw_snapshots, job_runs and review_queue have no read policy: anon sees nothing.
-- service_role bypasses RLS and is the only writer.

grant usage on schema ads to anon, authenticated, service_role;
grant select on ads.sponsored_items to anon, authenticated;
grant select on product_tiers_text, tax_brackets_text, state_tax_rates_text to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('raw', 'raw', false, 52428800),
  ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;
