-- Review decisions (ADR-020). decided_by is a GitHub login, never an email.
-- A NULL decision_reason must not satisfy the reject check.

alter table review_queue
  add column if not exists decided_by text,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists issue_url text;

do $$
begin
  alter table review_queue
    add constraint review_decided check (
      (status = 'open' and decided_by is null and decided_at is null)
      or (
        status <> 'open'
        and decided_by is not null
        and decided_by <> ''
        and decided_at is not null
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table review_queue
    add constraint review_reject_reason check (
      status <> 'rejected'
      or (decision_reason is not null and decision_reason <> '')
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table review_queue
    add constraint review_decided_by_login check (
      decided_by is null or decided_by ~ '^[A-Za-z0-9-]{1,39}$'
    );
exception
  when duplicate_object then null;
end
$$;
