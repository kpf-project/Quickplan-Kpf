begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';

-- Inventory only: never seed counters or rewrite historical labels here.
select jsonb_build_object(
  'section', 'schema',
  'columns', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type)
      order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('production_weight_receipts', 'production_weight_scale_products',
        'production_weight_scale_lots', 'production_stock_movements')
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'definition', indexdef))
    from pg_indexes where schemaname = 'public'
      and tablename in ('production_weight_receipts', 'production_weight_scale_lots')
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'definition', pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and c.relname in ('production_weight_receipts', 'production_stock_movements')
  )
);

select jsonb_build_object('section', 'duplicate_barcodes', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select barcode, count(*) as row_count
  from public.production_weight_receipts
  where barcode is not null
  group by barcode having count(*) > 1
) d;

select jsonb_build_object('section', 'duplicate_request_ids', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select request_id::text as request_id, count(*) as row_count
  from public.production_weight_receipts
  where request_id is not null
  group by request_id having count(*) > 1
) d;

select jsonb_build_object('section', 'label_shapes', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select case when barcode ~ '^[0-9]{14}$' then 'numeric_14'
    when barcode is null then 'missing' else 'other_requires_review' end as shape,
    count(*) as row_count
  from public.production_weight_receipts group by 1
) d;

select jsonb_build_object('section', 'observed_product_digit_collisions', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select substring(r.barcode from 7 for 4) as product_digits,
    array_agg(distinct p.sku_code order by p.sku_code) as sku_codes
  from public.production_weight_receipts r
  join public.production_weight_scale_products p on p.id = r.product_config_id
  where r.barcode ~ '^[0-9]{14}$'
  group by 1 having count(distinct p.sku_code) > 1
) d;

select jsonb_build_object('section', 'product_identifiers_requiring_mapping', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select distinct sku_code from public.production_weight_scale_products
  where sku_code !~ '^[A-Z][A-Z0-9]*-[0-9]{4}$'
  order by sku_code
) d;

select jsonb_build_object('section', 'historical_daily_maxima', 'rows', coalesce(jsonb_agg(d), '[]'::jsonb))
from (
  select left(barcode, 10) as barcode_prefix,
    max(right(barcode, 4)::integer) as maximum_running,
    count(*) as receipt_count
  from public.production_weight_receipts
  where barcode ~ '^[0-9]{14}$'
  group by 1 order by 1
) d;

rollback;
