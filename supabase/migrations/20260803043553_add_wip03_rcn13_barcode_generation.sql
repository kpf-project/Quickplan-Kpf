create sequence if not exists public.pallet_wip03_rcn13_sequence
  as bigint
  minvalue 1
  maxvalue 9999999999
  start with 1;

grant usage, select on sequence public.pallet_wip03_rcn13_sequence to service_role;

do $$
declare
  current_max bigint;
begin
  select coalesce(max(substring(product_barcode from 3 for 10)::bigint), 0)
    into current_max
  from public.pallet_trade_code_barcodes
  where product_barcode ~ '^04[0-9]{11}$';

  perform setval(
    'public.pallet_wip03_rcn13_sequence',
    greatest(current_max, 1),
    current_max > 0
  );
end $$;

create or replace function public.create_wip03_rcn13_barcode(
  p_goods_code text,
  p_sku_code text,
  p_created_by uuid
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing text;
  v_body text;
  v_barcode text;
  v_sequence bigint;
  v_sum integer;
  v_digit integer;
  v_position integer;
begin
  select product_barcode
    into v_existing
  from public.pallet_trade_code_barcodes
  where goods_code = upper(trim(p_goods_code));

  if found then
    return v_existing;
  end if;

  for v_position in 1..20 loop
    v_sequence := nextval('public.pallet_wip03_rcn13_sequence');
    v_body := '04' || lpad(v_sequence::text, 10, '0');
    v_sum := 0;

    for v_digit in 1..12 loop
      v_sum := v_sum
        + substring(v_body from 13 - v_digit for 1)::integer
          * case when v_digit % 2 = 1 then 3 else 1 end;
    end loop;

    v_barcode := v_body || ((10 - (v_sum % 10)) % 10)::text;

    insert into public.pallet_trade_code_barcodes (
      goods_code,
      sku_code,
      product_barcode,
      created_by,
      updated_by
    )
    values (
      upper(trim(p_goods_code)),
      upper(trim(p_sku_code)),
      v_barcode,
      p_created_by,
      p_created_by
    )
    on conflict do nothing;

    select product_barcode
      into v_existing
    from public.pallet_trade_code_barcodes
    where goods_code = upper(trim(p_goods_code));

    if found then
      return v_existing;
    end if;
  end loop;

  raise exception 'Unable to allocate a unique WIP 03 RCN-13 barcode';
end;
$$;

revoke all on function public.create_wip03_rcn13_barcode(text, text, uuid) from public;
grant execute on function public.create_wip03_rcn13_barcode(text, text, uuid) to service_role;
