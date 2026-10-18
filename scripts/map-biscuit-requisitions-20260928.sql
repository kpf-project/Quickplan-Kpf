begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table requested_mapping (
  document_no text primary key,
  room_id uuid not null,
  room_label text not null,
  parent_sku text,
  parent_sku_name text,
  workstream_code uuid not null,
  workstream_name text not null
) on commit drop;

insert into requested_mapping values
  ('X6909/0583', 'fb6cfd6f-22b8-42ef-b467-e31e82eaebd1', '[PRP01] ห้องชั่งสูตรตีครีม', null, null, '832c05c8-3e78-48f1-9c53-06bf01dc2955', 'ส่วนงานป้ายครีม'),
  ('X6909/0584', '1f50fe8c-86f8-45d6-ba07-eaf52bfe1436', '[BIS01] ห้องตีแป้งบิสกิต', null, null, '04ff0a3c-8998-4a48-b4db-3b1f4bc5f08a', 'ส่วนงานป้ายแยม'),
  ('X6909/0586', '3ef976cd-a2af-4d6f-9407-c47393c08de6', '[BIS03] ห้องป้ายแยม', 'BL0-1104', 'ขนมปังกรอบ แยมสับปะรด 5 กก. (1 ปี๊บ)', '91785356-9d92-44ce-811d-691f403b6eb7', 'บรรจุปี๊บงานเรือนจำ'),
  ('X6909/0587', '3ef976cd-a2af-4d6f-9407-c47393c08de6', '[BIS03] ห้องป้ายแยม', 'BL0-1104', 'ขนมปังกรอบ แยมสับปะรด 5 กก. (1 ปี๊บ)', '91785356-9d92-44ce-811d-691f403b6eb7', 'บรรจุปี๊บงานเรือนจำ'),
  ('X6909/0588', '9df879aa-df22-4f9d-ad54-e30ac5ec5e9e', '[BIS02] แครกเกอร์แผ่นเปล่า', 'B06-0006', 'แครกเกอร์สมุย KPF L', '88b50a05-ae13-4b14-aaf0-e162b31bcade', 'ส่วนขนมปังกรอบบรรจุปี๊บ'),
  ('X6909/0589', '391ca53a-0c14-4cdd-999b-4d1fee2405ca', '[BIS04] ห้องคุกกี้ป้ายครีม', 'BL0-5027', 'คุกกี้ก้นหอย ครีมใบเตย 5 กก. (1 ปี๊บ)', '832c05c8-3e78-48f1-9c53-06bf01dc2955', 'ส่วนงานป้ายครีม'),
  ('X6909/0590', '391ca53a-0c14-4cdd-999b-4d1fee2405ca', '[BIS04] ห้องคุกกี้ป้ายครีม', 'BL0-1106', 'คุกกี้ก้นหอย ครีมใบเตย 1.1 กก. (6ปี๊บ)', '832c05c8-3e78-48f1-9c53-06bf01dc2955', 'ส่วนงานป้ายครีม');

do $$
begin
  if exists (
    select 1
    from public.production_requisition_group_batches g
    join requested_mapping r on r.document_no = g.document_no
  ) then
    raise exception 'At least one requested document is already mapped';
  end if;

  if not exists (
    select 1 from public.production_departments
    where id = '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'::uuid
      and code = 'KP13' and name = 'แผนกบิสกิต' and deleted_at is null
  ) then
    raise exception 'Biscuit department precondition failed';
  end if;
end;
$$;

insert into public.production_requisition_group_batches (
  master_plan_no, claim_grain, status, confirmed_at, exported_at,
  document_no, group_name, metadata
)
select
  'MP202609004', 'daily', 'exported', now(), now(),
  r.document_no, r.room_label || ' 28/09/2569',
  jsonb_build_object(
    'roomId', r.room_id,
    'roomLabel', r.room_label,
    'shiftCode', 'SHIFT1',
    'shiftName', 'กะ 1',
    'exportMode', 'daily',
    'selectedDate', '2026-09-28',
    'parentSku', r.parent_sku,
    'parentSkuName', r.parent_sku_name,
    'workstreamCode', r.workstream_code,
    'workstreamName', r.workstream_name,
    'dispatchSplitMode', 'merge_all',
    'dispatchMaterialGroup', null,
    'ownerDepartmentId', '7bbac38b-362e-4131-9bc1-9b4b4b552ae2',
    'ownerDepartmentCode', 'KP13',
    'ownerDepartmentName', 'แผนกบิสกิต',
    'lookup27DepartmentCode', 'KP13',
    'externalHistoricalMapping', true,
    'mappingReason', 'ผู้ใช้ยืนยันจับคู่ใบเบิก ERP เดิมของแผนกบิสกิต กะ 1 วันที่ 28/09/2569'
  )
from requested_mapping r;

do $$
begin
  if (
    select count(*)
    from public.production_requisition_group_batches g
    join requested_mapping r on r.document_no = g.document_no
    where g.master_plan_no = 'MP202609004'
      and g.claim_grain = 'daily'
      and g.status = 'exported'
      and g.metadata->>'selectedDate' = '2026-09-28'
      and g.metadata->>'externalHistoricalMapping' = 'true'
  ) <> 7 then
    raise exception 'Mapping verification failed';
  end if;
end;
$$;

select document_no, metadata->>'roomLabel', metadata->>'parentSku'
from public.production_requisition_group_batches
where master_plan_no = 'MP202609004'
  and metadata->>'selectedDate' = '2026-09-28'
  and metadata->>'externalHistoricalMapping' = 'true'
order by document_no;

\if :APPLY
commit;
\else
rollback;
\endif
