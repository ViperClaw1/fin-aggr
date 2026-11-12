-- Daily Treasury Par Yield Curve (ADR-020). One row per date and CMT tenor.
-- Shares the current reference version so a publish does not hide tax or insurance.

create table if not exists par_yields (
  version_id bigint not null references dataset_versions (id),
  curve_date date not null,
  tenor text not null check (
    tenor in (
      '1M',
      '1.5M',
      '2M',
      '3M',
      '4M',
      '6M',
      '1Y',
      '2Y',
      '3Y',
      '5Y',
      '7Y',
      '10Y',
      '20Y',
      '30Y'
    )
  ),
  rate rate not null check (rate <= 0.2),
  primary key (version_id, curve_date, tenor)
);

alter table par_yields enable row level security;

drop policy if exists par_yields_read on par_yields;
create policy par_yields_read on par_yields
for select to anon, authenticated
using (version_id in (select id from dataset_versions where is_current));

create or replace view par_yields_text as
select version_id, curve_date, tenor, rate::text as rate
from par_yields;

grant select on par_yields_text to anon, authenticated;
