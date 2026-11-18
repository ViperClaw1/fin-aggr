-- `pnpm ingest:resume <id> --reason` puts a manual source back to active (ADR-020).
-- Each change is a row here, with the GitHub login and the reason.

create table if not exists source_status_log (
  id bigint generated always as identity primary key,
  source_id text not null references sources (id),
  from_status text not null,
  to_status text not null,
  reason text not null check (btrim(reason) <> ''),
  login text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  changed_at timestamptz not null default now()
);

alter table source_status_log enable row level security;
