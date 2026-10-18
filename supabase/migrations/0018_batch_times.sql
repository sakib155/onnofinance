-- 0018 Batch timing and where the paddy came from.
--   * Each batch records the time the material went in (started_at) and the time the output was
--     entered (completed_at), so the app shows how long drying and sorting took.
--   * Every lot shows the supplier and purchase it came from (also through godown transfers),
--     and each batch lists the lots, suppliers and kg actually used.
-- Safe to run again.

------------------------------------------------------------------------------------------
-- 1. Start and finish times
------------------------------------------------------------------------------------------
alter table public.production_batches add column if not exists started_at timestamptz;
alter table public.production_batches add column if not exists completed_at timestamptz;

-- Existing batches: use the moment they were entered when that was on their start date
update public.production_batches set started_at = case
    when (created_at at time zone 'Asia/Dhaka')::date = start_date then created_at
    else (start_date + time '08:00') at time zone 'Asia/Dhaka' end
where started_at is null;

-- Times default to "now"; finishing before starting is refused
create or replace function public.batch_times()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := coalesce(new.started_at, now());
  end if;
  if new.status = 'COMPLETED' and (tg_op = 'INSERT' or old.status is distinct from 'COMPLETED') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'COMPLETED' then
    new.completed_at := null;
  end if;
  if new.completed_at is not null and new.started_at is not null and new.completed_at < new.started_at then
    raise exception 'The finish time is before the start time';
  end if;
  return new;
end;
$$;

drop trigger if exists batch_times on public.production_batches;
create trigger batch_times before insert or update on public.production_batches
for each row execute function public.batch_times();

-- The batch functions take the times the user entered: started_at when saving, completed_at when finishing.
-- Each function's statement is extended in place; the rest of its body is unchanged.
do $$
declare
  v_def text;
  v_new text;
  r record;
begin
  for r in select * from (values
    ('save_production_batch',
     'insert into public.production_batches (batch_no, kind, start_date, status,',
     'insert into public.production_batches (started_at, batch_no, kind, start_date, status,'),
    ('save_production_batch',
     'values (public.next_doc_no(case v_kind',
     'values (nullif(p->>''started_at'', '''')::timestamptz, public.next_doc_no(case v_kind'),
    ('save_production_batch',
     'kind = v_kind, start_date = v_date,',
     'kind = v_kind, start_date = v_date, started_at = coalesce(nullif(p->>''started_at'', '''')::timestamptz, started_at),'),
    ('complete_production_batch',
     'status = ''COMPLETED'', completed_date = v_date,',
     'status = ''COMPLETED'', completed_date = v_date, completed_at = coalesce(nullif(p->>''completed_at'', '''')::timestamptz, now()),')
  ) as t(fn, find, repl) loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.fn;
    if position(r.repl in v_def) > 0 then
      continue;  -- already extended (migration run before)
    end if;
    if position(r.find in v_def) = 0 then
      raise exception 'Could not find "%" in %', r.find, r.fn;
    end if;
    v_new := replace(v_def, r.find, r.repl);
    execute v_new;
  end loop;
end $$;

------------------------------------------------------------------------------------------
-- 2. Batch summary with times (same as 0014, plus started/completed and minutes taken)
------------------------------------------------------------------------------------------
drop view if exists public.v_production_batches;
create view public.v_production_batches with (security_invoker = true) as
select
  b.*,
  b.input_cost + b.processing_cost as total_cost,
  coalesce(inp.material_cost, 0) as material_cost,
  coalesce(inp.consumable_cost, 0) as consumable_cost,
  coalesce(o.main_kg, 0) as main_kg,
  coalesce(o.main_cost, 0) as main_cost,
  coalesce(o.byproduct_kg, 0) as byproduct_kg,
  case when b.input_kg > 0 and coalesce(o.main_kg, 0) > 0 then round(100 * o.main_kg / b.input_kg, 2) end as main_yield_pct,
  case when b.input_kg > 0 and b.output_kg > 0 then round(100 * b.output_kg / b.input_kg, 2) end as total_yield_pct,
  case when coalesce(o.main_kg, 0) > 0 then round(o.main_cost / o.main_kg, 4) end as main_cost_per_kg,
  case when b.completed_at is not null and b.started_at is not null
       then round(extract(epoch from (b.completed_at - b.started_at)) / 60) end as minutes_taken,
  w1.name as input_warehouse_name, w2.name as output_warehouse_name
from public.production_batches b
left join (
  select batch_id,
    sum(cost) filter (where purpose = 'MATERIAL') as material_cost,
    sum(cost) filter (where purpose = 'CONSUMABLE') as consumable_cost
  from public.production_inputs group by batch_id
) inp on inp.batch_id = b.id
left join (
  select po.batch_id,
    sum(po.qty_kg) filter (where i.category <> 'BYPRODUCT') as main_kg,
    sum(po.cost_share) filter (where i.category <> 'BYPRODUCT') as main_cost,
    sum(po.qty_kg) filter (where i.category = 'BYPRODUCT') as byproduct_kg
  from public.production_outputs po join public.items i on i.id = po.item_id
  group by po.batch_id
) o on o.batch_id = b.id
join public.warehouses w1 on w1.id = b.input_warehouse_id
join public.warehouses w2 on w2.id = b.output_warehouse_id;

------------------------------------------------------------------------------------------
-- 3. Where each lot came from: its first lot (before any godown transfers) and that lot's source
------------------------------------------------------------------------------------------
create or replace function public.lot_origin(p_lot uuid)
returns uuid language sql stable as $$
  with recursive up as (
    select id, parent_lot_id, 0 as depth from public.lots where id = p_lot
    union all
    select l.id, l.parent_lot_id, up.depth + 1 from public.lots l join up on l.id = up.parent_lot_id where up.depth < 20
  )
  select id from up order by depth desc limit 1
$$;

drop view if exists public.v_batch_input_lots;
drop view if exists public.v_lots;
create view public.v_lots with (security_invoker = true) as
select
  l.*, i.name as item_name, i.name_bn as item_name_bn, i.category,
  w.name as warehouse_name, w.name_bn as warehouse_name_bn,
  src.source_type as origin_type,
  coalesce(pu.purchase_no, pb.batch_no, src.lot_no) as origin_no,
  pu.supplier_id, sp.name as supplier_name, sp.name_bn as supplier_name_bn
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id
join public.lots src on src.id = public.lot_origin(l.id)
left join public.purchases pu on src.source_type = 'PURCHASE' and pu.id = src.source_id
left join public.parties sp on sp.id = pu.supplier_id
left join public.production_batches pb on src.source_type = 'PRODUCTION' and pb.id = src.source_id;

-- The lots a batch actually used (picked or oldest-first), with their supplier
create or replace view public.v_batch_input_lots with (security_invoker = true) as
select
  pi.batch_id, pi.id as input_id, pi.purpose, a.lot_id, vl.lot_no, vl.item_id, vl.item_name, vl.item_name_bn,
  vl.origin_type, vl.origin_no, vl.supplier_id, vl.supplier_name, vl.supplier_name_bn,
  a.qty_kg, a.cost
from public.production_inputs pi
join public.lot_allocations a on a.source_type = 'PRODUCTION_INPUT' and a.source_line_id = pi.id
join public.v_lots vl on vl.id = a.lot_id;

grant select on public.v_production_batches, public.v_lots, public.v_batch_input_lots to authenticated;
grant execute on function public.lot_origin(uuid) to authenticated;
revoke execute on function public.batch_times() from public, anon, authenticated;
