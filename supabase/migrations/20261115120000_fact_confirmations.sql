-- Human confirmation of a held insurance or treasury quote (ADR-020).
-- status is verified and verified_by is human. The login is a GitHub login, never an email.
-- The source quote stays unverified. This row does not publish a product or a limit.

create table if not exists fact_confirmations (
  fact_id text primary key check (fact_id ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  status text not null check (status = 'verified'),
  verified_by text not null check (verified_by = 'human'),
  login text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  verified_at date not null
);

alter table fact_confirmations enable row level security;

-- No read policy: anon sees nothing, same as review_queue.
