\pset pager off
begin read only;

select rr.barcode return_barcode,rr.net_weight_kg return_weight_kg,
       rr.metadata->>'sourceBarcode' source_barcode,
       d.issue_date selected_issue_date,d.issue_no,
       i.weight_kg original_issue_weight_kg,i.status item_status,d.status document_status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) voided_at
from public.production_weight_receipts rr
left join public.production_stock_issue_items i
  on i.id::text=rr.metadata->>'sourceIssueItemId'
left join public.production_stock_issue_documents d on d.id=i.issue_document_id
where rr.barcode in (
  '24082600530154X01','24082600530147X01',
  '24082600530148X01','24082600530153X01'
)
order by rr.barcode;

select i.barcode,d.issue_date selected_issue_date,d.issue_no,
       i.weight_kg,i.status item_status,d.status document_status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) voided_at,
       i.void_reason
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.barcode in (
  '24082600530154','24082600530147',
  '24082600530148','24082600530153'
)
order by i.barcode,d.issue_date,i.created_at;

commit;
