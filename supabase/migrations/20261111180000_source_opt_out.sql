-- Bank opt-out (ADR-020 step 8.1). The flag records who applied it and when.
-- A late application is still an exclusion. The runner logs that it missed 24 hours.

alter table sources
  add column if not exists opt_out_requested_at timestamptz,
  add column if not exists opt_out_applied_at timestamptz,
  add column if not exists opt_out_by text;

do $$
begin
  alter table sources
    add constraint sources_opt_out check (
      (
        excluded = false
        and opt_out_requested_at is null
        and opt_out_applied_at is null
        and opt_out_by is null
      )
      or (
        excluded = true
        and opt_out_requested_at is not null
        and opt_out_applied_at is not null
        and opt_out_by ~ '^[A-Za-z0-9-]{1,39}$'
      )
    );
exception
  when duplicate_object then null;
end
$$;
