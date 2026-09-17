alter table public.production_fg_wip_waste_logs
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

alter table public.production_fg_wip_waste_logs
  drop constraint if exists production_fg_wip_waste_logs_void_reason_check;

update public.production_fg_wip_waste_logs
set void_reason = 'รายการยกเลิกเดิมก่อนเพิ่มระบบบันทึกเหตุผล'
where voided_at is not null
  and nullif(btrim(void_reason), '') is null;

alter table public.production_fg_wip_waste_logs
  add constraint production_fg_wip_waste_logs_void_reason_check
  check (
    (voided_at is null and voided_by is null and void_reason is null)
    or
    (voided_at is not null and nullif(btrim(void_reason), '') is not null)
  );

comment on column public.production_fg_wip_waste_logs.void_reason is
  'Required audit reason when a waste entry is cancelled; cancelled rows remain immutable history.';

grant update on public.production_fg_wip_waste_logs to service_role;
