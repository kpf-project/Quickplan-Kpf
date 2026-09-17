create or replace function public.allocate_requisition_document_numbers(
  requested_at timestamptz default timezone('utc', now()),
  requested_count integer default 1
)
returns table (
  sequence_key text,
  sequence_value integer,
  document_no text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  safe_requested_at timestamptz := coalesce(requested_at, timezone('utc', now()));
  safe_requested_count integer := greatest(coalesce(requested_count, 0), 0);
  be_year integer;
  yy text;
  mm text;
  seq_key text;
  final_last_value integer;
  start_value integer;
begin
  if safe_requested_count <= 0 then
    return;
  end if;

  be_year := extract(year from safe_requested_at at time zone 'Asia/Bangkok')::integer + 543;
  yy := right(be_year::text, 2);
  mm := lpad(extract(month from safe_requested_at at time zone 'Asia/Bangkok')::integer::text, 2, '0');
  seq_key := 'XA' || yy || mm;

  insert into public.production_requisition_document_sequences (sequence_key, last_value, updated_at)
  values (seq_key, safe_requested_count, timezone('utc', now()))
  on conflict (sequence_key)
  do update
    set last_value = public.production_requisition_document_sequences.last_value + safe_requested_count,
        updated_at = timezone('utc', now())
  returning public.production_requisition_document_sequences.last_value into final_last_value;

  start_value := final_last_value - safe_requested_count + 1;

  return query
  select
    seq_key,
    generated.value,
    seq_key || '/' || lpad(generated.value::text, 4, '0')
  from generate_series(start_value, final_last_value) as generated(value);
end;
$$;
