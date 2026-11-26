-- Plan step 8.4 (ADR-026): a read-only survey of the largest institutions by deposits.
-- One row per institution and attempt. Nothing here is published; RLS has no policy, so only
-- service_role (ingest) reads or writes it.

create table if not exists survey_results (
  id bigint generated always as identity primary key,
  institution_id text not null check (institution_id ~ '^(fdic|ncua):[0-9]+$'),
  surveyed_at timestamptz not null,
  deposits_usd_thousands bigint not null check (deposits_usd_thousands >= 0),
  status text not null check (status in ('ok', 'blocked', 'missing', 'excluded', 'error')),
  -- ManualReason of the scrape session: robots, captcha, blocked (401/403/429 too), headers_overflow
  block_reason text,
  error_code text,
  home_url text,
  rates_url text,
  rates_without_js boolean,
  disclosure_pdf_url text,
  generator text,
  script_hosts text[] not null default '{}'
);

create index if not exists survey_results_institution on survey_results (institution_id);

alter table survey_results enable row level security;
