-- Fix safe piece-rate insert RPC so omitted columns use table defaults.

BEGIN;

CREATE OR REPLACE FUNCTION public.insert_piece_rate_log_safely(
  p_payload jsonb,
  p_employee_code text,
  p_product_barcode text,
  p_machine_code text,
  p_source text,
  p_input_value numeric,
  p_captured_at timestamptz,
  p_duplicate_window_seconds integer DEFAULT 300,
  p_weight_tolerance numeric DEFAULT 0.02
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_existing_row record;
  v_inserted_row public.production_piece_rate_logs;
  v_payload jsonb;
  v_cols text;
  v_query text;
BEGIN
  v_lock_key := hashtext(p_employee_code || '|' || p_product_barcode);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_existing_row
  FROM public.production_piece_rate_logs
  WHERE (
    (
      employee_code = p_employee_code
      OR raw_employee_qr_payload = p_employee_code
    )
    AND product_barcode_snapshot = p_product_barcode
    AND machine_code = p_machine_code
    AND source = p_source
    AND doc_status = 'active'
    AND abs(input_value - p_input_value) <= p_weight_tolerance
    AND abs(extract(epoch from (coalesce(actual_weighed_at, logged_at) - p_captured_at))) <= p_duplicate_window_seconds
  )
  ORDER BY logged_at DESC
  LIMIT 1;

  IF v_existing_row.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'duplicated', true,
      'data', to_jsonb(v_existing_row)
    );
  END IF;

  v_payload := coalesce(p_payload, '{}'::jsonb) - 'id';

  SELECT string_agg(quote_ident(columns.column_name), ', ' ORDER BY columns.ordinal_position)
  INTO v_cols
  FROM information_schema.columns AS columns
  JOIN jsonb_object_keys(v_payload) AS payload_keys(column_name)
    ON payload_keys.column_name = columns.column_name
  WHERE columns.table_schema = 'public'
    AND columns.table_name = 'production_piece_rate_logs'
    AND columns.is_generated = 'NEVER'
    AND columns.is_identity = 'NO';

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'insert_piece_rate_log_safely payload has no insertable columns'
      USING ERRCODE = '22023';
  END IF;

  v_query := format(
    'INSERT INTO public.production_piece_rate_logs (%s)
     SELECT %s
     FROM (SELECT (jsonb_populate_record(NULL::public.production_piece_rate_logs, $1)).*) AS tmp
     RETURNING *',
    v_cols,
    v_cols
  );

  EXECUTE v_query USING v_payload INTO v_inserted_row;

  RETURN jsonb_build_object(
    'duplicated', false,
    'data', to_jsonb(v_inserted_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) TO service_role;

COMMIT;
