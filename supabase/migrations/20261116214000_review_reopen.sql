-- A reopen keeps the previous decision. The queue row goes back to open,
-- which requires decided_by and decided_at to be null.

create table if not exists review_audit (
  id bigint generated always as identity primary key,
  review_id bigint not null references review_queue (id),
  action text not null check (action in ('approved', 'rejected', 'reopened')),
  actor text not null check (actor ~ '^[A-Za-z0-9-]{1,39}$'),
  acted_at timestamptz not null,
  reason text,
  check (
    action = 'approved'
    or (reason is not null and reason <> '')
  )
);

alter table review_audit enable row level security;
