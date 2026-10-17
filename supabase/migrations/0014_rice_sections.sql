-- 0014 Rice sections: Dryer and Sorter batches, unsorted rice, by-products at current price
--
--   DRYER  batch: paddy (MATERIAL) [+ own husk burned as fuel, sacks... (CONSUMABLE)]
--                 → unsorted rice + by-products (husk, bran)
--   SORTER batch: unsorted rice (MATERIAL; own or bought from other mills) [+ CONSUMABLE]
--                 → sorted rice grades + by-products (broken, polish/reject)
--
-- Costing: by-products are valued at their current price per kg (items.standard_price);
-- the main products (unsorted rice / sorted rice) carry the rest of the batch cost.
--
-- Safe to run on a project that already has data. Run once.

------------------------------------------------------------------------------------------
-- 1. Item category and batch status become text so new values work in this script.
--    Views built on those columns are dropped here and recreated below.
------------------------------------------------------------------------------------------
drop view if exists public.v_production_batches;
drop view if exists public.v_lot_profit;
drop view if exists public.v_stock_summary;
drop view if exists public.v_lots;

alter table public.items alter column category type text using category::text;
drop type if exists public.item_category;
alter table public.items drop constraint if exists items_category_valid;
alter table public.items add constraint items_category_valid
  check (category in ('PADDY', 'UNSORTED', 'RICE', 'BYPRODUCT', 'PACKAGING', 'OTHER'));

alter table public.production_batches alter column status drop default;
alter table public.production_batches alter column status type text using
  case when status::text in ('SOAKING', 'DRYING', 'MILLING') then 'RUNNING' else status::text end;
drop type if exists public.production_status;
alter table public.production_batches alter column status set default 'RUNNING';
alter table public.production_batches drop constraint if exists production_batches_status_valid;
alter table public.production_batches add constraint production_batches_status_valid
  check (status in ('RUNNING', 'COMPLETED', 'CANCELLED'));

alter table public.production_batches add column if not exists kind text not null default 'DRYER';
alter table public.production_batches drop constraint if exists production_batches_kind_valid;
alter table public.production_batches add constraint production_batches_kind_valid check (kind in ('DRYER', 'SORTER'));
alter table public.production_batches add column if not exists byproduct_value numeric(14,2) not null default 0;

alter table public.production_inputs add column if not exists purpose text not null default 'MATERIAL';
alter table public.production_inputs drop constraint if exists production_inputs_purpose_valid;
alter table public.production_inputs add constraint production_inputs_purpose_valid check (purpose in ('MATERIAL', 'CONSUMABLE'));

------------------------------------------------------------------------------------------
-- 2. Starting items and current-price history
------------------------------------------------------------------------------------------
insert into public.items (code, name, name_bn, category, default_bag_kg, standard_price) values
  ('U-01', 'Unsorted Rice (Coarse)', 'আনসর্টেড চাল (মোটা)', 'UNSORTED', 50, 45),
  ('U-02', 'Unsorted Rice (Fine)', 'আনসর্টেড চাল (চিকন)', 'UNSORTED', 50, 62),
  ('B-04', 'Polish / Reject', 'পলিশ / রিজেক্ট', 'BYPRODUCT', 40, 15)
on conflict (code) do nothing;

create table if not exists public.item_price_history (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  old_price numeric(14,4),
  new_price numeric(14,4) not null,
  changed_by uuid default auth.uid() references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists item_price_history_item_idx on public.item_price_history (item_id, changed_at desc);

create or replace function public.log_item_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.standard_price is distinct from old.standard_price then
    insert into public.item_price_history (item_id, old_price, new_price)
    values (new.id, case when tg_op = 'UPDATE' then old.standard_price end, new.standard_price);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_item_price on public.items;
create trigger trg_item_price after insert or update of standard_price on public.items
for each row execute function public.log_item_price();

-- record today's prices as the starting point
insert into public.item_price_history (item_id, new_price, changed_at)
select i.id, i.standard_price, coalesce(i.created_at, now()) from public.items i
where not exists (select 1 from public.item_price_history h where h.item_id = i.id);

alter table public.item_price_history enable row level security;
drop policy if exists "read item prices" on public.item_price_history;
create policy "read item prices" on public.item_price_history for select to authenticated using (public.app_role() is not null);

------------------------------------------------------------------------------------------
-- 3. Batches
------------------------------------------------------------------------------------------
create or replace function public.require_open_batch(p_id uuid)
returns public.production_batches language plpgsql security definer set search_path = public as $$
declare b public.production_batches;
begin
  select * into b from public.production_batches where id = p_id;
  if b.id is null then
    raise exception 'Batch not found';
  end if;
  if b.status <> 'RUNNING' then
    raise exception 'Batch % is %. Reopen it first.', b.batch_no, lower(b.status);
  end if;
  return b;
end;
$$;

-- Create or edit a batch: section + materials + consumables (own husk as fuel, sacks...)
create or replace function public.save_production_batch(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'start_date')::date;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'DRYER');
  v_material_cat text;
  b public.production_batches;
  l jsonb;
  v_cost numeric;
  v_total numeric := 0;
  v_kg numeric := 0;
  v_input_id uuid;
  v_purpose text;
  v_cat text;
  v_name text;
