-- ADR-025: a state rate may carry its own source. Null falls back to tax_tables.states_provenance.
alter table state_tax_rates add column if not exists provenance jsonb;

create or replace view state_tax_rates_text as
select version_id, tax_year, state_code, assumed_marginal_rate::text as assumed_marginal_rate, provenance
from state_tax_rates;
