create sequence if not exists public.piece_rate_prison_barcode_seq;

with numbered as (
  select
    id,
    source_document_no as legacy_barcode,
    movement_date,
    row_number() over (
      partition by source_document_no
      order by movement_at, id
    ) as line_no
  from public.production_stock_movements
  where source_document_type = 'piece_rate_prison_issue'
), mapped as (
  select
    id,
    legacy_barcode,
    format(
      'PRW-%s-%s-%s',
      to_char(movement_date, 'YYMMDD'),
      lpad(nextval('public.piece_rate_prison_barcode_seq')::text, 6, '0'),
      lpad(line_no::text, 2, '0')
    ) as short_barcode
  from numbered
)
update public.production_stock_movements movements
set
  source_document_no = mapped.short_barcode,
  metadata = coalesce(movements.metadata, '{}'::jsonb)
    || jsonb_build_object('legacyBarcode', mapped.legacy_barcode)
from mapped
where movements.id = mapped.id;

notify pgrst, 'reload schema';
