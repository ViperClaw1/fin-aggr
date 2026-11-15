-- The raw FRED observation. The stored rate is that percent rounded half-up to 6 places (ADR-020).

alter table national_deposit_rates add column if not exists quote text;

drop view if exists national_deposit_rates_text;
create view national_deposit_rates_text as
select version_id, series_id, label, observation_date, rate::text as rate, quote
from national_deposit_rates;

grant select on national_deposit_rates_text to anon, authenticated;
