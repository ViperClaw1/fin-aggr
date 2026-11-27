-- Plan step 8.7 (ADR-026 publication policy, accepted by the owner 2026-11-26).
-- A bank whose onboarding proposal passed every check, in a template with 10 institutions a
-- person already approved and no stop, is confirmed with verified_by = automated_check and no
-- login. A rejected weekly sample stops automated publishing for its template.

alter table bank_confirmations drop constraint if exists bank_confirmations_verified_by_check;
alter table bank_confirmations alter column login drop not null;
alter table bank_confirmations add constraint bank_confirmations_verified_by_check
  check (
    (verified_by = 'human' and login is not null)
    or (verified_by = 'automated_check' and login is null)
  );

alter table bank_product_confirmations alter column login drop not null;

-- Platform template of a proposal: `<kind>:<generator from the survey or unknown>`.
alter table adapter_configs add column if not exists template text;

create table if not exists template_stops (
  template text primary key,
  review_id bigint not null references review_queue (id),
  stopped_at timestamptz not null default now(),
  -- Set by the owner once the cause is fixed; automated publishing resumes.
  cleared_at timestamptz
);

alter table template_stops enable row level security;
