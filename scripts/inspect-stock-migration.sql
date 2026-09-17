begin read only;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;
select version,name,array_length(statements,1) from supabase_migrations.schema_migrations order by version desc limit 3;
commit;
