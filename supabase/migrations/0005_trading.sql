-- 0005 Trading: purchases, sales, returns
--
-- Each document is saved through one function that takes the whole document as JSON,
-- writes header and lines, and posts stock and journal entries in the same transaction.
-- Editing a document first reverses its previous effects, then posts it again.

-- Line amount: rate is per kg or per bag
create or replace function public.line_amount(p_rate_unit text, p_rate numeric, p_qty_kg numeric, p_bags numeric)
returns numeric language sql immutable as $$
  select round(coalesce(p_rate, 0) * case when p_rate_unit = 'BAG' then coalesce(p_bags, 0) else coalesce(p_qty_kg, 0) end, 2)
$$;

------------------------------------------------------------------------------------------
-- Purchases
------------------------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  purchase_date date not null,
  supplier_id uuid not null references public.parties(id),
  broker_id uuid references public.parties(id),
  warehouse_id uuid not null references public.warehouses(id),
  vehicle_no text,
  reference text,
  notes text,
  goods_amount numeric(14,2) not null default 0,       -- sum of lines
  discount numeric(14,2) not null default 0,           -- reduces supplier bill
  supplier_total numeric(14,2) not null default 0,     -- goods - discount, owed to supplier
  transport_cost numeric(14,2) not null default 0,     -- added to stock cost
  labour_cost numeric(14,2) not null default 0,        -- added to stock cost
  other_cost numeric(14,2) not null default 0,         -- added to stock cost
  costs_account_id uuid references public.accounts(id),-- cash/bank that paid the extra costs; null = added to supplier bill
  commission_amount numeric(14,2) not null default 0,  -- owed to broker, added to stock cost
  paid_amount numeric(14,2) not null default 0,        -- paid to supplier at purchase time
  paid_account_id uuid references public.accounts(id),
  total_cost numeric(14,2) not null default 0,         -- landed cost of all goods
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.purchases (supplier_id);
create index on public.purchases (purchase_date);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  line_no int not null,
  item_id uuid not null references public.items(id),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  gross_kg numeric(14,3) not null,
  deduction_kg numeric(14,3) not null default 0,  -- moisture, bag weight, dust
  net_kg numeric(14,3) not null,
  rate numeric(14,4) not null,
  rate_unit text not null default 'KG' check (rate_unit in ('KG', 'BAG')),
  amount numeric(14,2) not null,
  unit_cost numeric(18,6) not null default 0,     -- landed cost per kg
  lot_id uuid references public.lots(id) on delete set null
);

create index on public.purchase_lines (purchase_id);

create or replace function public.post_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.purchases;
  r public.purchase_lines;
  v_extra numeric;
  v_lot uuid;
  v_unit numeric;
  v_inv uuid := public.system_account('INVENTORY');
  v_ap uuid := public.system_account('PAYABLE');
  v_lines jsonb;
begin
  select * into h from public.purchases where id = p_id;
  v_extra := h.transport_cost + h.labour_cost + h.other_cost + h.commission_amount;

  -- stock: spread extra costs across lines by value
  for r in select * from public.purchase_lines where purchase_id = p_id order by line_no loop
    v_unit := case when r.net_kg > 0 then
      (r.amount + case when h.goods_amount > 0 then v_extra * r.amount / h.goods_amount else 0 end
                - case when h.goods_amount > 0 then h.discount * r.amount / h.goods_amount else 0 end) / r.net_kg
      else 0 end;
    v_lot := public.receive_stock(h.purchase_date, r.item_id, h.warehouse_id, r.net_kg, r.bags, r.bag_size_kg,
      v_unit, 'PURCHASE', h.id, r.id, null, h.purchase_no);
    update public.purchase_lines set lot_id = v_lot, unit_cost = round(v_unit, 6) where id = r.id;
  end loop;

  -- journal
  v_lines := jsonb_build_array(
    public.jl_dr(v_inv, h.total_cost, null, 'Goods received'),
    public.jl_cr(v_ap, h.goods_amount - h.discount, h.supplier_id, 'Supplier bill')
  );
  if h.commission_amount > 0 then
    if h.broker_id is null then
      raise exception 'Choose the broker to pay commission to';
    end if;
    v_lines := v_lines || public.jl_cr(v_ap, h.commission_amount, h.broker_id, 'Broker commission');
  end if;
  if h.transport_cost + h.labour_cost + h.other_cost > 0 then
    if h.costs_account_id is not null then
      v_lines := v_lines || public.jl_cr(h.costs_account_id, h.transport_cost + h.labour_cost + h.other_cost, null, 'Transport and labour');
    else
      v_lines := v_lines || public.jl_cr(v_ap, h.transport_cost + h.labour_cost + h.other_cost, h.supplier_id, 'Transport and labour');
    end if;
  end if;
  if h.paid_amount > 0 then
    if h.paid_account_id is null then
      raise exception 'Choose the cash or bank account the payment was made from';
    end if;
    v_lines := v_lines
      || public.jl_dr(v_ap, h.paid_amount, h.supplier_id, 'Paid at purchase')
      || public.jl_cr(h.paid_account_id, h.paid_amount, null, 'Paid at purchase');
  end if;

  perform public.post_journal(h.purchase_date, 'PURCHASE', h.id, 'Purchase ' || h.purchase_no, v_lines);
