alter table public.production_fg_wip_waste_logs
  alter column lot_no drop not null;

alter table public.production_fg_wip_waste_logs
  add column if not exists waste_barcode text;

update public.production_fg_wip_waste_logs
set waste_barcode = 'WSTLEGACY' || upper(replace(id::text, '-', ''))
where waste_barcode is null;

alter table public.production_fg_wip_waste_logs
  alter column waste_barcode set not null;

create unique index if not exists production_fg_wip_waste_barcode_uidx
  on public.production_fg_wip_waste_logs (waste_barcode);

comment on column public.production_fg_wip_waste_logs.lot_no is
  'Legacy optional field. New waste records are not linked to a production LOT.';

comment on column public.production_fg_wip_waste_logs.waste_barcode is
  'Unique CODE128 value printed on the 80x50 mm waste label.';
