begin read only;

select 'receipts' section, r.id::text id, r.barcode, r.status, r.net_weight_kg::text weight,
  r.metadata::text details
from public.production_weight_receipts r
where r.id in (
  '569941c4-9eb6-4114-ad63-276cd42f5311'::uuid,
  'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'::uuid
);

select 'issue_items' section, i.id::text id, i.issue_document_id::text parent_id,
  i.source_receipt_id::text source_id, i.barcode, i.status, i.weight_kg::text weight,
  i.metadata::text details
from public.production_stock_issue_items i
where i.source_receipt_id in (
  '569941c4-9eb6-4114-ad63-276cd42f5311'::uuid,
  'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'::uuid
)
or i.metadata ->> 'rootSourceReceiptId' = 'ec7f60c2-9ddd-4d34-a5ca-3a86805b053b'
order by i.issued_at;

select 'movements' section, m.id::text id, m.movement_no, m.movement_type,
  m.source_document_type, m.source_document_no, m.reference_type, m.reference_no,
  m.weight_in_kg::text weight_in, m.weight_out_kg::text weight_out, m.metadata::text details
from public.production_stock_movements m
where m.metadata ->> 'returnReceiptId' in (
  '569941c4-9eb6-4114-ad63-276cd42f5311',
  'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'
)
or m.metadata ->> 'sourceReceiptId' in (
  '569941c4-9eb6-4114-ad63-276cd42f5311',
  'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'
)
or m.metadata ->> 'rootSourceReceiptId' = 'ec7f60c2-9ddd-4d34-a5ca-3a86805b053b'
order by m.movement_at;

select 'roles' section, roles.name role_name, p.perm_key, count(distinct ur.user_id)::text user_count
from public.permissions p
join public.role_permissions rp on rp.permission_id = p.id
join public.roles on roles.id = rp.role_id
left join public.user_roles ur on ur.role_id = roles.id
where p.perm_key in (
  'production-line-attendance-view',
  'production-line-attendance-manage',
  'production-line-attendance-report-view',
  'production-line-attendance-report-manage',
  'production-line-settings-view',
  'production-line-settings-manage'
)
group by roles.name, p.perm_key
order by roles.name, p.perm_key;

commit;
