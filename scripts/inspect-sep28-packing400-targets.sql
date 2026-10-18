with targets as (
  select v.*
  from public.production_stock_issue_report_lines_v v
  where v.issue_date = date '2026-09-28'
    and v.issue_type = 'KPF'
    and v.document_status = 'confirmed'
    and v.item_status = 'confirmed'
    and (
      (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
      or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
    )
)
select product_code, lot_no, destination_room_code, destination_room_name_snapshot,
       count(*) as item_count, round(sum(quantity), 3) as quantity,
       round(sum(weight_kg), 3) as weight_kg,
       count(distinct issue_document_id) as document_count
from targets
group by product_code, lot_no, destination_room_code, destination_room_name_snapshot
order by product_code;

with targets as (
  select v.*
  from public.production_stock_issue_report_lines_v v
  where v.issue_date = date '2026-09-28'
    and v.issue_type = 'KPF'
    and v.document_status = 'confirmed'
    and v.item_status = 'confirmed'
    and (
      (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
      or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
    )
)
select jsonb_build_object(
  'documentIds', (select jsonb_agg(issue_document_id order by issue_no) from targets),
  'itemIds', (select jsonb_agg(issue_item_id order by issue_no) from targets),
  'issueNos', (select jsonb_agg(issue_no order by issue_no) from targets),
  'movementIds', (
    select jsonb_agg(m.id order by m.source_document_no)
    from public.production_stock_movements m
    where m.source_document_type = 'stock_issue'
      and m.source_document_no in (select issue_no from targets)
      and m.movement_type = 'issue_out'
  ),
  'movementCount', (
    select count(*)
    from public.production_stock_movements m
    where m.source_document_type = 'stock_issue'
      and m.source_document_no in (select issue_no from targets)
      and m.movement_type = 'issue_out'
  )
);

select d.issue_no, d.metadata as document_metadata, m.metadata as movement_metadata
from public.production_stock_issue_documents d
join public.production_stock_movements m
  on m.source_document_type = 'stock_issue'
 and m.source_document_no = d.issue_no
 and m.movement_type = 'issue_out'
where d.id in (
  '50871921-245b-4663-b964-ef23f4d5d7ac',
  'd9fe489f-2a97-4158-8455-bc3e59be3faf'
)
order by d.issue_no;
