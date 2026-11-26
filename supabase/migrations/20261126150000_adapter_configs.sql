-- Plan step 8.6 (ADR-026, ADR-027): bank adapters as data. A model proposes a config from a
-- stored snapshot; a person approves it through the review queue (`adapter_proposal:<id>`);
-- the nightly bank-rates run reads the active configs. No policy: only service_role (ingest).

create table if not exists adapter_configs (
  id bigint generated always as identity primary key,
  institution_id text not null check (institution_id ~ '^(fdic|ncua):[0-9]+$'),
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'retired', 'rejected')),
  kind text not null check (kind in ('html_table')),
  config jsonb not null,
  snapshot_id bigint references raw_snapshots (id),
  model text not null,
  prompt_version text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  -- Failed checks at proposal time (quote_not_in_snapshot:<term>, config_differs_from_model, ...)
  failures text[] not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create unique index if not exists adapter_configs_one_active
  on adapter_configs (institution_id) where status = 'active';

alter table adapter_configs enable row level security;
