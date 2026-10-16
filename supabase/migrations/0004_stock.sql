-- 0004 Stock: lots, movements, FIFO consumption, transfers, adjustments
--
-- Quantities are kept in kg (the true measure) with bags alongside for counting.
-- Every receipt of goods creates a lot with a cost per kg. Every issue consumes lots
-- (FIFO unless a lot is picked) and records an allocation, so cost and profit can be
-- traced back to the exact purchase or production batch.

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null unique,
  item_id uuid not null references public.items(id),
  warehouse_id uuid not null references public.warehouses(id),
  -- PURCHASE, PRODUCTION, TRANSFER, SALE_RETURN, ADJUSTMENT
  source_type text not null,
  source_id uuid not null,
  received_date date not null,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  unit_cost numeric(18,6) not null default 0,
  remaining_kg numeric(14,3) not null,
  remaining_bags numeric(12,2) not null default 0,
  -- for transfers: the lot this one was split from, so profit traces back to the origin
  parent_lot_id uuid references public.lots(id),
  created_at timestamptz not null default now(),
  constraint lots_remaining_valid check (remaining_kg >= -0.0005 and remaining_kg <= qty_kg + 0.0005)
);

create index on public.lots (item_id, warehouse_id) where remaining_kg > 0;
create index on public.lots (source_type, source_id);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  movement_date date not null,
  item_id uuid not null references public.items(id),
  warehouse_id uuid not null references public.warehouses(id),
  lot_id uuid references public.lots(id) on delete set null,
  qty_kg numeric(14,3) not null,      -- signed: + in, - out
  bags numeric(12,2) not null default 0,
  unit_cost numeric(18,6) not null default 0,
  value numeric(14,2) not null default 0,  -- signed
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index on public.stock_movements (item_id, warehouse_id, movement_date);
create index on public.stock_movements (source_type, source_id);

-- What was taken from which lot, by which document line
create table public.lot_allocations (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.lots(id),
  qty_kg numeric(14,3) not null,
  bags numeric(12,2) not null default 0,
  cost numeric(14,2) not null,
  revenue numeric(14,2),   -- set for sales, used for lot profit
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  created_at timestamptz not null default now()
);

create index on public.lot_allocations (lot_id);
create index on public.lot_allocations (source_type, source_id);

