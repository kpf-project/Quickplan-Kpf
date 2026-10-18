begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table target_logs as
select l.*
from public.production_piece_rate_logs l
where l.actual_weighed_at >= timestamptz '2026-09-01 00:00:00+07'
  and l.actual_weighed_at < timestamptz '2026-10-01 00:00:00+07'
  and coalesce(l.doc_status, 'active') = 'active'
  and l.piece_rate_profile_name_snapshot = 'บรรจุปี๊บSize L'
  and l.input_mode_snapshot = 'pail'
  and l.wage_basis_snapshot = 'kg'
  and l.pay_rate_per_kg_snapshot = 2.5
for update;

do $$
begin
  if (select count(*) from target_logs) <> 71 then
    raise exception 'Expected 71 matching logs, found %', (select count(*) from target_logs);
  end if;

  if (select sum(normalized_kg_amount_snapshot) from target_logs) <> 17227.2
     or (select sum(wage_amount_snapshot) from target_logs) <> 43068 then
    raise exception 'Historical totals do not match the verified September snapshot';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(l) from target_logs l order by actual_weighed_at, id) to '.backups/piece-rate-size-l-september-2026-before.json'
\endif

update public.production_piece_rate_logs l
set pay_rate_per_kg_snapshot = 2,
    wage_amount_snapshot = trunc(l.normalized_kg_amount_snapshot) * 2
from target_logs before_row
where l.id = before_row.id
  and l.pay_rate_per_kg_snapshot = before_row.pay_rate_per_kg_snapshot
  and l.wage_amount_snapshot = before_row.wage_amount_snapshot;

do $$
begin
  if (select count(*) from target_logs b join public.production_piece_rate_logs l on l.id = b.id
      where l.pay_rate_per_kg_snapshot = 2
        and l.wage_amount_snapshot = trunc(l.normalized_kg_amount_snapshot) * 2) <> 71 then
    raise exception 'Post-update verification failed';
  end if;
end;
$$;

select
  count(*) as updated_rows,
  sum(normalized_kg_amount_snapshot) as physical_kg_unchanged,
  sum(wage_amount_snapshot) as recalculated_wage
from public.production_piece_rate_logs
where id in (select id from target_logs);

\if :APPLY
commit;
\else
rollback;
\endif