end;
$$;

create or replace function public.unpost_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.unpost_stock('PURCHASE', p_id);
  perform public.unpost_journal('PURCHASE', p_id);
end;
$$;

create or replace function public.save_purchase(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'purchase_date')::date;
  v_no text := nullif(p->>'purchase_no', '');
  l jsonb;
  v_i int := 0;
  v_goods numeric := 0;
  v_net numeric;
  v_amount numeric;
  h public.purchases;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  if v_id is not null then
    perform public.unpost_purchase(v_id);
    delete from public.purchase_lines where purchase_id = v_id;
    select purchase_no into v_no from public.purchases where id = v_id;
  else
    v_id := gen_random_uuid();
  end if;

  insert into public.purchases (id, purchase_no, purchase_date, supplier_id, broker_id, warehouse_id, vehicle_no, reference, notes,
    discount, transport_cost, labour_cost, other_cost, costs_account_id, commission_amount, paid_amount, paid_account_id)
  values (v_id, coalesce(v_no, public.next_doc_no('PUR', v_date)), v_date, (p->>'supplier_id')::uuid,
    nullif(p->>'broker_id', '')::uuid, (p->>'warehouse_id')::uuid, p->>'vehicle_no', p->>'reference', p->>'notes',
    coalesce((p->>'discount')::numeric, 0), coalesce((p->>'transport_cost')::numeric, 0),
    coalesce((p->>'labour_cost')::numeric, 0), coalesce((p->>'other_cost')::numeric, 0),
    nullif(p->>'costs_account_id', '')::uuid, coalesce((p->>'commission_amount')::numeric, 0),
    coalesce((p->>'paid_amount')::numeric, 0), nullif(p->>'paid_account_id', '')::uuid)
  on conflict (id) do update set
    purchase_date = excluded.purchase_date, supplier_id = excluded.supplier_id, broker_id = excluded.broker_id,
    warehouse_id = excluded.warehouse_id, vehicle_no = excluded.vehicle_no, reference = excluded.reference,
    notes = excluded.notes, discount = excluded.discount, transport_cost = excluded.transport_cost,
    labour_cost = excluded.labour_cost, other_cost = excluded.other_cost, costs_account_id = excluded.costs_account_id,
    commission_amount = excluded.commission_amount, paid_amount = excluded.paid_amount,
    paid_account_id = excluded.paid_account_id, updated_at = now();

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    v_net := coalesce((l->>'gross_kg')::numeric, 0) - coalesce((l->>'deduction_kg')::numeric, 0);
    if v_net <= 0 then
      raise exception 'Line %: net weight must be greater than zero', v_i;
    end if;
    v_amount := public.line_amount(coalesce(l->>'rate_unit', 'KG'), (l->>'rate')::numeric, v_net, (l->>'bags')::numeric);
    insert into public.purchase_lines (purchase_id, line_no, item_id, bags, bag_size_kg, gross_kg, deduction_kg, net_kg,
      rate, rate_unit, amount)
    values (v_id, v_i, (l->>'item_id')::uuid, coalesce((l->>'bags')::numeric, 0), coalesce((l->>'bag_size_kg')::numeric, 0),
      (l->>'gross_kg')::numeric, coalesce((l->>'deduction_kg')::numeric, 0), v_net,
      coalesce((l->>'rate')::numeric, 0), coalesce(l->>'rate_unit', 'KG'), v_amount);
    v_goods := v_goods + v_amount;
  end loop;

  update public.purchases set
    goods_amount = v_goods,
    supplier_total = v_goods - discount
      + case when costs_account_id is null then transport_cost + labour_cost + other_cost else 0 end,
    total_cost = v_goods - discount + transport_cost + labour_cost + other_cost + commission_amount
  where id = v_id
  returning * into h;

  if h.paid_amount > h.supplier_total then
    raise exception 'Paid amount is more than the supplier bill';
  end if;

  perform public.post_purchase(v_id);
  return v_id;
