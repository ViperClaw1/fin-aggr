-- Par yields and national deposit rates publish on their own domains.
-- Rows previously written onto the shared reference version move off it.

alter table dataset_versions drop constraint dataset_versions_domain_check;

alter table dataset_versions
  add constraint dataset_versions_domain_check check (
    domain in (
      'institutions',
      'bank_metrics',
      'products',
      'treasury',
      'reference',
      'documents',
      'par_yields',
      'national_rates'
    )
  );

do $$
declare
  new_id bigint;
  curve date;
  n int;
begin
  select count(*), max(p.curve_date) into n, curve
  from par_yields p
  join dataset_versions v on v.id = p.version_id
  where v.domain = 'reference';

  if n > 0 then
    insert into dataset_versions (domain, as_of, is_mock, is_current)
    values ('par_yields', curve, false, false)
    returning id into new_id;
    update par_yields p
    set version_id = new_id
    from dataset_versions v
    where p.version_id = v.id and v.domain = 'reference';
    perform publish_domain('par_yields', new_id);
  elsif not exists (
    select 1 from dataset_versions where domain = 'par_yields' and is_current
  ) then
    insert into dataset_versions (domain, as_of, is_mock, is_current)
    select 'par_yields', v.as_of, true, false
    from dataset_versions v
    where v.domain = 'reference' and v.is_current
    returning id into new_id;
    if new_id is not null then
      perform publish_domain('par_yields', new_id);
    end if;
  end if;
end $$;

do $$
declare
  new_id bigint;
  observed date;
  n int;
begin
  select count(*), max(p.observation_date) into n, observed
  from national_deposit_rates p
  join dataset_versions v on v.id = p.version_id
  where v.domain = 'reference';

  if n > 0 then
    insert into dataset_versions (domain, as_of, is_mock, is_current)
    values ('national_rates', observed, false, false)
    returning id into new_id;
    update national_deposit_rates p
    set version_id = new_id
    from dataset_versions v
    where p.version_id = v.id and v.domain = 'reference';
    perform publish_domain('national_rates', new_id);
  elsif not exists (
    select 1 from dataset_versions where domain = 'national_rates' and is_current
  ) then
    insert into dataset_versions (domain, as_of, is_mock, is_current)
    select 'national_rates', v.as_of, true, false
    from dataset_versions v
    where v.domain = 'reference' and v.is_current
    returning id into new_id;
    if new_id is not null then
      perform publish_domain('national_rates', new_id);
    end if;
  end if;
end $$;
