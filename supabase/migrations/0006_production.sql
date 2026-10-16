-- 0006 Mill production: batches through soaking/parboiling, drying and milling
--
-- Flow:
--   1. Start a batch with paddy inputs: paddy leaves stock, its cost moves into
--      Work in Process (WIP).
--   2. Record each stage (dates, kg in/out, moisture) and its costs (fuel, labour,
--      electricity...). Costs are added to WIP.
--   3. Complete the batch with outputs (rice grades, broken rice, bran, husk). WIP cost
--      is split across outputs by relative value (qty x item standard price) and each
--      output becomes a new stock lot.

create type public.production_status as enum ('SOAKING', 'DRYING', 'MILLING', 'COMPLETED', 'CANCELLED');

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  start_date date not null,
  status public.production_status not null default 'SOAKING',
  input_warehouse_id uuid not null references public.warehouses(id),
  output_warehouse_id uuid not null references public.warehouses(id),
  notes text,
  input_kg numeric(14,3) not null default 0,
  input_cost numeric(14,2) not null default 0,
  processing_cost numeric(14,2) not null default 0,
  output_kg numeric(14,3) not null default 0,
  completed_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  item_id uuid not null references public.items(id),
  lot_id uuid references public.lots(id),   -- picked lot, or null for FIFO
  bags numeric(12,2) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  cost numeric(14,2) not null default 0
);

create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  stage text not null check (stage in ('SOAKING', 'DRYING', 'MILLING')),
  start_date date,
  end_date date,
  input_kg numeric(14,3),
  output_kg numeric(14,3),
  moisture_pct numeric(5,2),
  notes text,
  unique (batch_id, stage)
);

create table public.production_costs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  stage text not null check (stage in ('SOAKING', 'DRYING', 'MILLING', 'GENERAL')),
  cost_date date not null,
  cost_head_id uuid not null references public.accounts(id),   -- expense head for reporting (fuel, labour...)
  amount numeric(14,2) not null check (amount > 0),
  paid_account_id uuid references public.accounts(id),         -- cash/bank, or
  party_id uuid references public.parties(id),                 -- owed to this party
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint production_cost_paid_by check (paid_account_id is not null or party_id is not null)
);

create table public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  item_id uuid not null references public.items(id),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  cost_share numeric(14,2) not null default 0,
  unit_cost numeric(18,6) not null default 0,
  lot_id uuid references public.lots(id) on delete set null
);

create or replace function public.require_open_batch(p_id uuid)
returns public.production_batches language plpgsql security definer set search_path = public as $$
declare b public.production_batches;
begin
  select * into b from public.production_batches where id = p_id;
  if b.id is null then
    raise exception 'Batch not found';
  end if;
  if b.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Batch % is %. Reopen it first.', b.batch_no, lower(b.status::text);
  end if;
  return b;
end;
$$;

-- Create or edit a batch header and its paddy inputs
create or replace function public.save_production_batch(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'start_date')::date;
  b public.production_batches;
  l jsonb;
  v_cost numeric;
  v_total numeric := 0;
  v_kg numeric := 0;
  v_input_id uuid;
  s text;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if jsonb_array_length(coalesce(p->'inputs', '[]'::jsonb)) = 0 then
    raise exception 'Add the paddy going into this batch';
  end if;

  if v_id is not null then
    perform public.require_open_batch(v_id);
    perform public.unpost_stock('PRODUCTION_INPUT', v_id);
    perform public.unpost_journal('PRODUCTION_INPUT', v_id);
    delete from public.production_inputs where batch_id = v_id;
    update public.production_batches set
      start_date = v_date, input_warehouse_id = (p->>'input_warehouse_id')::uuid,
      output_warehouse_id = (p->>'output_warehouse_id')::uuid, notes = p->>'notes', updated_at = now()
    where id = v_id returning * into b;
  else
    insert into public.production_batches (batch_no, start_date, input_warehouse_id, output_warehouse_id, notes)
    values (public.next_doc_no('BAT', v_date), v_date, (p->>'input_warehouse_id')::uuid,
      (p->>'output_warehouse_id')::uuid, p->>'notes')
    returning * into b;
    foreach s in array array['SOAKING', 'DRYING', 'MILLING'] loop
      insert into public.production_stages (batch_id, stage) values (b.id, s);
    end loop;
    update public.production_stages set start_date = v_date where batch_id = b.id and stage = 'SOAKING';
  end if;

  for l in select * from jsonb_array_elements(p->'inputs') loop
    insert into public.production_inputs (batch_id, item_id, lot_id, bags, qty_kg)
    values (b.id, (l->>'item_id')::uuid, nullif(l->>'lot_id', '')::uuid, coalesce((l->>'bags')::numeric, 0), (l->>'qty_kg')::numeric)
    returning id into v_input_id;
    v_cost := public.consume_stock(b.start_date, (l->>'item_id')::uuid, b.input_warehouse_id, (l->>'qty_kg')::numeric,
      coalesce((l->>'bags')::numeric, 0), 'PRODUCTION_INPUT', b.id, v_input_id, nullif(l->>'lot_id', '')::uuid, null, b.batch_no);
    update public.production_inputs set cost = v_cost where id = v_input_id;
    v_total := v_total + v_cost;
    v_kg := v_kg + (l->>'qty_kg')::numeric;
  end loop;

  update public.production_batches set input_kg = v_kg, input_cost = v_total where id = b.id;
  update public.production_stages set input_kg = coalesce(input_kg, v_kg) where batch_id = b.id and stage = 'SOAKING';

  perform public.post_journal(b.start_date, 'PRODUCTION_INPUT', b.id, 'Paddy into batch ' || b.batch_no, jsonb_build_array(
    public.jl_dr(public.system_account('WIP'), v_total),
    public.jl_cr(public.system_account('INVENTORY'), v_total)));
  return b.id;
