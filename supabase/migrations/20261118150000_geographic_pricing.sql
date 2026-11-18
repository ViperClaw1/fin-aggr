-- Pricing geography of bank offers (ADR-022).
-- A market offer is its own product: id `<base>--m-<market_id>`, with requestZip in provenance.

alter table products
  add column if not exists scope_kind text not null default 'national'
    check (scope_kind in ('national', 'market')),
  add column if not exists market_id text
    check (market_id is null or (char_length(market_id) <= 24 and market_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  add column if not exists channel text not null default 'online'
    check (channel in ('online', 'branch')),
  add column if not exists relationship_rate boolean not null default false;

alter table products drop constraint if exists products_scope_market;
alter table products add constraint products_scope_market check (
  case scope_kind
    when 'national' then market_id is null and position('--m-' in id) = 0
    else market_id is not null
      and right(id, char_length(market_id) + 4) = '--m-' || market_id
      and provenance ? 'requestZip'
  end
);

-- The pilot banks returned one rate set without a ZIP (ADR-022). The default already says so;
-- this states it for the rows that exist.
update products
set scope_kind = 'national'
where institution_id in ('fdic:57803', 'fdic:27471', 'fdic:58177');

-- The ZIP a stored body was requested for. Null: the request carried no ZIP.
alter table raw_snapshots
  add column if not exists request_zip text check (request_zip is null or request_zip ~ '^\d{5}$');

create table if not exists bank_markets (
  bank_id text not null check (bank_id ~ '^(fdic|ncua):\d+$'),
  market_id text not null
    check (char_length(market_id) <= 24 and market_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  zip_prefixes text[] not null default '{}'
    check (array_to_string(zip_prefixes, ',') ~ '^(\d{3}(,\d{3})*)?$'),
  zips text[] not null default '{}'
    check (array_to_string(zips, ',') ~ '^(\d{5}(,\d{5})*)?$'),
  -- the one ZIP daily collection requests for this market
  representative_zip text not null check (representative_zip ~ '^\d{5}$'),
  verified_at timestamptz,
  verified_by text check (verified_by is null or verified_by ~ '^[A-Za-z0-9-]{1,39}$'),
  primary key (bank_id, market_id),
  check (cardinality(zips) > 0 or cardinality(zip_prefixes) > 0),
  check (representative_zip = any (zips) or left(representative_zip, 3) = any (zip_prefixes)),
  check ((verified_at is null) = (verified_by is null))
);

alter table bank_markets enable row level security;

-- Only markets a person verified within 45 days are served; an older row counts as unverified
-- until discovery runs again (monthly).
drop policy if exists bank_markets_read on bank_markets;
create policy bank_markets_read on bank_markets
for select to anon, authenticated
using (verified_at is not null and verified_at > now() - interval '45 days');

-- The reviewer's login stays private, as in the confirmation tables.
revoke select on bank_markets from anon, authenticated;
grant select (bank_id, market_id, zip_prefixes, zips, representative_zip, verified_at)
  on bank_markets to anon, authenticated;
