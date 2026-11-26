-- Plan step 8.6/8.9 (ADR-026): person-minutes per review, written with the approve decision
-- (`pnpm ingest:approve <id> --minutes N`). Null: not recorded.

alter table review_queue
  add column if not exists review_minutes integer
  check (review_minutes is null or (review_minutes >= 0 and review_minutes <= 600));
