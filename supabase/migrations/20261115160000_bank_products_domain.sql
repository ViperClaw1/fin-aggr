-- Scraped bank rates publish on their own domain so a mock product version is not replaced.

alter table dataset_versions drop constraint dataset_versions_domain_check;

alter table dataset_versions
  add constraint dataset_versions_domain_check check (
    domain in (
      'institutions',
      'bank_metrics',
      'products',
      'treasury',
      'reference',
      'documents',
      'par_yields',
      'national_rates',
      'bank_products'
    )
  );

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
  if new.category in ('cd', 'savings')
     and version_domain not in ('products', 'bank_products') then
    raise exception 'product % needs a products or bank_products version', new.id;
  end if;
  if new.category not in ('treasury', 'cd', 'savings')
     and version_domain is distinct from 'products' then
    raise exception 'product % needs a products version', new.id;
  end if;
  return new;
end;
$$;

create table if not exists bank_confirmations (
  source_id text primary key references sources (id),
  status text not null check (status = 'verified'),
  verified_by text not null check (verified_by = 'human'),
  login text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  verified_at date not null
);

alter table bank_confirmations enable row level security;

do $$
declare
  new_id bigint;
begin
  if not exists (
    select 1 from dataset_versions where domain = 'bank_products' and is_current
  ) then
    insert into dataset_versions (domain, as_of, is_mock, is_current)
    select 'bank_products', v.as_of, true, false
    from dataset_versions v
    where v.domain = 'products' and v.is_current
    returning id into new_id;
    if new_id is not null then
      perform publish_domain('bank_products', new_id);
    end if;
  end if;
end $$;
