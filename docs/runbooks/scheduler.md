# Scheduler runbook (ADR-020, Scheduler)

Run in Supabase SQL editor as `postgres`. Times are UTC. Nothing here prints a token.

## 1. Are the jobs registered?

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname like 'dispatch-%'
   or jobname in ('harvest-dispatches', 'bank-rates-watchdog', 'harvest-scheduler-issue')
order by jobname;
```

Expect 9 `dispatch-*` (`dispatch-survey` until the 8.4 survey is final, then
`select cron.unschedule('dispatch-survey')`), plus the harvest and watchdog jobs, all `active = true`.

## 2. Did they run?

```sql
select j.jobname, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where d.start_time > now() - interval '24 hours'
order by d.start_time desc
limit 50;
```

`status = 'failed'` with `github_dispatch_token is not in vault` or `review_repo_token is not in vault`
means the Vault secret is missing (step 5).

`dispatch-bank-rates` runs `5,35 4-12 * * *` and calls `dispatch_bank_rates('ingest-bank-rates.yml')`.
It succeeds without a `dispatch_log` row when the Denver window is closed or a bank was already
requested this window (expected after the first good run of the night). Check:

```sql
select public.denver_window_start(now()) as win,
       exists (select 1 from job_runs
                where source_id like 'bank:%' and request_count > 0
                  and started_at >= public.denver_window_start(now())) as collected;
```

A held bank logs `held reason=outside_window window=05:00–13:00Z`: the window in UTC for that bank.

Ingest slots are 12 minutes after their GitHub cron: daily-rules 05:59, daily-0700 07:29,
weekly Mon 11:49, daily-2330 23:29. A second run of the same day lands on `unchanged`.

## 3. What did GitHub answer? (kept by pg_net for about 6 hours)

```sql
select id, status_code, timed_out, error_msg, created
from net._http_response
where created > now() - interval '6 hours'
order by created desc;
```

`204` is a dispatch accepted. `201` is an issue or comment created. `401` is an expired or wrong token.
`404` on a dispatch is a wrong workflow file name or a token without access to the repository.

## 3a. Every dispatched workflow, last 24 hours

One row per `dispatch-*` firing: did pg_cron run it, and what did GitHub answer.
`http_status` is null once pg_net dropped the answer (after about 6 hours); `dispatch_log` keeps it.

```sql
select j.jobname,
       d.start_time,
       d.status as cron_status,
       d.return_message,
       l.request_id,
       r.status_code as http_status,
       r.timed_out,
       r.error_msg,
       l.status_code as logged_status,
       l.failed
from cron.job j
join cron.job_run_details d on d.jobid = j.jobid
left join dispatch_log l
       on l.workflow = substring(j.command from '''([a-z0-9-]+\.yml)''')
      and l.requested_at between d.start_time - interval '5 seconds' and d.start_time + interval '1 minute'
left join net._http_response r on r.id = l.request_id
where j.jobname like 'dispatch-%'
  and d.start_time > now() - interval '24 hours'
order by d.start_time desc;
```

Missed slots: a workflow whose expected slot today has no row.

```sql
select j.jobname, j.schedule, max(d.start_time) as last_fired
from cron.job j
left join cron.job_run_details d on d.jobid = j.jobid and d.start_time > now() - interval '26 hours'
where j.jobname like 'dispatch-%'
group by j.jobname, j.schedule
order by last_fired nulls first;
```

`dispatch-weekly` is expected to be null except on Mondays.

## 4. Longer history

```sql
select workflow, requested_at, status_code, failed
from dispatch_log
where requested_at > now() - interval '3 days'
order by requested_at desc;

select * from scheduler_watch order by window_start desc limit 7;
select * from scheduler_issue;

select source_id, started_at, ended_at, status, request_count, errors
from job_runs
where source_id like 'bank:%' or source_id = 'amex-cd-page'
order by started_at desc
limit 20;
```

## 5. Secrets

```sql
select name, created_at, updated_at from vault.secrets
where name in ('github_dispatch_token', 'review_repo_token');

-- first time
select vault.create_secret('<token>', 'github_dispatch_token');
select vault.create_secret('<token>', 'review_repo_token');

-- rotation
select vault.update_secret(id, '<new token>') from vault.secrets where name = 'github_dispatch_token';
```

`github_dispatch_token` is the PAT `fa-dispatch` (Actions read and write, `ViperClaw1/fin-aggr` only, 90 days).
`review_repo_token` needs Issues read and write on `ViperClaw1/fin-aggr-review`; the `REVIEW_REPO_TOKEN`
PAT has that scope. Set a reminder 7 days before each expiry.

## 6. Manual test

```sql
select public.dispatch_workflow('review-age.yml');   -- then section 3 within a minute
select public.denver_window_start(now());            -- null outside 22:00–06:00 Denver
```
