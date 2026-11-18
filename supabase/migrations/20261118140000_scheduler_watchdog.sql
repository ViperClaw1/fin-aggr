-- Watchdog for the bank-rates night (ADR-020, scheduler).
-- Hourly inside the America/Denver window (22:00–06:00 local, the pilot banks' zone):
--   no bank job_runs row since the window opened -> dispatch ingest-bank-rates.yml once;
--   still none an hour after that re-dispatch, or a failed dispatch this window
--   -> open or comment on ONE issue "scheduler: missed window" in ViperClaw1/fin-aggr-review.
-- Tokens live only in Vault: `github_dispatch_token` (dispatch) and
-- `review_repo_token` (Issues read and write on fin-aggr-review). None is in this file.

-- One row per Denver window (keyed by the local date the window opened on).
create table if not exists scheduler_watch (
  window_start timestamptz primary key,
  redispatch_request_id bigint,
  redispatched_at timestamptz,
  alerted_at timestamptz,
  alert_reason text
);

-- The one alert issue. `request_id` is the create call; the harvest copies the number.
create table if not exists scheduler_issue (
  id boolean primary key default true check (id),
  request_id bigint,
  issue_number integer
);

alter table scheduler_watch enable row level security;
alter table scheduler_issue enable row level security;
revoke all on scheduler_watch, scheduler_issue from anon, authenticated;

-- 22:00 local of the window that contains `at`, or null outside 22:00–06:00 local.
create or replace function public.denver_window_start(at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when extract(hour from at at time zone 'America/Denver') in (22, 23, 0, 1, 2, 3, 4, 5)
    then ((((at at time zone 'America/Denver') + interval '2 hours')::date - 1) + time '22:00')
         at time zone 'America/Denver'
  end
$$;

create or replace function public.github_review_request(path text, body jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'review_repo_token';
  if token is null or token = '' then
    raise exception 'github_review_request: review_repo_token is not in vault';
  end if;
  return net.http_post(
    url := 'https://api.github.com/repos/ViperClaw1/fin-aggr-review' || path,
    body := body,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'fa-dispatch',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Opens the issue once; later alerts comment on it and mention the owner.
-- pg_net has no PATCH, so a closed issue is not reopened; the comment still notifies.
create or replace function public.scheduler_alert(win timestamptz, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue record;
  text_body text := format(
    'bank-rates window opened %s (America/Denver 22:00) had no run. Reason: %s. '
    'Runbook: docs/runbooks/scheduler.md', win, reason);
begin
  update public.scheduler_watch set alerted_at = now(), alert_reason = reason
   where window_start = win and alerted_at is null;
  if not found then return; end if;
  insert into public.scheduler_issue (id) values (true) on conflict (id) do nothing;
  select * into issue from public.scheduler_issue where id for update;
  if issue.issue_number is null and issue.request_id is null then
    update public.scheduler_issue
       set request_id = public.github_review_request(
             '/issues',
             jsonb_build_object('title', 'scheduler: missed window', 'body', text_body,
                                'assignees', jsonb_build_array('ViperClaw1')))
     where id;
  elsif issue.issue_number is not null then
    perform public.github_review_request(
      '/issues/' || issue.issue_number || '/comments',
      jsonb_build_object('body', '@ViperClaw1 ' || text_body));
  end if;
  -- A create still in flight: the window is recorded; the next alert comments.
end;
$$;

create or replace function public.bank_rates_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := public.denver_window_start(now());
  watch record;
  ran boolean;
  failed record;
begin
  if win is null or now() < win + interval '1 hour' then return; end if;
  insert into public.scheduler_watch (window_start) values (win) on conflict do nothing;
  select * into watch from public.scheduler_watch where window_start = win for update;
  if watch.alerted_at is not null then return; end if;

  select exists (
    select 1 from public.job_runs
     where source_id like 'bank:%' and ended_at >= win
  ) into ran;
  if ran then return; end if;

  select status_code into failed from public.dispatch_log
   where workflow = 'ingest-bank-rates.yml' and failed and requested_at >= win
   order by requested_at desc limit 1;
  if found then
    perform public.scheduler_alert(win, 'dispatch_failed:' || coalesce(failed.status_code::text, 'none'));
    return;
  end if;

  if watch.redispatched_at is null then
    update public.scheduler_watch
       set redispatch_request_id = public.dispatch_workflow('ingest-bank-rates.yml'),
           redispatched_at = now()
     where window_start = win;
  elsif now() >= watch.redispatched_at + interval '1 hour' then
    perform public.scheduler_alert(win, 'no_run_after_redispatch');
  end if;
end;
$$;

-- Copies the alert issue number once GitHub answered the create call.
create or replace function public.harvest_scheduler_issue()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scheduler_issue i
     set issue_number = (r.content::jsonb ->> 'number')::integer
    from net._http_response r
   where i.id and i.issue_number is null and r.id = i.request_id and r.status_code = 201;
  -- A failed create is retried by the next alert.
  update public.scheduler_issue i
     set request_id = null
    from net._http_response r
   where i.id and i.issue_number is null and r.id = i.request_id
     and (r.status_code is null or r.status_code <> 201);
end;
$$;

revoke all on function public.github_review_request(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.scheduler_alert(timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.bank_rates_watchdog() from public, anon, authenticated, service_role;
revoke all on function public.harvest_scheduler_issue() from public, anon, authenticated, service_role;
revoke all on function public.denver_window_start(timestamptz) from public, anon, authenticated;

-- :50 every hour; the function itself returns outside the Denver window.
select cron.schedule('bank-rates-watchdog', '50 * * * *', 'select public.bank_rates_watchdog()');
select cron.schedule('harvest-scheduler-issue', '*/15 * * * *', 'select public.harvest_scheduler_issue()');