end;
$$;

create or replace function public.delete_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_purchase(p_id);
  delete from public.purchases where id = p_id;
end;
$$;

------------------------------------------------------------------------------------------
-- Sales
------------------------------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_no text not null unique,
  sale_date date not null,
  customer_id uuid not null references public.parties(id),
  broker_id uuid references public.parties(id),
  warehouse_id uuid not null references public.warehouses(id),
  vehicle_no text,
  driver_name text,
  driver_phone text,
  reference text,
  notes text,
  goods_amount numeric(14,2) not null default 0,
  transport_charge numeric(14,2) not null default 0,   -- charged to customer
  labour_charge numeric(14,2) not null default 0,      -- charged to customer
  discount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,       -- customer owes this
  commission_amount numeric(14,2) not null default 0,  -- owed to broker, selling expense
  received_amount numeric(14,2) not null default 0,
  received_account_id uuid references public.accounts(id),
  cost_amount numeric(14,2) not null default 0,        -- cost of goods sold
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.sales (customer_id);
create index on public.sales (sale_date);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  line_no int not null,
  item_id uuid not null references public.items(id),
  lot_id uuid references public.lots(id),      -- picked lot, or null for FIFO
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  rate numeric(14,4) not null,
  rate_unit text not null default 'KG' check (rate_unit in ('KG', 'BAG')),
  amount numeric(14,2) not null,
  cost_amount numeric(14,2) not null default 0
);

create index on public.sale_lines (sale_id);

create or replace function public.post_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.sales;
  r public.sale_lines;
  v_cost numeric;
  v_total_cost numeric := 0;
  v_ar uuid := public.system_account('RECEIVABLE');
  v_lines jsonb;
begin
  select * into h from public.sales where id = p_id;

  for r in select * from public.sale_lines where sale_id = p_id order by line_no loop
    v_cost := public.consume_stock(h.sale_date, r.item_id, h.warehouse_id, r.qty_kg, r.bags,
      'SALE', h.id, r.id, r.lot_id,
      -- revenue for lot profit: line amount less its share of discount
      r.amount - case when h.goods_amount > 0 then h.discount * r.amount / h.goods_amount else 0 end,
      h.sale_no);
    update public.sale_lines set cost_amount = v_cost where id = r.id;
    v_total_cost := v_total_cost + v_cost;
  end loop;
  update public.sales set cost_amount = v_total_cost where id = p_id;

  v_lines := jsonb_build_array(
    public.jl_dr(v_ar, h.total_amount, h.customer_id, 'Sale'),
    public.jl_cr(public.system_account('SALES'), h.goods_amount - h.discount, null, 'Sales'),
    public.jl_cr(public.system_account('OTHER_INCOME'), h.transport_charge + h.labour_charge, null, 'Transport and labour charged'),
    public.jl_dr(public.system_account('COGS'), v_total_cost, null, 'Cost of goods sold'),
    public.jl_cr(public.system_account('INVENTORY'), v_total_cost, null, 'Goods issued')
  );
  if h.commission_amount > 0 then
    if h.broker_id is null then
      raise exception 'Choose the broker to pay commission to';
    end if;
    v_lines := v_lines
      || public.jl_dr(public.system_account('COMMISSION'), h.commission_amount, null, 'Broker commission')
      || public.jl_cr(public.system_account('PAYABLE'), h.commission_amount, h.broker_id, 'Broker commission');
  end if;
  if h.received_amount > 0 then
    if h.received_account_id is null then
      raise exception 'Choose the cash or bank account the money was received into';
    end if;
    v_lines := v_lines
      || public.jl_dr(h.received_account_id, h.received_amount, null, 'Received at sale')
      || public.jl_cr(v_ar, h.received_amount, h.customer_id, 'Received at sale');
  end if;

  perform public.post_journal(h.sale_date, 'SALE', h.id, 'Sale ' || h.sale_no, v_lines);
end;
$$;

create or replace function public.unpost_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.sale_returns where sale_id = p_id) then
    raise exception 'This sale has returns. Delete the returns first.';
  end if;
  perform public.unpost_stock('SALE', p_id);
  perform public.unpost_journal('SALE', p_id);