begin
  perform public.require_perm('production');
  if v_kind not in ('DRYER', 'SORTER') then
    raise exception 'Choose the section';
  end if;
  v_material_cat := case v_kind when 'DRYER' then 'PADDY' else 'UNSORTED' end;
  if not exists (select 1 from jsonb_array_elements(coalesce(p->'inputs', '[]'::jsonb)) x
                 where coalesce(nullif(x->>'purpose', ''), 'MATERIAL') = 'MATERIAL') then
    raise exception '%', case v_kind when 'DRYER' then 'Add the paddy going into this batch'
                                     else 'Add the unsorted rice going into this batch' end;
  end if;

  if v_id is not null then
    perform public.require_open_batch(v_id);
    perform public.unpost_stock('PRODUCTION_INPUT', v_id);
    perform public.unpost_journal('PRODUCTION_INPUT', v_id);
    delete from public.production_inputs where batch_id = v_id;
    update public.production_batches set
      kind = v_kind, start_date = v_date, input_warehouse_id = (p->>'input_warehouse_id')::uuid,
      output_warehouse_id = (p->>'output_warehouse_id')::uuid, notes = p->>'notes', updated_at = now()
    where id = v_id returning * into b;
  else
    insert into public.production_batches (batch_no, kind, start_date, status, input_warehouse_id, output_warehouse_id, notes)
    values (public.next_doc_no(case v_kind when 'DRYER' then 'DRY' else 'SOR' end, v_date), v_kind, v_date, 'RUNNING',
      (p->>'input_warehouse_id')::uuid, (p->>'output_warehouse_id')::uuid, p->>'notes')
    returning * into b;
  end if;

  for l in select * from jsonb_array_elements(p->'inputs') loop
    v_purpose := coalesce(nullif(l->>'purpose', ''), 'MATERIAL');
    select category, name into v_cat, v_name from public.items where id = (l->>'item_id')::uuid;
    if v_purpose = 'MATERIAL' and v_cat <> v_material_cat then
      raise exception '% is not %', v_name, case v_kind when 'DRYER' then 'paddy' else 'unsorted rice' end;
    end if;
    insert into public.production_inputs (batch_id, item_id, lot_id, bags, qty_kg, purpose)
    values (b.id, (l->>'item_id')::uuid, nullif(l->>'lot_id', '')::uuid, coalesce(nullif(l->>'bags', '')::numeric, 0),
      nullif(l->>'qty_kg', '')::numeric, v_purpose)
    returning id into v_input_id;
    v_cost := public.consume_stock(b.start_date, (l->>'item_id')::uuid, b.input_warehouse_id, nullif(l->>'qty_kg', '')::numeric,
      coalesce(nullif(l->>'bags', '')::numeric, 0), 'PRODUCTION_INPUT', b.id, v_input_id, nullif(l->>'lot_id', '')::uuid, null, b.batch_no);
    update public.production_inputs set cost = v_cost where id = v_input_id;
    v_total := v_total + v_cost;
    if v_purpose = 'MATERIAL' then
      v_kg := v_kg + nullif(l->>'qty_kg', '')::numeric;
    end if;
  end loop;

  -- input_kg counts the material only; input_cost includes consumables
  update public.production_batches set input_kg = v_kg, input_cost = v_total where id = b.id;

  perform public.post_journal(b.start_date, 'PRODUCTION_INPUT', b.id, 'Into batch ' || b.batch_no, jsonb_build_array(
    public.jl_dr(public.system_account('WIP'), v_total),
    public.jl_cr(public.system_account('INVENTORY'), v_total)));
  return b.id;