-- Receive goods: create a lot and an inbound movement. Returns lot id.
create or replace function public.receive_stock(
  p_date date, p_item uuid, p_warehouse uuid, p_qty_kg numeric, p_bags numeric, p_bag_size numeric,
  p_unit_cost numeric, p_source_type text, p_source_id uuid, p_source_line_id uuid default null,
  p_parent_lot uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lot uuid;
begin
  if coalesce(p_qty_kg, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  insert into public.lots (lot_no, item_id, warehouse_id, source_type, source_id, received_date,
    qty_kg, bags, bag_size_kg, unit_cost, remaining_kg, remaining_bags, parent_lot_id)
  values (public.next_doc_no('LOT', p_date), p_item, p_warehouse, p_source_type, p_source_id, p_date,
    p_qty_kg, coalesce(p_bags, 0), coalesce(p_bag_size, 0), coalesce(p_unit_cost, 0), p_qty_kg, coalesce(p_bags, 0), p_parent_lot)
  returning id into v_lot;

  insert into public.stock_movements (movement_date, item_id, warehouse_id, lot_id, qty_kg, bags, unit_cost, value,
    source_type, source_id, source_line_id, note)
  values (p_date, p_item, p_warehouse, v_lot, p_qty_kg, coalesce(p_bags, 0), coalesce(p_unit_cost, 0),
    round(p_qty_kg * coalesce(p_unit_cost, 0), 2), p_source_type, p_source_id, p_source_line_id, p_note);
  return v_lot;
end;
$$;

-- Issue goods: consume from a specific lot or FIFO across lots of the item in the warehouse.
-- Records allocations (with revenue spread pro rata when given) and outbound movements.
-- Returns total cost of the goods issued.
create or replace function public.consume_stock(
  p_date date, p_item uuid, p_warehouse uuid, p_qty_kg numeric, p_bags numeric,
  p_source_type text, p_source_id uuid, p_source_line_id uuid default null,
  p_lot uuid default null, p_revenue numeric default null, p_note text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := p_qty_kg;
  v_total_cost numeric := 0;
  v_take numeric;
  v_take_bags numeric;
  v_cost numeric;
  v_name text;
  r record;
begin
  if coalesce(p_qty_kg, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  for r in
    select * from public.lots
    where remaining_kg > 0.0005
      and (case when p_lot is not null then id = p_lot else item_id = p_item and warehouse_id = p_warehouse end)
    order by received_date, created_at
    for update
  loop
    exit when v_left <= 0.0005;
    v_take := least(r.remaining_kg, v_left);
    -- bags: share of the requested bags, or derived from the lot's bag size
    if coalesce(p_bags, 0) > 0 then
      v_take_bags := round(p_bags * v_take / p_qty_kg, 2);
    elsif r.bag_size_kg > 0 then
      v_take_bags := round(v_take / r.bag_size_kg, 2);
    else
      v_take_bags := 0;
    end if;
    v_take_bags := least(v_take_bags, r.remaining_bags);
    v_cost := round(v_take * r.unit_cost, 2);

    update public.lots
    set remaining_kg = remaining_kg - v_take, remaining_bags = greatest(remaining_bags - v_take_bags, 0)
    where id = r.id;

    insert into public.lot_allocations (lot_id, qty_kg, bags, cost, revenue, source_type, source_id, source_line_id)
    values (r.id, v_take, v_take_bags, v_cost,
      case when p_revenue is not null then round(p_revenue * v_take / p_qty_kg, 2) end,
      p_source_type, p_source_id, p_source_line_id);

    insert into public.stock_movements (movement_date, item_id, warehouse_id, lot_id, qty_kg, bags, unit_cost, value,
      source_type, source_id, source_line_id, note)
    values (p_date, r.item_id, r.warehouse_id, r.id, -v_take, -v_take_bags, r.unit_cost, -v_cost,
      p_source_type, p_source_id, p_source_line_id, p_note);

    v_left := v_left - v_take;
    v_total_cost := v_total_cost + v_cost;
  end loop;

  if v_left > 0.0005 then
    select name into v_name from public.items where id = p_item;
    raise exception 'Not enough stock of % (short by % kg)', coalesce(v_name, 'item'), round(v_left, 3);
  end if;

  return v_total_cost;
end;
$$;

-- Undo all stock effects of a document: give back consumed quantities, remove lots it created
-- (only if nothing has been taken from them yet) and delete its movements.
create or replace function public.unpost_stock(p_source_type text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select * from public.lot_allocations where source_type = p_source_type and source_id = p_source_id loop
    update public.lots set remaining_kg = remaining_kg + r.qty_kg, remaining_bags = remaining_bags + r.bags
    where id = r.lot_id;
  end loop;
  delete from public.lot_allocations where source_type = p_source_type and source_id = p_source_id;

  if exists (
    select 1 from public.lots l
    where l.source_type = p_source_type and l.source_id = p_source_id
      and (exists (select 1 from public.lot_allocations a where a.lot_id = l.id)
           or exists (select 1 from public.lots c where c.parent_lot_id = l.id))
  ) then
    raise exception 'Stock from this document has already been sold, milled or moved. Reverse those first.';
  end if;

  delete from public.stock_movements where source_type = p_source_type and source_id = p_source_id;
  delete from public.lots where source_type = p_source_type and source_id = p_source_id;
end;
$$;

-- Warehouse transfers: lot-by-lot, keeping cost; no accounting effect
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  transfer_date date not null,
  item_id uuid not null references public.items(id),
  from_warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid not null references public.warehouses(id),
  lot_id uuid references public.lots(id),
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  bags numeric(12,2) not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint transfer_different check (from_warehouse_id <> to_warehouse_id)
);

create or replace function public.save_stock_transfer(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_t public.stock_transfers;
  a record;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if v_id is not null then
    perform public.delete_stock_transfer(v_id);
  end if;

  insert into public.stock_transfers (id, transfer_no, transfer_date, item_id, from_warehouse_id, to_warehouse_id,
    lot_id, qty_kg, bags, notes)
  values (coalesce(v_id, gen_random_uuid()),
    coalesce(nullif(p->>'transfer_no', ''), public.next_doc_no('TRF', (p->>'transfer_date')::date)),
    (p->>'transfer_date')::date, (p->>'item_id')::uuid, (p->>'from_warehouse_id')::uuid, (p->>'to_warehouse_id')::uuid,
    nullif(p->>'lot_id', '')::uuid, (p->>'qty_kg')::numeric, coalesce((p->>'bags')::numeric, 0), p->>'notes')
  returning * into v_t;

  perform public.consume_stock(v_t.transfer_date, v_t.item_id, v_t.from_warehouse_id, v_t.qty_kg, v_t.bags,
    'TRANSFER', v_t.id, null, v_t.lot_id, null, 'Transfer out');

  -- recreate each consumed slice as a new lot in the destination, same cost
  for a in
    select al.*, l.unit_cost, l.bag_size_kg, l.item_id from public.lot_allocations al
    join public.lots l on l.id = al.lot_id
    where al.source_type = 'TRANSFER' and al.source_id = v_t.id
  loop
    perform public.receive_stock(v_t.transfer_date, a.item_id, v_t.to_warehouse_id, a.qty_kg, a.bags, a.bag_size_kg,
      a.unit_cost, 'TRANSFER', v_t.id, null, a.lot_id, 'Transfer in');
  end loop;
  return v_t.id;
end;
$$;

create or replace function public.delete_stock_transfer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  -- the destination lots must be untouched; check them before giving stock back
  if exists (
    select 1 from public.lots l where l.source_type = 'TRANSFER' and l.source_id = p_id and l.parent_lot_id is not null
      and (exists (select 1 from public.lot_allocations a where a.lot_id = l.id)
           or exists (select 1 from public.lots c where c.parent_lot_id = l.id))
  ) then
    raise exception 'Transferred stock has already been used. Reverse that first.';
  end if;
  delete from public.stock_movements where source_type = 'TRANSFER' and source_id = p_id and qty_kg > 0;
  delete from public.lots where source_type = 'TRANSFER' and source_id = p_id;
  perform public.unpost_stock('TRANSFER', p_id);
  delete from public.stock_transfers where id = p_id;
end;
$$;

-- Adjustments: OPENING stock, GAIN (found/excess), LOSS (shortage, damage, drying loss)
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_no text not null unique,
  adjustment_date date not null,
  kind text not null check (kind in ('OPENING', 'GAIN', 'LOSS')),
  item_id uuid not null references public.items(id),
  warehouse_id uuid not null references public.warehouses(id),
  lot_id uuid references public.lots(id),
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  unit_cost numeric(18,6) not null default 0,
  value numeric(14,2) not null default 0,
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.save_stock_adjustment(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_a public.stock_adjustments;
  v_value numeric;
  v_inv uuid := public.system_account('INVENTORY');
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if v_id is not null then
    perform public.delete_stock_adjustment(v_id);
  end if;

  insert into public.stock_adjustments (id, adjustment_no, adjustment_date, kind, item_id, warehouse_id, lot_id,
    qty_kg, bags, bag_size_kg, unit_cost, reason)
  values (coalesce(v_id, gen_random_uuid()),
    coalesce(nullif(p->>'adjustment_no', ''), public.next_doc_no('ADJ', (p->>'adjustment_date')::date)),
    (p->>'adjustment_date')::date, p->>'kind', (p->>'item_id')::uuid, (p->>'warehouse_id')::uuid,
    nullif(p->>'lot_id', '')::uuid, (p->>'qty_kg')::numeric, coalesce((p->>'bags')::numeric, 0),
    coalesce((p->>'bag_size_kg')::numeric, 0), coalesce((p->>'unit_cost')::numeric, 0), p->>'reason')
  returning * into v_a;

  if v_a.kind = 'LOSS' then
    v_value := public.consume_stock(v_a.adjustment_date, v_a.item_id, v_a.warehouse_id, v_a.qty_kg, v_a.bags,
      'ADJUSTMENT', v_a.id, null, v_a.lot_id, null, coalesce(v_a.reason, 'Stock loss'));
    perform public.post_journal(v_a.adjustment_date, 'ADJUSTMENT', v_a.id, 'Stock loss ' || v_a.adjustment_no, jsonb_build_array(
      public.jl_dr(public.system_account('STOCK_ADJUSTMENT'), v_value), public.jl_cr(v_inv, v_value)));
  else
    perform public.receive_stock(v_a.adjustment_date, v_a.item_id, v_a.warehouse_id, v_a.qty_kg, v_a.bags,
      v_a.bag_size_kg, v_a.unit_cost, 'ADJUSTMENT', v_a.id, null, null, v_a.reason);
    v_value := round(v_a.qty_kg * v_a.unit_cost, 2);
    perform public.post_journal(v_a.adjustment_date, 'ADJUSTMENT', v_a.id,
      case v_a.kind when 'OPENING' then 'Opening stock ' else 'Stock gain ' end || v_a.adjustment_no,
      jsonb_build_array(
        public.jl_dr(v_inv, v_value),
        public.jl_cr(public.system_account(case v_a.kind when 'OPENING' then 'OPENING_EQUITY' else 'STOCK_ADJUSTMENT' end), v_value)));
  end if;

  update public.stock_adjustments set value = v_value where id = v_a.id;
  return v_a.id;
end;
$$;

create or replace function public.delete_stock_adjustment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  perform public.unpost_stock('ADJUSTMENT', p_id);
  perform public.unpost_journal('ADJUSTMENT', p_id);
  delete from public.stock_adjustments where id = p_id;
end;
$$;

-- Views
create or replace view public.v_stock_summary with (security_invoker = true) as
select
  i.id as item_id, i.name as item_name, i.name_bn as item_name_bn, i.category,
  w.id as warehouse_id, w.name as warehouse_name, w.name_bn as warehouse_name_bn,
  sum(l.remaining_kg) as qty_kg,
  sum(l.remaining_bags) as bags,
  round(sum(l.remaining_kg * l.unit_cost), 2) as value,
  case when sum(l.remaining_kg) > 0 then round(sum(l.remaining_kg * l.unit_cost) / sum(l.remaining_kg), 4) else 0 end as avg_cost,
  i.reorder_level_kg
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id
where l.remaining_kg > 0.0005
group by i.id, w.id;

create or replace view public.v_lots with (security_invoker = true) as
select
  l.*, i.name as item_name, i.name_bn as item_name_bn, i.category,
  w.name as warehouse_name, w.name_bn as warehouse_name_bn
from public.lots l
join public.items i on i.id = l.item_id
join public.warehouses w on w.id = l.warehouse_id;
