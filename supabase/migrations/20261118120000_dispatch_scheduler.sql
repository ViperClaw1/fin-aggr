-- Supabase pg_cron is the primary trigger of the ingest workflows (ADR-020, scheduler).
-- GitHub `schedule` stays as a fallback. The token lives only in Vault as
-- `github_dispatch_token`; this file holds no secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per dispatch. net._http_response is kept only a few hours, so a
-- harvest job copies the answer here for Review age, which runs once a day.
create table if not exists dispatch_log (
  request_id bigint primary key,
  workflow text not null,
  requested_at timestamptz not null default now(),
  status_code integer,
  failed boolean,
  checked_at timestamptz
);

alter table dispatch_log enable row level security;
revoke all on dispatch_log from anon, authenticated;

create or replace function public.dispatch_workflow(file text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  request bigint;
begin
  if file !~ '^[a-z0-9-]+\.yml$' then
    raise exception 'dispatch_workflow: bad workflow file';
  end if;
  select decrypted_secret into token
    from vault.decrypted_secrets
   where name = 'github_dispatch_token';
  if token is null or token = '' then
    raise exception 'dispatch_workflow: github_dispatch_token is not in vault';
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/ViperClaw1/fin-aggr/actions/workflows/' || file || '/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'fa-dispatch',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  ) into request;
  insert into public.dispatch_log (request_id, workflow) values (request, file);
  return request;
end;
$$;

-- Copies finished answers from net._http_response. GitHub answers 204 on success.
-- A request with no answer after one hour is a failure too.
create or replace function public.harvest_dispatches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dispatch_log d
     set status_code = r.status_code,
         failed = r.timed_out is true
                  or r.error_msg is not null
                  or r.status_code is null
                  or r.status_code not between 200 and 299,
         checked_at = now()
    from net._http_response r
   where r.id = d.request_id and d.checked_at is null;
  update public.dispatch_log
     set failed = true, checked_at = now()
   where checked_at is null and requested_at < now() - interval '1 hour';
end;
$$;

-- Executable only by postgres. Not callable through the Data API.
revoke all on function public.dispatch_workflow(text) from public, anon, authenticated, service_role;
revoke all on function public.harvest_dispatches() from public, anon, authenticated, service_role;

-- Times are UTC and match the GitHub crons (ADR-020). bank-rates runs every 30 minutes
-- in 03:05–10:35; the once-per-night guard makes the extra slots skips.
do $$
declare
  job record;
begin
  for job in
    select * from (values
      ('dispatch-bank-rates', '5,35 3-10 * * *', 'ingest-bank-rates.yml'),
      ('dispatch-db-contract', '37 3 * * *', 'db-contract.yml'),
      ('dispatch-review-age', '17 4 * * *', 'review-age.yml'),
      -- Ingest slots run 12 minutes after the GitHub cron, so whichever fires second
      -- lands on the per-source daily guard (ADR-020). 17.11: GitHub dropped both.
      ('dispatch-daily-rules', '59 5 * * *', 'ingest-daily-rules.yml'),
      ('dispatch-live-shape', '37 6 * * *', 'ingest-live-shape.yml'),
      ('dispatch-daily-0700', '29 7 * * *', 'ingest-daily-0700.yml'),
      ('dispatch-weekly', '49 11 * * 1', 'ingest-weekly.yml'),
      ('dispatch-daily-2330', '29 23 * * *', 'ingest-daily-2330.yml')
    ) as t (name, schedule, file)
  loop
    perform cron.schedule(job.name, job.schedule, format('select public.dispatch_workflow(%L)', job.file));
  end loop;
  perform cron.schedule('harvest-dispatches', '*/15 * * * *', 'select public.harvest_dispatches()');
end;
$$;