end;
$$;

-- Stage details are kept for old batches; they no longer drive the status
create or replace function public.save_production_stage(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.production_batches := public.require_open_batch((p->>'batch_id')::uuid);
begin
  perform public.require_perm('production');
  update public.production_stages set
    start_date = nullif(p->>'start_date', '')::date,
    end_date = nullif(p->>'end_date', '')::date,
    input_kg = nullif(p->>'input_kg', '')::numeric,
    output_kg = nullif(p->>'output_kg', '')::numeric,
    moisture_pct = nullif(p->>'moisture_pct', '')::numeric,
    notes = p->>'notes'
  where batch_id = b.id and stage = p->>'stage';
end;
$$;

-- Finish a batch: p = {batch_id, completed_date, outputs: [{item_id, bags, bag_size_kg, qty_kg}]}
-- By-products take their current price; main products share the rest by relative price (or weight).
create or replace function public.complete_production_batch(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.production_batches := public.require_open_batch((p->>'batch_id')::uuid);
  v_date date := (p->>'completed_date')::date;
  v_main_cat text := case b.kind when 'DRYER' then 'UNSORTED' else 'RICE' end;
  v_total numeric;
  v_by_value numeric;
  v_rest numeric;
  v_base numeric;
  v_use_price boolean;
  v_allocated numeric := 0;
  v_share numeric;
  v_n int;
  v_i int := 0;
  o record;
  v_lot uuid;
begin
  perform public.require_perm('production');
  if jsonb_array_length(coalesce(p->'outputs', '[]'::jsonb)) = 0 then
    raise exception 'Add what came out of this batch';
  end if;

  delete from public.production_outputs where batch_id = b.id;
  insert into public.production_outputs (batch_id, item_id, bags, bag_size_kg, qty_kg)
  select b.id, (x->>'item_id')::uuid, coalesce(nullif(x->>'bags', '')::numeric, 0), coalesce(nullif(x->>'bag_size_kg', '')::numeric, 0),
    nullif(x->>'qty_kg', '')::numeric
  from jsonb_array_elements(p->'outputs') x;

  if exists (select 1 from public.production_outputs po join public.items i on i.id = po.item_id
             where po.batch_id = b.id and i.category not in (v_main_cat, 'BYPRODUCT')) then
    raise exception '%', case b.kind when 'DRYER' then 'The dryer section gives unsorted rice and by-products only'
                                     else 'The sorter section gives sorted rice and by-products only' end;
  end if;
  if not exists (select 1 from public.production_outputs po join public.items i on i.id = po.item_id
                 where po.batch_id = b.id and i.category = v_main_cat) then
    raise exception '%', case b.kind when 'DRYER' then 'Add the unsorted rice that came out'
                                     else 'Add the sorted rice that came out' end;
  end if;

  v_total := b.input_cost + (select coalesce(sum(amount), 0) from public.production_costs where batch_id = b.id);

  -- by-products at current price
  for o in select po.id, po.qty_kg, i.standard_price from public.production_outputs po join public.items i on i.id = po.item_id
           where po.batch_id = b.id and i.category = 'BYPRODUCT' loop
    v_share := round(o.qty_kg * o.standard_price, 2);
    update public.production_outputs set cost_share = v_share, unit_cost = round(o.standard_price, 6) where id = o.id;
  end loop;
  select coalesce(sum(po.cost_share), 0) into v_by_value from public.production_outputs po join public.items i on i.id = po.item_id
  where po.batch_id = b.id and i.category = 'BYPRODUCT';

  v_rest := v_total - v_by_value;
  if v_rest < 0 then
    raise exception 'The by-products (%) are worth more than the whole batch cost (%). Check their current prices.', v_by_value, v_total;
  end if;

  -- main products share the rest: by current price, or by weight if no prices
  select sum(po.qty_kg * i.standard_price), count(*) into v_base, v_n
  from public.production_outputs po join public.items i on i.id = po.item_id
  where po.batch_id = b.id and i.category = v_main_cat;
  v_use_price := coalesce(v_base, 0) > 0;
  if not v_use_price then
    select sum(po.qty_kg) into v_base from public.production_outputs po join public.items i on i.id = po.item_id
    where po.batch_id = b.id and i.category = v_main_cat;
  end if;
  for o in select po.id, po.qty_kg, i.standard_price from public.production_outputs po join public.items i on i.id = po.item_id
           where po.batch_id = b.id and i.category = v_main_cat order by po.qty_kg * i.standard_price, po.qty_kg loop
    v_i := v_i + 1;
    if v_i = v_n then
      v_share := v_rest - v_allocated;  -- last line takes the rounding remainder
    else
      v_share := round(v_rest * (case when v_use_price then o.qty_kg * o.standard_price else o.qty_kg end) / v_base, 2);
    end if;
    v_allocated := v_allocated + v_share;
    update public.production_outputs set cost_share = v_share, unit_cost = round(v_share / o.qty_kg, 6) where id = o.id;
  end loop;

  for o in select po.* from public.production_outputs po where po.batch_id = b.id loop
    v_lot := public.receive_stock(v_date, o.item_id, b.output_warehouse_id, o.qty_kg, o.bags, o.bag_size_kg,
      o.cost_share / o.qty_kg, 'PRODUCTION', b.id, o.id, null, b.batch_no);
    update public.production_outputs set lot_id = v_lot where id = o.id;
  end loop;

  perform public.post_journal(v_date, 'PRODUCTION', b.id, 'Batch ' || b.batch_no || ' completed', jsonb_build_array(
    public.jl_dr(public.system_account('INVENTORY'), v_total),
    public.jl_cr(public.system_account('WIP'), v_total)));

  update public.production_batches set
    status = 'COMPLETED', completed_date = v_date,
    output_kg = (select sum(qty_kg) from public.production_outputs where batch_id = b.id),
    processing_cost = v_total - input_cost, byproduct_value = v_by_value, updated_at = now()
  where id = b.id;
end;
$$;

create or replace function public.reopen_production_batch(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_perm('reopen_batch');
  perform public.unpost_stock('PRODUCTION', p_id);
  perform public.unpost_journal('PRODUCTION', p_id);
  delete from public.production_outputs where batch_id = p_id;
  update public.production_batches set status = 'RUNNING', completed_date = null, output_kg = 0, byproduct_value = 0, updated_at = now()
  where id = p_id;
end;
$$;

------------------------------------------------------------------------------------------
-- 4. Views
------------------------------------------------------------------------------------------
create view public.v_stock_summary with (security_invoker = true) as
select
  i.id as item_id, i.name as item_name, i.name_bn as item_name_bn, i.category,
  w.id as warehouse_id, w.name as warehouse_name, w.name_bn as warehouse_name_bn,
  sum(l.remaining_kg) as qty_kg,
  sum(l.remaining_bags) as bags,
  round(sum(l.remaining_kg * l.unit_cost), 2) as value,
  case when sum(l.remaining_kg) > 0 then round(sum(l.remaining_kg * l.unit_cost) / sum(l.remaining_kg), 4) else 0 end as avg_cost,
  i.reorder_level_kg,
  i.standard_price as current_price,
  round(sum(l.remaining_kg) * i.standard_price, 2) as value_at_current_price
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id
where l.remaining_kg > 0.0005
group by i.id, w.id;

create view public.v_lots with (security_invoker = true) as
select
  l.*, i.name as item_name, i.name_bn as item_name_bn, i.category,
  w.name as warehouse_name, w.name_bn as warehouse_name_bn
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id;

create view public.v_lot_profit with (security_invoker = true) as
with recursive tree as (
  select id as root_id, id as lot_id from public.lots where parent_lot_id is null
  union all
  select t.root_id, l.id from public.lots l join tree t on l.parent_lot_id = t.lot_id
),
alloc as (
  select t.root_id,
    sum(a.qty_kg) filter (where a.source_type = 'SALE') as sold_kg,
    sum(a.revenue) filter (where a.source_type = 'SALE') as revenue,
    sum(a.cost) filter (where a.source_type = 'SALE') as cost_of_sold,
    sum(a.qty_kg) filter (where a.source_type = 'PRODUCTION_INPUT' and coalesce(pi.purpose, 'MATERIAL') = 'MATERIAL') as milled_kg,
    sum(a.qty_kg) filter (where a.source_type = 'PRODUCTION_INPUT' and pi.purpose = 'CONSUMABLE') as used_kg,
    sum(a.qty_kg) filter (where a.source_type in ('ADJUSTMENT', 'PURCHASE_RETURN')) as other_out_kg
  from tree t
  join public.lot_allocations a on a.lot_id = t.lot_id
  left join public.production_inputs pi on a.source_type = 'PRODUCTION_INPUT' and pi.id = a.source_line_id
  group by t.root_id
),
remain as (
  select t.root_id, sum(l.remaining_kg) as remaining_kg, sum(l.remaining_kg * l.unit_cost) as remaining_value
  from tree t join public.lots l on l.id = t.lot_id
  group by t.root_id
)
select
  l.id, l.lot_no, l.source_type, l.source_id, l.received_date, l.item_id, i.name as item_name, i.category,
  l.warehouse_id, w.name as warehouse_name,
  coalesce(pa.name, pb.batch_no) as source_label,
  pb.kind as batch_kind,
  l.qty_kg, l.unit_cost, round(l.qty_kg * l.unit_cost, 2) as total_cost,
  coalesce(a.sold_kg, 0) as sold_kg, coalesce(a.revenue, 0) as revenue, coalesce(a.cost_of_sold, 0) as cost_of_sold,
  coalesce(a.revenue, 0) - coalesce(a.cost_of_sold, 0) as profit,
  case when coalesce(a.revenue, 0) > 0 then round(100 * (a.revenue - a.cost_of_sold) / a.revenue, 2) end as margin_pct,
  coalesce(a.milled_kg, 0) as milled_kg, coalesce(a.used_kg, 0) as used_kg, coalesce(a.other_out_kg, 0) as other_out_kg,
  coalesce(r.remaining_kg, 0) as remaining_kg, round(coalesce(r.remaining_value, 0), 2) as remaining_value
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id
left join alloc a on a.root_id = l.id
left join remain r on r.root_id = l.id
left join public.purchases pu on l.source_type = 'PURCHASE' and pu.id = l.source_id
left join public.parties pa on pa.id = pu.supplier_id
left join public.production_batches pb on l.source_type = 'PRODUCTION' and pb.id = l.source_id
where l.parent_lot_id is null;

-- Batch summary per section: yield = main product kg / material kg; cost per kg of the main product
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
-- 5. Dashboard figures: running batches by section, unsorted rice stock
------------------------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_from date, p_to date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cash', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.accounts a on a.id = l.account_id where a.subtype = 'CASH'),
    'bank', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.accounts a on a.id = l.account_id where a.subtype = 'BANK'),
    'receivable', (select coalesce(sum(balance), 0) from public.v_party_balances where balance > 0),
    'payable', (select coalesce(-sum(balance), 0) from public.v_party_balances where balance < 0),
    'stock_value', (select coalesce(sum(remaining_kg * unit_cost), 0) from public.lots where remaining_kg > 0),
    'paddy_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'PADDY'),
    'unsorted_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'UNSORTED'),
    'rice_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'RICE'),
    'byproduct_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'BYPRODUCT'),
    'open_batches', (select count(*) from public.production_batches where status = 'RUNNING'),
    'sales', (select coalesce(sum(total_amount), 0) from public.sales where sale_date between p_from and p_to),
    'purchases', (select coalesce(sum(total_cost), 0) from public.purchases where purchase_date between p_from and p_to),
    'expenses', (select coalesce(sum(amount), 0) from public.money_txns where txn_type = 'EXPENSE' and txn_date between p_from and p_to and coalesce(cheque_status, '') <> 'BOUNCED'),
    'profit', (select coalesce(sum(case when type = 'INCOME' then amount else -amount end), 0) from public.report_profit_loss(p_from, p_to)),
    'pending_cheques', (select count(*) from public.money_txns where cheque_status = 'PENDING'),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'sales', s, 'purchases', pu) order by m), '[]'::jsonb)
      from (
        select m,
          (select coalesce(sum(total_amount), 0) from public.sales where date_trunc('month', sale_date) = m) as s,
          (select coalesce(sum(total_cost), 0) from public.purchases where date_trunc('month', purchase_date) = m) as pu
        from generate_series(date_trunc('month', p_to::timestamp) - interval '5 months', date_trunc('month', p_to::timestamp), interval '1 month') m
      ) x
    )
  )
$$;

revoke execute on function public.log_item_price() from public, anon, authenticated;
revoke execute on function public.require_open_batch(uuid) from public, anon, authenticated;
