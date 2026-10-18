-- GENERATED: node scripts/build-role-task-install.mjs
-- User-run only. Keep ROLE_TASK_PERMISSIONS_ENABLED unset/false until verified.
-- Preserves legacy assignments. Never assigns departments or changes user roles.
-- One-time installation: refuses partial installs and reruns rather than restoring revoked grants.
begin;
lock table public.roles, public.user_roles, public.permissions, public.role_permissions in share row exclusive mode;
create temporary table task_migration_map(perm_key text primary key,label text,path text,group_key text,legacy_keys text[]) on commit drop;
insert into task_migration_map values
('production-piece-rate-rate-view','เปิดดูอัตราค่าแรงสำหรับบันทึกงาน','/production-line/attendance?task=production-piece-rate-rate-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-report-view','ดูรายงานผลผลิตรายชิ้นและประวัติแก้ไข','/production-line/attendance?task=production-piece-rate-report-view','production',array['production-line-attendance-report-view','production-line-attendance-report-manage','production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-report-export','ส่งออก Excel รายงานผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-report-export','production',array['production-line-attendance-report-view','production-line-attendance-report-manage','production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-report-print','พิมพ์เอกสารรายงานผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-report-print','production',array['production-line-attendance-report-view','production-line-attendance-report-manage','production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-adjust','แก้ไขเอกสารผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-adjust','production',array['production-line-attendance-report-manage','production-line-attendance-manage']::text[]),
('production-piece-rate-cancel','ยกเลิกเอกสารผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-cancel','production',array['production-line-attendance-report-manage','production-line-attendance-manage']::text[]),
('production-piece-rate-master-view','ดูข้อมูลสินค้าและพนักงานสำหรับบันทึกผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-master-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-record','บันทึกและนำเข้าผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-record','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-attendance-scan-report','ดูรายงานสแกนเข้าออกงาน','/production-line/attendance?task=production-attendance-scan-report','production',array['production-line-attendance-report-view','production-line-attendance-report-manage','production-line-attendance-view','production-line-attendance-manage','admin-attendance']::text[]),
('production-piece-rate-prison-receipt-view','ดูรายการรับผลผลิตรายชิ้นเข้าเรือนจำ','/production-line/attendance?task=production-piece-rate-prison-receipt-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-prison-receipt-write','บันทึกรับผลผลิตรายชิ้นเข้าเรือนจำ','/production-line/attendance?task=production-piece-rate-prison-receipt-write','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-prison-issue-view','ดู LOT ผลผลิตรายชิ้นพร้อมเบิกจากเรือนจำ','/production-line/attendance?task=production-piece-rate-prison-issue-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-prison-issue-write','เบิกผลผลิตรายชิ้นจากเรือนจำ','/production-line/attendance?task=production-piece-rate-prison-issue-write','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-piece-rate-waste-write','บันทึกของเสียผลผลิตรายชิ้น','/production-line/attendance?task=production-piece-rate-waste-write','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-piece-rate-stock-report','ดูรายงานสต็อกป้ายแยม','/production-line/attendance?task=production-piece-rate-stock-report','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-stock-balance-view','ดูยอดคงเหลือสต็อกผลิต','/api/production-stock/balance/summary?task=production-stock-balance-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-issue-view','ดูรายการและป้ายพร้อมเบิกสต็อกผลิต','/api/production-stock/issues?task=production-stock-issue-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-issue-write','บันทึกเบิกสต็อกผลิต','/api/production-stock/issues?task=production-stock-issue-write','production',array['production-line-attendance-manage']::text[]),
('production-stock-issue-report','ดูรายงานเบิกสต็อกผลิต','/api/production-stock/issues/report-summary?task=production-stock-issue-report','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-issue-cancel','ยกเลิกเบิกสต็อกผลิต','/api/production-stock/issues/[issueItemId]/cancel?task=production-stock-issue-cancel','production',array['production-line-attendance-manage']::text[]),
('production-jam-usage-view','ดูรายการใช้แยม','/api/production-stock/jam-usage?task=production-jam-usage-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-jam-usage-write','บันทึกการใช้แยม','/api/production-stock/jam-usage?task=production-jam-usage-write','production',array['production-line-attendance-manage']::text[]),
('production-stock-opening-write','นำเข้าสต็อกตั้งต้น','/api/production-stock/opening-balances/import?task=production-stock-opening-write','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-balance-view','ดูยอดคงเหลือสต็อกเรือนจำ','/api/production-stock/prison/balance/summary?task=production-prison-balance-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-inbound-view','ดูรายการรับเข้าสต็อกเรือนจำ','/api/production-stock/prison/inbound/cancelable?task=production-prison-inbound-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-inbound-cancel','ยกเลิกรับเข้าสต็อกเรือนจำ','/api/production-stock/prison/inbound/[inboundItemId]/cancel?task=production-prison-inbound-cancel','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-issue-view','ดูรายการและป้ายพร้อมเบิกสต็อกเรือนจำ','/api/production-stock/prison/issues?task=production-prison-issue-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-issue-write','บันทึกเบิกสต็อกเรือนจำ','/api/production-stock/prison/issues?task=production-prison-issue-write','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-issue-report','ดูรายงานเบิกสต็อกเรือนจำ','/api/production-stock/prison/issues/report-summary?task=production-prison-issue-report','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-prison-issue-cancel','ยกเลิกเบิกสต็อกเรือนจำ','/api/production-stock/prison/issues/[issueItemId]/cancel?task=production-prison-issue-cancel','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-return-view','ดูรายการคืนสต็อกผลิต','/api/production-stock/returns?task=production-stock-return-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-return-write','บันทึกคืนสต็อกผลิต','/api/production-stock/returns?task=production-stock-return-write','production',array['production-line-attendance-manage']::text[]),
('production-stock-waste-view','ดูรายการของเสียสต็อกผลิต','/api/production-stock/waste?task=production-stock-waste-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-stock-waste-write','บันทึกของเสียสต็อกผลิต','/api/production-stock/waste?task=production-stock-waste-write','production',array['production-line-attendance-manage']::text[]),
('production-scale-receipt-cancel','ยกเลิกใบรับชั่งระบบเดิม','/api/scale/receipts/[receiptId]/cancel?task=production-scale-receipt-cancel','production',array['production-line-attendance-manage']::text[]),
('production-scale-receipt-view','ดูใบรับชั่งระบบเดิม','/api/scale/receipts?task=production-scale-receipt-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-scale-receipt-export','ส่งออกใบรับชั่งระบบเดิมไป ERP','/api/scale/receipts/erp-export?task=production-scale-receipt-export','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-scale-receipt-report','ดูและพิมพ์รายงานรับชั่งระบบเดิม','/api/scale/receipts/report-summary?task=production-scale-receipt-report','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage','production-line-settings-view','production-line-settings-manage']::text[]),
('production-scale-receipt-write','บันทึกใบรับชั่งระบบเดิม','/api/scale/receipts?task=production-scale-receipt-write','production',array['production-line-attendance-manage']::text[]),
('production-fg-wip-view','ดูผลผลิต FG/WIP','/production-line/attendance?task=production-fg-wip-view','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-fg-wip-write','บันทึกผลผลิต FG/WIP และเบิก WIP','/production-line/attendance?task=production-fg-wip-write','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-fg-wip-opening-write','บันทึกสต็อกตั้งต้น WIP ปี๊บ','/production-line/attendance?task=production-fg-wip-opening-write','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-fg-wip-waste-write','บันทึกของเสีย FG/WIP','/production-line/attendance?task=production-fg-wip-waste-write','production',array['production-line-attendance-view','production-line-attendance-manage']::text[]),
('production-fg-wip-waste-cancel','ยกเลิกของเสีย FG/WIP','/production-line/attendance?task=production-fg-wip-waste-cancel','production',array['production-line-attendance-manage']::text[]),
('production-piece-rate-stock-view','ดูสต็อกป้ายแยม','/production-line/attendance?task=production-piece-rate-stock-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-piece-rate-stock-issue-write','เบิกสต็อกป้ายแยม','/production-line/attendance?task=production-piece-rate-stock-issue-write','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-piece-rate-stock-return-write','คืนสต็อกป้ายแยม','/production-line/attendance?task=production-piece-rate-stock-return-write','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-piece-rate-stock-issue-cancel','ยกเลิกเบิกป้ายแยม','/production-line/attendance?task=production-piece-rate-stock-issue-cancel','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-piece-rate-weigh-cancel','ยกเลิกชั่งป้ายแยม','/production-line/attendance?task=production-piece-rate-weigh-cancel','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-packing-output-view','ดูผลผลิตบรรจุไม่คิดค่าแรง','/production-line/attendance?task=production-packing-output-view','production',array['production-line-attendance-view','production-line-attendance-manage','production-line-attendance-report-view','production-line-attendance-report-manage']::text[]),
('production-packing-output-write','บันทึกผลผลิตบรรจุไม่คิดค่าแรง','/production-line/attendance?task=production-packing-output-write','production',array['production-line-attendance-manage','production-line-attendance-report-manage']::text[]),
('data-products-view','ดูสินค้า','/admin/products?task=data-products-view','Data',array['admin-products']::text[]),
('data-products-cost-view','ดูต้นทุนสินค้าและรหัสการค้า','/admin/products?task=data-products-cost-view','Data',array['admin-products']::text[]),
('data-trade-codes-view','ดูรหัสการค้า','/admin/products?task=data-trade-codes-view','Data',array['admin-products']::text[]),
('data-brand-types-view','ดูแบรนด์สินค้า','/admin/products?task=data-brand-types-view','Data',array['admin-products']::text[]),
('data-product-categories-view','ดูประเภทสินค้า','/admin/products?task=data-product-categories-view','Data',array['admin-products','raw-materials-summary','raw-materials-lot','raw-materials-movement']::text[]),
('data-suppliers-view','ดูผู้จำหน่าย','/admin/suppliers?task=data-suppliers-view','Data',array['admin-suppliers','raw-materials-summary']::text[]),
('data-sku-min-max-view','ดูสินค้าต่ำสุดสูงสุด','/admin/sku-min-max?task=data-sku-min-max-view','Data',array['admin-sku-min-max','raw-materials-summary']::text[]),
('hr-consolidated-view','ดูรายงานบุคลากรรวม','/admin/consolidated?task=hr-consolidated-view','HR',array['admin-consolidated']::text[]),
('hr-departments-view','ดูฝ่ายบุคลากร','/admin/employees?task=hr-departments-view','HR',array['admin-consolidated','admin-employees']::text[]),
('hr-employees-view','ดูพนักงาน','/admin/employees?task=hr-employees-view','HR',array['admin-employees']::text[]),
('raw-materials-lot-view','ดู LOT วัตถุดิบ','/production-line/costing?task=raw-materials-lot-view','Raw materials',array['raw-materials-lot']::text[]),
('raw-materials-summary-view','ดูสรุปวัตถุดิบ','/production-line/costing?task=raw-materials-summary-view','Raw materials',array['raw-materials-summary']::text[]),
('raw-materials-movement-view','ดูเคลื่อนไหววัตถุดิบ','/production-line/costing?task=raw-materials-movement-view','Raw materials',array['raw-materials-movement']::text[]),
('raw-materials-cost-view','ดูต้นทุน LOT วัตถุดิบ','/production-line/costing?task=raw-materials-cost-view','Raw materials',array['raw-materials-lot']::text[]),
('raw-materials-receipts-view','ดูรับวัตถุดิบ','/production-line/costing?task=raw-materials-receipts-view','Raw materials',array['raw-materials-lot']::text[]),
('raw-materials-production-receipts-view','ดูรับผลผลิต','/production-line/costing?task=raw-materials-production-receipts-view','Raw materials',array['raw-materials-lot']::text[]),
('raw-materials-returns-view','ดูคืนวัตถุดิบ','/production-line/costing?task=raw-materials-returns-view','Raw materials',array['raw-material-returns']::text[]),
('raw-materials-requisitions-view','ดูเบิกวัตถุดิบ','/production-line/costing?task=raw-materials-requisitions-view','Raw materials',array['admin-requisition']::text[]),
('production-settings-material-owners-view','ดูผู้รับผิดชอบวัตถุดิบ','/production-line/settings?task=production-settings-material-owners-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-material-owners-write','กำหนดผู้รับผิดชอบวัตถุดิบ','/production-line/settings?task=production-settings-material-owners-write','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-material-owners-delete','ลบผู้รับผิดชอบวัตถุดิบ','/production-line/settings?task=production-settings-material-owners-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-piece-rate-view','ดูการตั้งค่ารับเหมาและอัตราจ้าง','/production-line/settings?task=production-settings-piece-rate-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-piece-rate-rate-edit','แก้ไขการตั้งค่ารับเหมาและอัตราจ้าง','/production-line/settings?task=production-settings-piece-rate-rate-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-snack-wage-view','ดูการตั้งค่าขนมและอัตราจ้าง','/production-line/settings?task=production-settings-snack-wage-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-snack-wage-rate-edit','แก้ไขการตั้งค่าขนมและอัตราจ้าง','/production-line/settings?task=production-settings-snack-wage-rate-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-bom-view','ดูการตั้งค่าอนุมัติ BOM','/production-line/settings?task=production-settings-bom-view','Production settings',array['production-line-bom-view','production-line-bom-manage','production-line-bom-approve']::text[]),
('production-settings-routings-view','ดูเส้นทางผลิต','/production-line/settings?task=production-settings-routings-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-routings-create','เพิ่มเส้นทางผลิต','/production-line/settings?task=production-settings-routings-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-routings-delete','ลบเส้นทางผลิต','/production-line/settings?task=production-settings-routings-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-products-view','ดูสินค้าแผนก','/production-line/settings?task=production-settings-department-products-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-department-products-create','เพิ่มสินค้าแผนก','/production-line/settings?task=production-settings-department-products-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-products-edit','แก้ไขสินค้าแผนก','/production-line/settings?task=production-settings-department-products-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-products-delete','ลบสินค้าแผนก','/production-line/settings?task=production-settings-department-products-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-product-subcategories-view','ดูกลุ่มย่อยสินค้าแผนก','/production-line/settings?task=production-settings-department-product-subcategories-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-department-product-subcategories-create','เพิ่มกลุ่มย่อยสินค้าแผนก','/production-line/settings?task=production-settings-department-product-subcategories-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-product-subcategories-edit','แก้ไขกลุ่มย่อยสินค้าแผนก','/production-line/settings?task=production-settings-department-product-subcategories-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-product-subcategories-delete','ลบกลุ่มย่อยสินค้าแผนก','/production-line/settings?task=production-settings-department-product-subcategories-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-routing-components-view','ดูส่วนประกอบเส้นทางผลิต','/production-line/settings?task=production-settings-routing-components-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-routing-components-create','เพิ่มส่วนประกอบเส้นทางผลิต','/production-line/settings?task=production-settings-routing-components-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-category-products-view','ดูสินค้าในประเภท','/production-line/settings?task=production-settings-category-products-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-category-products-create','เพิ่มสินค้าในประเภท','/production-line/settings?task=production-settings-category-products-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-category-products-delete','ลบสินค้าในประเภท','/production-line/settings?task=production-settings-category-products-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-routing-components-explode-view','ดูโครงสร้างเส้นทางผลิต','/production-line/settings?task=production-settings-routing-components-explode-view','Production settings',array['production-line-settings-view','production-line-settings-manage','production-line-bom-view','production-line-bom-manage']::text[]),
('production-settings-delivery-points-edit','แก้ไขจุดส่งมอบ','/production-line/settings?task=production-settings-delivery-points-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-delivery-points-delete','ลบจุดส่งมอบ','/production-line/settings?task=production-settings-delivery-points-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-delivery-points-view','ดูจุดส่งมอบ','/production-line/settings?task=production-settings-delivery-points-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-delivery-points-create','เพิ่มจุดส่งมอบ','/production-line/settings?task=production-settings-delivery-points-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-routing-components-completeness-view','ดูความครบถ้วนเส้นทางผลิต','/production-line/settings?task=production-settings-routing-components-completeness-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-categories-edit','แก้ไขประเภทสินค้า','/production-line/settings?task=production-settings-categories-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-categories-delete','ลบประเภทสินค้า','/production-line/settings?task=production-settings-categories-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-categories-view','ดูประเภทสินค้า','/production-line/settings?task=production-settings-categories-view','Production settings',array['production-line-settings-view','production-line-settings-manage','production-line-bom-view','production-line-bom-manage']::text[]),
('production-settings-categories-create','เพิ่มประเภทสินค้า','/production-line/settings?task=production-settings-categories-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-work-centers-view','ดูศูนย์งาน','/production-line/settings?task=production-settings-work-centers-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-work-centers-edit','แก้ไขศูนย์งาน','/production-line/settings?task=production-settings-work-centers-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-work-centers-delete','ลบศูนย์งาน','/production-line/settings?task=production-settings-work-centers-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-work-centers-create','เพิ่มศูนย์งาน','/production-line/settings?task=production-settings-work-centers-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-wip-policies-view','ดูนโยบาย WIP','/production-line/settings?task=production-settings-wip-policies-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-wip-policies-create','เพิ่มนโยบาย WIP','/production-line/settings?task=production-settings-wip-policies-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-users-view','ดูผู้ใช้สำหรับแผนกผลิต','/production-line/settings?task=production-settings-users-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-products-cache-view','ดูสินค้าสำหรับตั้งค่าผลิต','/production-line/settings?task=production-settings-products-cache-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-departments-edit','แก้ไขแผนกผลิต','/production-line/settings?task=production-settings-departments-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-departments-delete','ลบแผนกผลิต','/production-line/settings?task=production-settings-departments-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-departments-view','ดูแผนกผลิต','/production-line/settings?task=production-settings-departments-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-departments-create','เพิ่มแผนกผลิต','/production-line/settings?task=production-settings-departments-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-users-view','ดูผู้ใช้ประจำแผนกผลิต','/production-line/settings?task=production-settings-department-users-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-department-users-create','เพิ่มผู้ใช้ประจำแผนกผลิต','/production-line/settings?task=production-settings-department-users-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-department-users-delete','ลบผู้ใช้ประจำแผนกผลิต','/production-line/settings?task=production-settings-department-users-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-shifts-edit','แก้ไขกะผลิต','/production-line/settings?task=production-settings-shifts-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-shifts-delete','ลบกะผลิต','/production-line/settings?task=production-settings-shifts-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-shifts-view','ดูกะผลิต','/production-line/settings?task=production-settings-shifts-view','Production settings',array['production-line-settings-view','production-line-settings-manage','production-line-planning-view','production-line-planning-manage','plan.calculate_own_dept','plan.edit_own_dept']::text[]),
('production-settings-shifts-create','เพิ่มกะผลิต','/production-line/settings?task=production-settings-shifts-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-section-shifts-edit','แก้ไขกะห้องผลิต','/production-line/settings?task=production-settings-section-shifts-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-section-shifts-delete','ลบกะห้องผลิต','/production-line/settings?task=production-settings-section-shifts-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-section-shifts-view','ดูกะห้องผลิต','/production-line/settings?task=production-settings-section-shifts-view','Production settings',array['production-line-settings-view','production-line-settings-manage','production-line-planning-view','production-line-planning-manage','plan.calculate_own_dept','plan.edit_own_dept']::text[]),
('production-settings-section-shifts-create','เพิ่มกะห้องผลิต','/production-line/settings?task=production-settings-section-shifts-create','Production settings',array['production-line-settings-manage']::text[]),
('raw-materials-returns-cost-view','ดูมูลค่าคืนวัตถุดิบ','/production-line/costing?task=raw-materials-returns-cost-view','Raw materials',array['raw-material-returns']::text[]),
('raw-materials-requisitions-cost-view','ดูมูลค่าเบิกวัตถุดิบ','/production-line/costing?task=raw-materials-requisitions-cost-view','Raw materials',array['admin-requisition']::text[]),
('hr-employee-photos-view','ดูรูปพนักงาน','/admin/employees?task=hr-employee-photos-view','HR',array['admin-employees','production-line-attendance-view','production-line-attendance-manage']::text[]),
('hr-employee-photos-upload','เพิ่มหรือเปลี่ยนรูปพนักงาน','/admin/employees?task=hr-employee-photos-upload','HR',array['admin-employees']::text[]),
('hr-employee-photos-delete','ลบรูปพนักงาน','/admin/employees?task=hr-employee-photos-delete','HR',array['admin-employees']::text[]),
('production-settings-pallet-barcodes-view','view บาร์โค้ดพาเลท','/production-line/settings/pallet-barcodes?task=production-settings-pallet-barcodes-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-pallet-barcodes-create','create บาร์โค้ดพาเลท','/production-line/settings/pallet-barcodes?task=production-settings-pallet-barcodes-create','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-pallet-barcodes-edit','edit บาร์โค้ดพาเลท','/production-line/settings/pallet-barcodes?task=production-settings-pallet-barcodes-edit','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-pallet-barcodes-delete','delete บาร์โค้ดพาเลท','/production-line/settings/pallet-barcodes?task=production-settings-pallet-barcodes-delete','Production settings',array['production-line-settings-manage']::text[]),
('production-settings-machine-view','ดูเครื่องพิมพ์','/production-line/settings/machine?task=production-settings-machine-view','Production settings',array['production-line-settings-view','production-line-settings-manage']::text[]),
('production-settings-machine-edit','ตั้งค่าเครื่องพิมพ์','/production-line/settings/machine?task=production-settings-machine-edit','Production settings',array['production-line-settings-manage']::text[]),
('raw-materials-deduction-view','ดูวัตถุดิบสำหรับเบิก','/production-line/costing?task=raw-materials-deduction-view','Raw materials',array['raw-materials-summary']::text[]),
('raw-materials-deduction-cost-view','ดูมูลค่าวัตถุดิบสำหรับเบิก','/production-line/costing?task=raw-materials-deduction-cost-view','Raw materials',array['raw-materials-summary']::text[]),
('production-cost-view','เปิดดูต้นทุนการผลิต','/production-line/costing?task=production-cost-view','production_cost',array['production-line-attendance-view']::text[]),
('production-cost-write','บันทึกและแก้ไขต้นทุนการผลิต','/production-line/costing?task=production-cost-write','production_cost',array['production-line-attendance-view']::text[]);
do $preflight$
begin
  if exists(select 1 from public.permissions p join task_migration_map m using(perm_key)) then
    raise exception 'Task permissions already exist or installation is partial. No grants changed.';
  end if;
end;
$preflight$;
create temporary table legacy_role_snapshot on commit drop as
  select rp.role_id,rp.permission_id,p.perm_key from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id;
insert into public.permissions(perm_key,label,path,group_key)
  select perm_key,label,path,group_key from task_migration_map;
insert into public.role_permissions(role_id,permission_id)
  select distinct old.role_id,p.id from legacy_role_snapshot old
  join task_migration_map m on old.perm_key=any(m.legacy_keys)
  join public.permissions p on p.perm_key=m.perm_key on conflict do nothing;
do $verify$
begin
  if exists(select 1 from legacy_role_snapshot old where not exists(
    select 1 from public.role_permissions rp where rp.role_id=old.role_id and rp.permission_id=old.permission_id
  )) then raise exception 'Legacy assignment changed. All changes rolled back.'; end if;
  if exists(select 1 from legacy_role_snapshot old join task_migration_map m on old.perm_key=any(m.legacy_keys)
    join public.permissions p on p.perm_key=m.perm_key where not exists(
      select 1 from public.role_permissions rp where rp.role_id=old.role_id and rp.permission_id=p.id
  )) then raise exception 'Capability preservation failed. All changes rolled back.'; end if;
  if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    join task_migration_map m on m.perm_key=p.perm_key where not exists(
      select 1 from legacy_role_snapshot old where old.role_id=rp.role_id and old.perm_key=any(m.legacy_keys)
  )) then raise exception 'Unexpected new role capability. All changes rolled back.'; end if;
end;
$verify$;
insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
  values(null,'permission_migration.install','permissions',null,
    jsonb_build_object('version','role-task-v1','legacy_assignments',(select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from legacy_role_snapshot s),
      'task_bindings',(select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from task_migration_map m)));
-- Included by build-role-task-install.mjs. User-run only.
create or replace function public.save_role_permissions_atomic(
  p_actor_id uuid, p_role_id uuid, p_role_key text, p_name text,
  p_description text, p_permission_ids uuid[], p_expected_permission_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare
  v_role public.roles;
  v_before uuid[];
  v_after uuid[];
begin
  if not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_actor_id and r.role_key = 'admin'
  ) then raise exception 'Administrator required' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Role name required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_after from unnest(coalesce(p_permission_ids, '{}'::uuid[])) value;
  if exists (
    select 1 from unnest(v_after) requested
    where not exists (select 1 from public.permissions p where p.id = requested)
  ) then raise exception 'Unknown permission' using errcode = '22023'; end if;
  if p_role_id is null then
    if nullif(btrim(p_role_key), '') is null then
      raise exception 'Role key required' using errcode = '22023';
    end if;
    insert into public.roles(role_key,name,description,created_by,updated_by)
      values(p_role_key,btrim(p_name),nullif(p_description,''),p_actor_id,p_actor_id)
      returning * into v_role;
    v_before := '{}'::uuid[];
  else
    select * into v_role from public.roles where id = p_role_id for update;
    if not found then raise exception 'Role not found' using errcode = 'P0002'; end if;
    if v_role.is_system then raise exception 'System role is read only' using errcode = '42501'; end if;
    select coalesce(array_agg(permission_id order by permission_id), '{}'::uuid[])
      into v_before from public.role_permissions where role_id = p_role_id;
    if p_expected_permission_ids is null then
      raise exception 'Reload role before saving' using errcode = '22023';
    end if;
    if v_before <> (select coalesce(array_agg(distinct value order by value),'{}'::uuid[]) from unnest(p_expected_permission_ids) value) then
      raise exception 'Role changed by another administrator. Reload before saving.' using errcode = 'P0001';
    end if;
    update public.roles set name=btrim(p_name),description=nullif(p_description,''),updated_by=p_actor_id
      where id=p_role_id returning * into v_role;
  end if;
  delete from public.role_permissions where role_id=v_role.id;
  insert into public.role_permissions(role_id,permission_id,created_by)
    select v_role.id, value, p_actor_id from unnest(v_after) value;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(p_actor_id,case when p_role_id is null then 'role.create' else 'role.update' end,
      'roles',v_role.id,
      jsonb_build_object('name',v_role.name,'before',v_before,'after',v_after,'permission_count',cardinality(v_after)));
  return to_jsonb(v_role);
end;
$function$;
revoke all on function public.save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[]) to service_role;

select m.perm_key,m.label,count(rp.role_id) as assigned_roles
  from task_migration_map m join public.permissions p on p.perm_key=m.perm_key
  left join public.role_permissions rp on rp.permission_id=p.id group by m.perm_key,m.label order by m.perm_key;
notify pgrst, 'reload schema';
commit;
