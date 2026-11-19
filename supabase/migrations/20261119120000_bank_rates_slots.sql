-- bank-rates dispatch slots follow the pilot banks' America/Denver window (ADR-020, scheduler).
-- 22:00–06:00 Denver is 05:00–13:00 UTC in standard time and 04:00–12:00 UTC in daylight time,
-- so the union is hours 04–12 (overnightUtcHours in packages/ingest/src/scrape/rules.ts).
-- A slot dispatches only while the window is open and no bank was requested in it yet.

create or replace function public.dispatch_bank_rates(file text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := public.denver_window_start(now());
begin
  -- ponytail: Denver only; a bank in another zone needs a per-zone window here.
  if win is null then return null; end if;
  if exists (
    select 1 from public.job_runs
     where source_id like 'bank:%' and started_at >= win and request_count > 0
  ) then
    return null;
  end if;
  return public.dispatch_workflow(file);
end;
$$;

revoke all on function public.dispatch_bank_rates(text) from public, anon, authenticated, service_role;

-- Same job name: cron.schedule replaces the 03–10 schedule and command.
-- The file stays in the command so runbook 3a can join dispatch_log.
select cron.schedule(
  'dispatch-bank-rates',
  '5,35 4-12 * * *',
  'select public.dispatch_bank_rates(''ingest-bank-rates.yml'')'
);