end;
$$;

create or replace function public.save_sale(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'sale_date')::date;
  v_no text := nullif(p->>'sale_no', '');
  l jsonb;
  v_i int := 0;
  v_goods numeric := 0;
  v_amount numeric;
  h public.sales;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT', 'OPERATOR');
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  if v_id is not null then
    perform public.unpost_sale(v_id);
    delete from public.sale_lines where sale_id = v_id;
    select sale_no into v_no from public.sales where id = v_id;
  else
    v_id := gen_random_uuid();
  end if;

  insert into public.sales (id, sale_no, sale_date, customer_id, broker_id, warehouse_id, vehicle_no, driver_name, driver_phone,
    reference, notes, transport_charge, labour_charge, discount, commission_amount, received_amount, received_account_id)
  values (v_id, coalesce(v_no, public.next_doc_no('SAL', v_date)), v_date, (p->>'customer_id')::uuid,
    nullif(p->>'broker_id', '')::uuid, (p->>'warehouse_id')::uuid, p->>'vehicle_no', p->>'driver_name', p->>'driver_phone',
    p->>'reference', p->>'notes', coalesce((p->>'transport_charge')::numeric, 0), coalesce((p->>'labour_charge')::numeric, 0),
    coalesce((p->>'discount')::numeric, 0), coalesce((p->>'commission_amount')::numeric, 0),
    coalesce((p->>'received_amount')::numeric, 0), nullif(p->>'received_account_id', '')::uuid)
  on conflict (id) do update set
    sale_date = excluded.sale_date, customer_id = excluded.customer_id, broker_id = excluded.broker_id,
    warehouse_id = excluded.warehouse_id, vehicle_no = excluded.vehicle_no, driver_name = excluded.driver_name,
    driver_phone = excluded.driver_phone, reference = excluded.reference, notes = excluded.notes,
    transport_charge = excluded.transport_charge, labour_charge = excluded.labour_charge, discount = excluded.discount,
    commission_amount = excluded.commission_amount, received_amount = excluded.received_amount,
    received_account_id = excluded.received_account_id, updated_at = now();

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    v_amount := public.line_amount(coalesce(l->>'rate_unit', 'KG'), (l->>'rate')::numeric, (l->>'qty_kg')::numeric, (l->>'bags')::numeric);
    insert into public.sale_lines (sale_id, line_no, item_id, lot_id, bags, bag_size_kg, qty_kg, rate, rate_unit, amount)
    values (v_id, v_i, (l->>'item_id')::uuid, nullif(l->>'lot_id', '')::uuid, coalesce((l->>'bags')::numeric, 0),
      coalesce((l->>'bag_size_kg')::numeric, 0), (l->>'qty_kg')::numeric, coalesce((l->>'rate')::numeric, 0),
      coalesce(l->>'rate_unit', 'KG'), v_amount);
    v_goods := v_goods + v_amount;
  end loop;

  update public.sales set
    goods_amount = v_goods,
    total_amount = v_goods - discount + transport_charge + labour_charge
  where id = v_id
  returning * into h;

  if h.received_amount > h.total_amount then
    raise exception 'Received amount is more than the invoice total';
  end if;

  perform public.post_sale(v_id);
  return v_id;
end;
$$;

create or replace function public.delete_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_sale(p_id);
  delete from public.sales where id = p_id;
end;
$$;

