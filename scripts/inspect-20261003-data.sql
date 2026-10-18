SELECT * 
FROM get_production_stock_activity_summary_by_room(
    '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'::uuid,
    '2026-10-03',
    '2026-10-03',
    ARRAY['KPF'],
    NULL
);
