create or replace function public.create_piece_rate_stock_issue_batch_atomic(
  p_barcodes text[], p_issue_type text, p_remark text,
  p_actor_user_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_total integer := coalesce(cardinality(p_barcodes), 0);
  v_succeeded integer := 0;
begin
  if v_total = 0 then
    raise exception using errcode = 'P0001', message = 'No barcodes selected';
  end if;
  if v_total > 50 then
    raise exception using errcode = 'P0001', message = 'A maximum of 50 barcodes is allowed';
  end if;

  foreach v_barcode in array p_barcodes loop
    v_barcode := upper(trim(coalesce(v_barcode, '')));
    if v_barcode = '' then continue; end if;
    begin
      v_result := public.create_piece_rate_stock_issue_atomic(
        v_barcode, null, p_issue_type, p_remark, p_actor_user_id
      );

      update public.production_piece_rate_stock_issues
      set metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
      where id = (v_result->>'issueId')::uuid;

      update public.production_stock_movements
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'employeeCode', p_metadata->>'issueEmployeeCode',
        'employeeName', p_metadata->>'issueEmployeeName',
        'fgProductCode', p_metadata->>'fgProductCode',
        'fgProductName', p_metadata->>'fgProductName'
      )
      where id = (v_result->>'movementId')::uuid;

      v_succeeded := v_succeeded + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode, 'ok', true, 'issueNo', v_result->>'issueNo'
      ));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode, 'ok', false, 'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'totalCount', v_total,
    'succeededCount', v_succeeded,
    'failedCount', v_total - v_succeeded,
    'results', v_results
  );
end;
$$;

revoke all on function public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb) to service_role;
