do $$
declare
  corrected_count integer;
  old_rate_count integer;
  corrected_wage numeric;
  physical_kg numeric;
begin
  select
    count(*) filter (
      where pay_rate_per_kg_snapshot = 2
        and wage_amount_snapshot = trunc(normalized_kg_amount_snapshot) * 2
    ),
    count(*) filter (where pay_rate_per_kg_snapshot = 2.5),
    sum(wage_amount_snapshot) filter (where pay_rate_per_kg_snapshot = 2),
    sum(normalized_kg_amount_snapshot) filter (where pay_rate_per_kg_snapshot = 2)
  into corrected_count, old_rate_count, corrected_wage, physical_kg
  from public.production_piece_rate_logs
  where actual_weighed_at >= timestamptz '2026-09-01 00:00:00+07'
    and actual_weighed_at < timestamptz '2026-10-01 00:00:00+07'
    and coalesce(doc_status, 'active') = 'active'
    and piece_rate_profile_name_snapshot = 'บรรจุปี๊บSize L'
    and input_mode_snapshot = 'pail'
    and wage_basis_snapshot = 'kg';

  if corrected_count <> 71
     or old_rate_count <> 0
     or corrected_wage <> 34430
     or physical_kg <> 17227.2 then
    raise exception 'Verification failed: corrected=%, old=%, wage=%, kg=%',
      corrected_count, old_rate_count, corrected_wage, physical_kg;
  end if;
end;
$$;

select
  count(*) as corrected_rows,
  count(*) filter (where pay_rate_per_kg_snapshot = 2.5) as remaining_old_rate_rows,
  sum(normalized_kg_amount_snapshot) as physical_kg,
  sum(wage_amount_snapshot) as wage_total
from public.production_piece_rate_logs
where actual_weighed_at >= timestamptz '2026-09-01 00:00:00+07'
  and actual_weighed_at < timestamptz '2026-10-01 00:00:00+07'
  and coalesce(doc_status, 'active') = 'active'
  and piece_rate_profile_name_snapshot = 'บรรจุปี๊บSize L'
  and input_mode_snapshot = 'pail'
  and wage_basis_snapshot = 'kg';
