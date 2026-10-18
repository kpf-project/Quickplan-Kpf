BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  PERFORM 1 FROM public.production_piece_rate_waste_logs
  WHERE id = 'd326e422-4a08-487a-b5aa-228b3719c645'
    AND product_goods_code_snapshot = 'WKB-0064'
    AND actual_weighed_at = timestamptz '2026-10-08T08:33:24.335Z'
    AND waste_weight_kg = 16.820 AND waste_category = 'label_scrap'
    AND status = 'confirmed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Test waste precondition failed'; END IF;
END $$;
\if :APPLY
\copy (SELECT to_jsonb(w) FROM public.production_piece_rate_waste_logs w WHERE id = 'd326e422-4a08-487a-b5aa-228b3719c645') TO '.backups/wkb0064-test-waste-20261008-before.json'
\endif
INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, metadata)
SELECT operator_user_id, 'production-piece-rate-waste.cancel-test', 'production_piece_rate_waste_logs', id,
  jsonb_build_object('reason', 'User confirmed test waste; remove from reports', 'before', to_jsonb(w))
FROM public.production_piece_rate_waste_logs w WHERE id = 'd326e422-4a08-487a-b5aa-228b3719c645';
UPDATE public.production_piece_rate_waste_logs
SET status = 'cancelled', cancelled_at = now(),
    metadata = metadata || jsonb_build_object('correctionReason', 'User confirmed test waste; remove from reports')
WHERE id = 'd326e422-4a08-487a-b5aa-228b3719c645';
SELECT id, status, waste_weight_kg FROM public.production_piece_rate_waste_logs
WHERE id = 'd326e422-4a08-487a-b5aa-228b3719c645';
\if :APPLY
COMMIT;
\else
ROLLBACK;
\endif
