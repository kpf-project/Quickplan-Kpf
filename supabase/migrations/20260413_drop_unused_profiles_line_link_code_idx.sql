begin;

-- Conservative cleanup round 1:
-- No query path currently filters profiles by line_link_code.
drop index if exists public.profiles_line_link_code_idx;

commit;
