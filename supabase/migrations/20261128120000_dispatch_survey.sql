-- Plan 8.4: GitHub never fired the ingest-survey.yml schedule (26.11–28.11), so pg_cron dispatches
-- it too, 12 minutes after the GitHub cron, as for the other ingest workflows (ADR-020).
-- 06:49 UTC is inside the overnight window from Eastern to Pacific; 09:49 adds Alaska and Hawaii.
-- A double start is harmless: the workflow queues on its concurrency group and skips surveyed
-- banks. Unschedule this job once the survey report is final (runbook scheduler.md).
select cron.schedule(
  'dispatch-survey',
  '49 6,9 * * *',
  'select public.dispatch_workflow(''ingest-survey.yml'')'
);