end;
$$;

-- Update one stage; optionally move the batch to that stage
create or replace function public.save_production_stage(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.production_batches := public.require_open_batch((p->>'batch_id')::uuid);
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  update public.production_stages set
    start_date = nullif(p->>'start_date', '')::date,
    end_date = nullif(p->>'end_date', '')::date,
    input_kg = nullif(p->>'input_kg', '')::numeric,
    output_kg = nullif(p->>'output_kg', '')::numeric,
    moisture_pct = nullif(p->>'moisture_pct', '')::numeric,
    notes = p->>'notes'
  where batch_id = b.id and stage = p->>'stage';

  if coalesce(p->>'set_status', '') in ('SOAKING', 'DRYING', 'MILLING') then
    update public.production_batches set status = (p->>'set_status')::public.production_status, updated_at = now()
    where id = b.id;
    -- the next stage starts where this one ended
    update public.production_stages set
      start_date = coalesce(start_date, nullif(p->>'end_date', '')::date, current_date),
      input_kg = coalesce(input_kg, nullif(p->>'output_kg', '')::numeric)
    where batch_id = b.id and stage = p->>'set_status';
  end if;
end;
$$;

create or replace function public.save_production_cost(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  b public.production_batches := public.require_open_batch((p->>'batch_id')::uuid);
  c public.production_costs;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  perform public.unpost_journal('PRODUCTION_COST', v_id);
  delete from public.production_costs where id = v_id;

  insert into public.production_costs (id, batch_id, stage, cost_date, cost_head_id, amount, paid_account_id, party_id, notes)
  values (v_id, b.id, coalesce(p->>'stage', 'GENERAL'), (p->>'cost_date')::date, (p->>'cost_head_id')::uuid,
    (p->>'amount')::numeric, nullif(p->>'paid_account_id', '')::uuid, nullif(p->>'party_id', '')::uuid, p->>'notes')
  returning * into c;

  perform public.post_journal(c.cost_date, 'PRODUCTION_COST', c.id, 'Batch ' || b.batch_no || ' cost', jsonb_build_array(
    public.jl_dr(public.system_account('WIP'), c.amount, null, (select name from public.accounts where id = c.cost_head_id)),
    case when c.paid_account_id is not null
      then public.jl_cr(c.paid_account_id, c.amount)
      else public.jl_cr(public.system_account('PAYABLE'), c.amount, c.party_id) end));

  update public.production_batches
  set processing_cost = (select coalesce(sum(amount), 0) from public.production_costs where batch_id = b.id)
  where id = b.id;
  return c.id;
end;
$$;

create or replace function public.delete_production_cost(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  select batch_id into v_batch from public.production_costs where id = p_id;
  perform public.require_open_batch(v_batch);
  perform public.unpost_journal('PRODUCTION_COST', p_id);
  delete from public.production_costs where id = p_id;
  update public.production_batches
  set processing_cost = (select coalesce(sum(amount), 0) from public.production_costs where batch_id = v_batch)
  where id = v_batch;
end;
$$;

-- Complete a batch: p = {batch_id, completed_date, outputs: [{item_id, bags, bag_size_kg, qty_kg}]}
create or replace function public.complete_production_batch(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.production_batches := public.require_open_batch((p->>'batch_id')::uuid);
  v_date date := (p->>'completed_date')::date;
  v_total numeric;
  v_weight_sum numeric := 0;
  v_use_value boolean;
  v_allocated numeric := 0;
  v_share numeric;
  v_n int;
  v_i int := 0;
  o record;
  v_lot uuid;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if jsonb_array_length(coalesce(p->'outputs', '[]'::jsonb)) = 0 then
    raise exception 'Add the rice and by-products that came out of this batch';
  end if;

  delete from public.production_outputs where batch_id = b.id;
  insert into public.production_outputs (batch_id, item_id, bags, bag_size_kg, qty_kg)
  select b.id, (x->>'item_id')::uuid, coalesce((x->>'bags')::numeric, 0), coalesce((x->>'bag_size_kg')::numeric, 0), (x->>'qty_kg')::numeric
  from jsonb_array_elements(p->'outputs') x;

  v_total := b.input_cost + (select coalesce(sum(amount), 0) from public.production_costs where batch_id = b.id);

  -- split by value (qty x standard price); fall back to weight if no prices are set
  select sum(po.qty_kg * i.standard_price) into v_weight_sum
  from public.production_outputs po join public.items i on i.id = po.item_id where po.batch_id = b.id;
  v_use_value := coalesce(v_weight_sum, 0) > 0;
  if not v_use_value then
    select sum(qty_kg) into v_weight_sum from public.production_outputs where batch_id = b.id;
  end if;
  select count(*) into v_n from public.production_outputs where batch_id = b.id;

  for o in
    select po.*, i.standard_price from public.production_outputs po join public.items i on i.id = po.item_id
    where po.batch_id = b.id order by po.qty_kg * i.standard_price, po.qty_kg
  loop
    v_i := v_i + 1;
    if v_i = v_n then
      v_share := v_total - v_allocated;   -- last line takes the rounding remainder
    else
      v_share := round(v_total * (case when v_use_value then o.qty_kg * o.standard_price else o.qty_kg end) / v_weight_sum, 2);
    end if;
    v_allocated := v_allocated + v_share;
    v_lot := public.receive_stock(v_date, o.item_id, b.output_warehouse_id, o.qty_kg, o.bags, o.bag_size_kg,
      v_share / o.qty_kg, 'PRODUCTION', b.id, o.id, null, b.batch_no);
    update public.production_outputs set cost_share = v_share, unit_cost = round(v_share / o.qty_kg, 6), lot_id = v_lot
    where id = o.id;
  end loop;

  perform public.post_journal(v_date, 'PRODUCTION', b.id, 'Batch ' || b.batch_no || ' completed', jsonb_build_array(
    public.jl_dr(public.system_account('INVENTORY'), v_total),
    public.jl_cr(public.system_account('WIP'), v_total)));

  update public.production_batches set
    status = 'COMPLETED', completed_date = v_date,
    output_kg = (select sum(qty_kg) from public.production_outputs where batch_id = b.id),
    processing_cost = v_total - input_cost, updated_at = now()
  where id = b.id;
  update public.production_stages set end_date = coalesce(end_date, v_date),
    output_kg = coalesce(output_kg, (select sum(qty_kg) from public.production_outputs where batch_id = b.id))
  where batch_id = b.id and stage = 'MILLING';
end;
$$;

create or replace function public.reopen_production_batch(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_stock('PRODUCTION', p_id);
  perform public.unpost_journal('PRODUCTION', p_id);
  delete from public.production_outputs where batch_id = p_id;
  update public.production_batches set status = 'MILLING', completed_date = null, output_kg = 0, updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.delete_production_batch(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.require_open_batch(p_id);
  for c in select id from public.production_costs where batch_id = p_id loop
    perform public.unpost_journal('PRODUCTION_COST', c.id);
  end loop;
  perform public.unpost_stock('PRODUCTION_INPUT', p_id);
  perform public.unpost_journal('PRODUCTION_INPUT', p_id);
  delete from public.production_batches where id = p_id;
end;
$$;

-- Batch summary: yield and cost per kg of main product (rice)
create or replace view public.v_production_batches with (security_invoker = true) as
select
  b.*,
  b.input_cost + b.processing_cost as total_cost,
  coalesce(o.rice_kg, 0) as rice_kg,
  coalesce(o.byproduct_kg, 0) as byproduct_kg,
  case when b.input_kg > 0 then round(100 * coalesce(o.rice_kg, 0) / b.input_kg, 2) end as rice_yield_pct,
  case when b.input_kg > 0 then round(100 * b.output_kg / b.input_kg, 2) end as total_yield_pct,
  case when coalesce(o.rice_kg, 0) > 0 then round(o.rice_cost / o.rice_kg, 4) end as rice_cost_per_kg,
  w1.name as input_warehouse_name, w2.name as output_warehouse_name
from public.production_batches b
left join (
  select po.batch_id,
    sum(case when i.category = 'RICE' then po.qty_kg else 0 end) as rice_kg,
    sum(case when i.category <> 'RICE' then po.qty_kg else 0 end) as byproduct_kg,
    sum(case when i.category = 'RICE' then po.cost_share else 0 end) as rice_cost
  from public.production_outputs po join public.items i on i.id = po.item_id
  group by po.batch_id
) o on o.batch_id = b.id
join public.warehouses w1 on w1.id = b.input_warehouse_id
join public.warehouses w2 on w2.id = b.output_warehouse_id;
