begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table before_mapping as
select *
from public.production_requisition_group_batches
where master_plan_no = 'MP202610001'
  and document_no in ('X6910/0070', 'X6910/0072')
for update;

do $$
begin
  if (select count(*) from before_mapping) <> 2 then
    raise exception 'Precondition failed: expected exactly 2 batches for X6910/0070 and X6910/0072';
  end if;

  if not exists (select 1 from public.products_cache where sku_code = 'B01-1009') then
    raise exception 'B01-1009 does not exist in products_cache';
  end if;

  if not exists (select 1 from public.products_cache where sku_code = 'BL0-5026') then
    raise exception 'BL0-5026 does not exist in products_cache';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(b) from before_mapping b) to '.backups/requisition-biscuit-20261005-parents-before.json'
\endif

update public.production_requisition_group_batches g
set metadata = jsonb_set(
  jsonb_set(g.metadata, '{parentSku}', to_jsonb('B01-1009'::text), true),
  '{parentSkuName}',
  to_jsonb(coalesce((select sku_name from public.products_cache where sku_code = 'B01-1009' limit 1), 'แม่มะลิ งาหอม รสงา 5 กก. (1 ปี๊บ)')),
  true
) || jsonb_build_object(
  'mappingCorrection', jsonb_build_object(
    'fromParentSku', null,
    'toParentSku', 'B01-1009',
    'reason', 'กำหนด parentSku ให้ตรงกับแผนผลิตและใบเบิก ERP แครกเกอร์งาหอม KPF XL',
    'correctedAt', now()
  )
)
where g.document_no = 'X6910/0070'
  and g.master_plan_no = 'MP202610001';

update public.production_requisition_group_batches g
set metadata = jsonb_set(
  jsonb_set(g.metadata, '{parentSku}', to_jsonb('BL0-5026'::text), true),
  '{parentSkuName}',
  to_jsonb(coalesce((select sku_name from public.products_cache where sku_code = 'BL0-5026' limit 1), 'คุกกี้ก้นหอย ครีมวานิลลา 5 กก. (1 ปี๊บ)')),
  true
) || jsonb_build_object(
  'mappingCorrection', jsonb_build_object(
    'fromParentSku', null,
    'toParentSku', 'BL0-5026',
    'reason', 'กำหนด parentSku ให้ตรงกับแผนผลิตและใบเบิก ERP คุกกี้นมครีมวานิลลา KPF XL',
    'correctedAt', now()
  )
)
where g.document_no = 'X6910/0072'
  and g.master_plan_no = 'MP202610001';

do $$
begin
  if not exists (
    select 1
    from public.production_requisition_group_batches
    where master_plan_no = 'MP202610001'
      and document_no = 'X6910/0070'
      and metadata->>'parentSku' = 'B01-1009'
  ) then
    raise exception 'X6910/0070 parentSku verification failed';
  end if;

  if not exists (
    select 1
    from public.production_requisition_group_batches
    where master_plan_no = 'MP202610001'
      and document_no = 'X6910/0072'
      and metadata->>'parentSku' = 'BL0-5026'
  ) then
    raise exception 'X6910/0072 parentSku verification failed';
  end if;
end;
$$;

select document_no, metadata->>'roomLabel' as room_label, metadata->>'parentSku' as parent_sku, metadata->>'parentSkuName' as parent_sku_name
from public.production_requisition_group_batches
where master_plan_no = 'MP202610001'
  and document_no in ('X6910/0063', 'X6910/0067', 'X6910/0068', 'X6910/0070', 'X6910/0072')
order by document_no;

\if :APPLY
commit;
\else
rollback;
\endif
