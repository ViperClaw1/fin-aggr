-- ADR-024: state rates carry their own source when it differs from the federal brackets.
-- Null means the states share `provenance`.
alter table tax_tables add column if not exists states_provenance jsonb;
