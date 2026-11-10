-- 0022 Production averages weighted by kg.
--   section_stats averaged each batch's yield and cost per kg as if every batch were the same size, so a
--   small batch moved the figure as much as a big one, and a finished batch with no main output was left
--   out. The dashboard already works these out as total out / total in; the Production page now does too.
-- Safe to run again.

create or replace function public.section_stats(p_kind text)
returns table (running bigint, running_kg numeric, completed bigint, completed_kg numeric,
               avg_yield_pct numeric, avg_cost_per_kg numeric, avg_minutes numeric)
language sql stable as $$
  select count(*) filter (where status = 'RUNNING'),
    coalesce(sum(input_kg) filter (where status = 'RUNNING'), 0),
    count(*) filter (where status = 'COMPLETED'),
    coalesce(sum(main_kg) filter (where status = 'COMPLETED'), 0),
    case when sum(input_kg) filter (where status = 'COMPLETED') > 0
      then round(100 * sum(main_kg) filter (where status = 'COMPLETED') / sum(input_kg) filter (where status = 'COMPLETED'), 2) end,
    case when sum(main_kg) filter (where status = 'COMPLETED') > 0
      then round(sum(main_cost) filter (where status = 'COMPLETED') / sum(main_kg) filter (where status = 'COMPLETED'), 4) end,
    avg(minutes_taken) filter (where status = 'COMPLETED')
  from public.v_production_batches where kind = p_kind
$$;
grant execute on function public.section_stats(text) to authenticated;

create or replace function public.schema_version()
returns int language sql immutable as $$ select 22 $$;
grant execute on function public.schema_version() to authenticated;
