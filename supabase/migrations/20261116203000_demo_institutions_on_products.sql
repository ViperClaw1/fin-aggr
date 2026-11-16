-- Demo products keep their fixture issuers after the institutions domain is the FDIC registry.
-- The copy hangs on the current products version. getInstitution reads the institutions
-- version first and this copy only when that id is absent. Re-running inserts nothing.

insert into institutions (
  version_id,
  id,
  name,
  regulator,
  kind,
  partner_institution_ids,
  hq_state,
  website,
  provenance
)
select
  products_version.id,
  i.id,
  i.name,
  i.regulator,
  i.kind,
  i.partner_institution_ids,
  i.hq_state,
  i.website,
  i.provenance
from institutions i
join dataset_versions source
  on source.id = i.version_id
 and source.domain = 'institutions'
 and source.is_mock
 and source.id = (
   select max(id)
   from dataset_versions
   where domain = 'institutions' and is_mock
 )
cross join dataset_versions products_version
where products_version.domain = 'products'
  and products_version.is_current
  and not exists (
    select 1
    from institutions existing
    where existing.version_id = products_version.id
      and existing.id = i.id
  );
