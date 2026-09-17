begin read only;
with r as (
 select barcode,net_weight_kg,gross_weight_kg,tare_weight_kg,
        row_number() over(order by weighed_at,barcode) rn
 from public.production_weight_receipts
 where lot_id='32231b4f-d00a-4075-8b03-cdd456a0d849'
   and status='recorded'
), windows as (
 select a.rn,a.barcode start_barcode,z.barcode end_barcode,
        (select count(*) from r x where x.rn between a.rn and a.rn+39) qty,
        (select sum(net_weight_kg) from r x where x.rn between a.rn and a.rn+39) net_kg,
        (select sum(gross_weight_kg) from r x where x.rn between a.rn and a.rn+39) gross_kg
 from r a left join r z on z.rn=a.rn+39
)
select * from windows where qty=40 and (net_kg between 751.60 and 751.68 or gross_kg between 751.60 and 751.68);

select i1.barcode,i1.weight_kg,i1.status,d1.issue_date,
       i2.barcode,i2.weight_kg,i2.status,d2.issue_date
from public.production_stock_issue_items i1
join public.production_stock_issue_documents d1 on d1.id=i1.issue_document_id
join public.production_stock_issue_items i2 on i2.lot_no=i1.lot_no and i2.id>i1.id
join public.production_stock_issue_documents d2 on d2.id=i2.issue_document_id
where i1.product_code='WKB-0053' and i1.lot_no='2408260053-1'
  and round(i1.weight_kg+i2.weight_kg,2)=68.89;

select count(*) qty,sum(net_weight_kg) net_kg,sum(gross_weight_kg) gross_kg,sum(tare_weight_kg) tare_kg
from public.production_weight_receipts
where barcode ~ '^240826005300(0[1-9]|[1-3][0-9]|40)$';
commit;
