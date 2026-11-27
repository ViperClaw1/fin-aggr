-- Explicit grants for the API roles. Projects created after Supabase stopped granting public
-- tables to anon, authenticated and service_role by default (staging, 2026-11-25) start with none,
-- so PostgREST answers 42501. Idempotent: on prod, which kept the old defaults, it changes nothing.
--
-- anon and authenticated read only what RLS lets them read: every public table has RLS on, and
-- the `*_text` views are the published read models (already granted in earlier migrations).
-- service_role (the secret key) gets full table access, as it had on prod.
-- A new table must grant itself; packages/ingest/src/postgres/grants.test.ts fails on a table with no grant.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('grant select on public.%I to anon, authenticated', t.relname);
  end loop;
end $$;

grant select on par_yields_text, national_deposit_rates_text, product_tiers_text,
  tax_brackets_text, state_tax_rates_text to anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
