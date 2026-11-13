-- FDIC national deposit rates via FRED release 317 (ADR-020).
-- Shares the current reference version so a publish does not hide tax, insurance, or par yields.

create table if not exists national_deposit_rates (
  version_id bigint not null references dataset_versions (id),
  series_id text not null check (
    series_id in (
      'SNDR',
      'ICNDR',
      'MMNDR',
      'NDR1MCD',
      'NDR3MCD',
      'NDR6MCD',
      'NDR12MCD',
      'NDR24MCD',
      'NDR36MCD',
      'NDR48MCD',
      'NDR60MCD'
    )
  ),
  label text not null check (label <> ''),
  observation_date date not null,
  rate rate not null check (rate <= 0.2),
  primary key (version_id, series_id)
);

alter table national_deposit_rates enable row level security;

drop policy if exists national_deposit_rates_read on national_deposit_rates;
create policy national_deposit_rates_read on national_deposit_rates
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

create or replace view national_deposit_rates_text as
select version_id, series_id, label, observation_date, rate::text as rate
from national_deposit_rates;

grant select on national_deposit_rates_text to anon, authenticated;
