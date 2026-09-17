-- The first safe re-export stores two snapshots in the same new batch:
-- the legacy current projection and the newly generated version. The document
-- version number is the identity; batch + document alone is intentionally not.
alter table public.production_requisition_export_versions
  drop constraint if exists production_requisition_export_versions_batch_doc_unique;

create index if not exists production_requisition_export_versions_batch_doc_idx
  on public.production_requisition_export_versions (export_batch_id, doc_ref, version_no);
