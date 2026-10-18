select
  p.id,
  p.dept_id,
  d.name as department_name,
  p.master_plan_no,
  p.week_start_date,
  p.period_end,
  p.status,
  count(r.id) as row_count
from production_schedule_plans p
left join production_departments d on d.id = p.dept_id
left join production_schedule_rows r on r.plan_id = p.id
where upper(trim(p.master_plan_no)) = 'MP202609002'
group by p.id, p.dept_id, d.name, p.master_plan_no, p.week_start_date, p.period_end, p.status
order by d.name;
