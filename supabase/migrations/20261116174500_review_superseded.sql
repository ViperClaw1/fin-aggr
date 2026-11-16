-- A later successful publish closes the open review for that source.
-- The close is not a human decision: decided_by stays null.

alter table review_queue drop constraint review_queue_status_check;

alter table review_queue
  add constraint review_queue_status_check
  check (status in ('open', 'approved', 'rejected', 'superseded'));

alter table review_queue drop constraint review_decided;

alter table review_queue
  add constraint review_decided check (
    (status = 'open' and decided_by is null and decided_at is null)
    or (
      status = 'superseded'
      and decided_by is null
      and decided_at is not null
      and decision_reason is not null
      and decision_reason <> ''
    )
    or (
      status in ('approved', 'rejected')
      and decided_by is not null
      and decided_by <> ''
      and decided_at is not null
    )
  );
