begin;
select wc.code,wc.name,wc.consolidate_requisition_preview_by_date from public.production_work_centers wc where wc.deleted_at is null order by wc.code;
select p.plan_id,p.sku_code,p.sku_name,p.planned_qty,p.unit,p.schedule_section_name,p.schedule_section_def_id,p.bom_snapshot->0->>'source' as snapshot_source,
  m->>'skuCode' as material_sku,m->>'goodsCode' as goods_code,m->>'issueQty' as issue_qty,m->>'requiredQty' as required_qty,m->>'explosionDepth' as depth
from public.production_plan_status p
cross join lateral jsonb_array_elements(coalesce(p.bom_snapshot->0->'materials','[]'::jsonb)) m
where p.master_plan_no='MP202610002' and p.period_start='2026-10-13' and p.plan_kind='sub'
  and (m->>'skuCode' in ('M01-0004','M01-0013','M01-00130'))
order by p.schedule_section_name,p.sku_code,p.plan_id;
select scope_key,doc.key as document_key,
  line->>'materialGoodsCode' as goods_code,line->'qtyByDate'->>'2026-10-13' as draft_qty
from public.production_requisition_preview_drafts d
cross join lateral jsonb_each(d.draft_payload) doc
cross join lateral jsonb_array_elements(doc.value) line
where d.master_plan_no='MP202610002'
  and line->>'materialGoodsCode' in ('M01-0004','M01-0013','M01-00130');
select p.sku_code,p.planned_qty,i.material_sku_code,i.material_goods_code,i.qty,v.base_batch,v.wip_qty_input_mode,i.calculation_basis
from public.production_plan_status p
join public.production_bom_versions v on v.id=p.bom_version_id
join public.production_bom_items i on i.version_id=v.id
join public.production_work_centers wc on wc.id::text=p.schedule_section_def_id
where p.master_plan_no='MP202610002' and p.period_start='2026-10-13' and p.plan_kind='sub'
and i.material_sku_code in ('M01-0004','M01-0013');
rollback;
