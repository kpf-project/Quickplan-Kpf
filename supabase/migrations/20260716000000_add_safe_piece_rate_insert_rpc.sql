-- Migration: 20260716000000_add_safe_piece_rate_insert_rpc.sql
-- Description: Create thread-safe insert function with advisory locking for piece-rate logs to prevent concurrent duplicate syncs.

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
  v_row public.production_piece_rate_logs;
  v_inserted_row public.production_piece_rate_logs;
  v_cols text;
  v_query text;
BEGIN
  -- Generate a stable hash key for the lock based on employee_code and product_barcode
  v_lock_key := hashtext(p_employee_code || '|' || p_product_barcode);
  
  -- Acquire an advisory lock for the duration of this transaction
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  -- Check for duplicates in production_piece_rate_logs table
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

  -- Populate and insert the new row
  v_row := jsonb_populate_record(NULL::public.production_piece_rate_logs, p_payload);
  
  -- Dynamically get all columns except generated ones
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'production_piece_rate_logs'
    AND is_generated = 'NEVER';

  v_query := format(
    'INSERT INTO public.production_piece_rate_logs (%s) SELECT %s FROM (SELECT ($1).*) AS tmp RETURNING *',
    v_cols,
    v_cols
  );

  EXECUTE v_query USING v_row INTO v_inserted_row;

  RETURN jsonb_build_object(
    'duplicated', false,
    'data', to_jsonb(v_inserted_row)
  );
END;
$$;

-- Revoke execute from public and grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_piece_rate_log_safely(jsonb, text, text, text, text, numeric, timestamptz, integer, numeric) TO service_role;

COMMIT;
