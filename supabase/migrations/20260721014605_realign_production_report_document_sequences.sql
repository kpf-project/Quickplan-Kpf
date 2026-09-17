-- Data cutovers restore explicit bigint IDs. Keep the backing bigserial
-- sequences ahead of the restored rows so the next document/audit insert
-- cannot reuse an existing primary key.
select setval(
  pg_get_serial_sequence('public.production_report_documents', 'id'),
  greatest(coalesce((select max(id) from public.production_report_documents), 1), 1),
  exists (select 1 from public.production_report_documents)
);

select setval(
  pg_get_serial_sequence('public.production_report_doc_audits', 'id'),
  greatest(coalesce((select max(id) from public.production_report_doc_audits), 1), 1),
  exists (select 1 from public.production_report_doc_audits)
);