------------------------------------------------------------------------------------------
-- Returns
------------------------------------------------------------------------------------------
-- Sale return: goods come back into stock at their original cost; customer is credited.
create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  return_date date not null,
  sale_id uuid references public.sales(id),
  customer_id uuid not null references public.parties(id),
  warehouse_id uuid not null references public.warehouses(id),
  item_id uuid not null references public.items(id),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  amount numeric(14,2) not null,      -- credited to customer
  unit_cost numeric(18,6) not null default 0,
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.save_sale_return(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_unit numeric;
  r public.sale_returns;
  v_cost numeric;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  if exists (select 1 from public.sale_returns where id = v_id) then
    perform public.delete_sale_return(v_id);
  end if;

  -- cost: average cost per kg of this item in the original sale, else the item's standard price
  select case when sum(qty_kg) > 0 then sum(cost_amount) / sum(qty_kg) end into v_unit
  from public.sale_lines where sale_id = nullif(p->>'sale_id', '')::uuid and item_id = (p->>'item_id')::uuid;
  if v_unit is null then
    select standard_price into v_unit from public.items where id = (p->>'item_id')::uuid;
  end if;

  insert into public.sale_returns (id, return_no, return_date, sale_id, customer_id, warehouse_id, item_id, bags, bag_size_kg,
    qty_kg, amount, unit_cost, reason)
  values (v_id, coalesce(nullif(p->>'return_no', ''), public.next_doc_no('SRT', (p->>'return_date')::date)),
    (p->>'return_date')::date, nullif(p->>'sale_id', '')::uuid, (p->>'customer_id')::uuid, (p->>'warehouse_id')::uuid,
    (p->>'item_id')::uuid, coalesce((p->>'bags')::numeric, 0), coalesce((p->>'bag_size_kg')::numeric, 0),
    (p->>'qty_kg')::numeric, (p->>'amount')::numeric, round(v_unit, 6), p->>'reason')
  returning * into r;

  perform public.receive_stock(r.return_date, r.item_id, r.warehouse_id, r.qty_kg, r.bags, r.bag_size_kg, r.unit_cost,
    'SALE_RETURN', r.id, null, null, r.return_no);
  v_cost := round(r.qty_kg * r.unit_cost, 2);

  perform public.post_journal(r.return_date, 'SALE_RETURN', r.id, 'Sale return ' || r.return_no, jsonb_build_array(
    public.jl_dr(public.system_account('SALES_RETURN'), r.amount),
    public.jl_cr(public.system_account('RECEIVABLE'), r.amount, r.customer_id),
    public.jl_dr(public.system_account('INVENTORY'), v_cost),
    public.jl_cr(public.system_account('COGS'), v_cost)
  ));
  return r.id;
end;
$$;

create or replace function public.delete_sale_return(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_stock('SALE_RETURN', p_id);
  perform public.unpost_journal('SALE_RETURN', p_id);
  delete from public.sale_returns where id = p_id;
end;
$$;

-- Purchase return: goods go back to the supplier; supplier bill is reduced.
create table public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  return_date date not null,
  purchase_id uuid references public.purchases(id),
  supplier_id uuid not null references public.parties(id),
  warehouse_id uuid not null references public.warehouses(id),
  item_id uuid not null references public.items(id),
  lot_id uuid references public.lots(id),
  bags numeric(12,2) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  amount numeric(14,2) not null,      -- debited to supplier
  cost_amount numeric(14,2) not null default 0,
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.save_purchase_return(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  r public.purchase_returns;
  v_cost numeric;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  if exists (select 1 from public.purchase_returns where id = v_id) then
    perform public.delete_purchase_return(v_id);
  end if;

  insert into public.purchase_returns (id, return_no, return_date, purchase_id, supplier_id, warehouse_id, item_id, lot_id,
    bags, qty_kg, amount, reason)
  values (v_id, coalesce(nullif(p->>'return_no', ''), public.next_doc_no('PRT', (p->>'return_date')::date)),
    (p->>'return_date')::date, nullif(p->>'purchase_id', '')::uuid, (p->>'supplier_id')::uuid, (p->>'warehouse_id')::uuid,
    (p->>'item_id')::uuid, nullif(p->>'lot_id', '')::uuid, coalesce((p->>'bags')::numeric, 0), (p->>'qty_kg')::numeric,
    (p->>'amount')::numeric, p->>'reason')
  returning * into r;

  v_cost := public.consume_stock(r.return_date, r.item_id, r.warehouse_id, r.qty_kg, r.bags, 'PURCHASE_RETURN', r.id,
    null, r.lot_id, null, r.return_no);
  update public.purchase_returns set cost_amount = v_cost where id = r.id;

  -- difference between what the supplier credits us and the stock cost goes to cost of goods sold
  perform public.post_journal(r.return_date, 'PURCHASE_RETURN', r.id, 'Purchase return ' || r.return_no, jsonb_build_array(
    public.jl_dr(public.system_account('PAYABLE'), r.amount, r.supplier_id),
    public.jl_cr(public.system_account('INVENTORY'), v_cost),
    public.jl_cr(public.system_account('COGS'), r.amount - v_cost)
  ));
  return r.id;
end;
$$;

create or replace function public.delete_purchase_return(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_stock('PURCHASE_RETURN', p_id);
  perform public.unpost_journal('PURCHASE_RETURN', p_id);
  delete from public.purchase_returns where id = p_id;
end;
$$;
