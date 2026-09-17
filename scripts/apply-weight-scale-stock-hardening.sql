\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260907123000_harden_weight_scale_stock_lifecycle.sql
\if :APPLY
commit;
\else
rollback;
\endif
