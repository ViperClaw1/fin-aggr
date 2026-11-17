-- A person confirms each bank product id, from the review queue (ADR-020).
-- A confirmed id is known to the bank review even before it was ever published.

create table if not exists bank_product_confirmations (
  source_id text not null references sources (id),
  product_id text not null,
  login text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  verified_at date not null,
  snapshot_id bigint references raw_snapshots (id),
  primary key (source_id, product_id)
);

alter table bank_product_confirmations enable row level security;

-- The owner checked exactly these two products when confirming the banks.
insert into bank_product_confirmations (source_id, product_id, login, verified_at, snapshot_id)
select c.source_id, p.product_id, c.login, c.verified_at, null
from bank_confirmations c
join (
  values
    ('bank:fdic:57803', 'fdic-57803-savings'),
    ('bank:fdic:27471', 'fdic-27471-3200')
) as p (source_id, product_id) on p.source_id = c.source_id
on conflict (source_id, product_id) do nothing;
