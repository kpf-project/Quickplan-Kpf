alter table public.production_weight_receipts
  add column if not exists request_id uuid;

create unique index if not exists production_weight_receipts_request_id_uidx
  on public.production_weight_receipts (request_id)
  where request_id is not null;

create or replace function public.create_production_stock_issue_batch_atomic(
  p_barcodes text[],
  p_issue_type text,
  p_actor_user_id uuid,
  p_remark text,
  p_issue_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text;
  v_scope_key text;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(array_length(p_barcodes, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'กรุณาเลือกรายการที่ต้องการเบิก';
  end if;
  if array_length(p_barcodes, 1) > 100 then
    raise exception using errcode = 'P0001', message = 'เลือกได้ไม่เกิน 100 รายการต่อครั้ง';
  end if;
  if exists (
    select 1
    from unnest(p_barcodes) barcode
    group by upper(trim(barcode))
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'พบบาร์โค้ดซ้ำในรายการที่เลือก';
  end if;

  for v_scope_key in
    select distinct concat_ws('|', products.department_id::text, products.sku_code, lots.lot_code)
    from public.production_weight_receipts receipts
    join public.production_weight_scale_products products on products.id = receipts.product_config_id
    join public.production_weight_scale_lots lots on lots.id = receipts.lot_id
    where upper(receipts.barcode) = any (
      select upper(trim(barcode)) from unnest(p_barcodes) barcode
    )
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));
  end loop;

  foreach v_barcode in array p_barcodes loop
    if nullif(trim(v_barcode), '') is null then
      raise exception using errcode = 'P0001', message = 'พบบาร์โค้ดว่างในรายการที่เลือก';
    end if;
    v_results := v_results || jsonb_build_array(
      public.create_production_stock_issue(
        trim(v_barcode), p_issue_type, p_actor_user_id, p_remark, p_issue_date
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.create_production_stock_issue_batch_atomic(text[], text, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.create_production_stock_issue_batch_atomic(text[], text, uuid, text, date)
  to service_role;

notify pgrst, 'reload schema';
