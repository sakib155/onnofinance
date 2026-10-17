-- 0015 Sales orders: a customer's order with their PO (purchase order) number, delivered by one or more
-- sales invoices. Invoices carry the PO number so it prints on the bill and challan, and each order shows
-- ordered vs delivered vs remaining for order tracking.

------------------------------------------------------------------------------------------
-- 1. Tables
------------------------------------------------------------------------------------------
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,                    -- our number, ORD-2026-00001
  order_date date not null,
  customer_id uuid not null references public.parties(id),
  po_number text,                                   -- the customer's PO number, printed on our bills
  po_date date,
  delivery_date date,                               -- promised / expected delivery
  warehouse_id uuid references public.warehouses(id),
  delivery_address text,
  notes text,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED', 'CANCELLED')),
  goods_amount numeric(14,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);
create index if not exists sales_orders_date_idx on public.sales_orders (order_date);
create index if not exists sales_orders_po_idx on public.sales_orders (po_number);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  line_no int not null,
  item_id uuid not null references public.items(id),
  bags numeric(12,2) not null default 0,
  bag_size_kg numeric(10,3) not null default 0,
  qty_kg numeric(14,3) not null check (qty_kg > 0),
  rate numeric(14,4) not null default 0,            -- agreed price, can be left 0
  rate_unit text not null default 'KG' check (rate_unit in ('KG', 'BAG')),
  amount numeric(14,2) not null default 0,
  unique (order_id, item_id)
);

create index if not exists sales_order_lines_order_idx on public.sales_order_lines (order_id);

-- Invoices: which order they deliver, and the customer's PO number (copied from the order, or typed in)
alter table public.sales add column if not exists order_id uuid references public.sales_orders(id);
alter table public.sales add column if not exists po_number text;
alter table public.sales add column if not exists po_date date;
create index if not exists sales_order_idx on public.sales (order_id);

------------------------------------------------------------------------------------------
-- 2. Saving, closing, deleting orders
------------------------------------------------------------------------------------------
create or replace function public.save_sales_order(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'order_date')::date;
  v_no text;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
  l jsonb;
  v_i int := 0;
  v_amount numeric;
  v_goods numeric := 0;
  v_status text;
begin
  perform public.require_perm('sale');
  if v_customer is null then
    raise exception 'Choose the customer';
  end if;
  if v_date is null then
    raise exception 'Enter the order date';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  if v_id is not null then
    select order_no, status into v_no, v_status from public.sales_orders where id = v_id;
    if v_no is null then
      raise exception 'Order not found';
    end if;
    if v_status = 'CANCELLED' then
      raise exception 'This order is cancelled; reopen it before editing';
    end if;
    if exists (select 1 from public.sales where order_id = v_id and customer_id <> v_customer) then
      raise exception 'Invoices for this order are made out to another customer; the customer cannot be changed';
    end if;
    delete from public.sales_order_lines where order_id = v_id;
  else
    v_id := gen_random_uuid();
    v_no := public.next_doc_no('ORD', v_date);
  end if;

  insert into public.sales_orders (id, order_no, order_date, customer_id, po_number, po_date, delivery_date,
    warehouse_id, delivery_address, notes)
  values (v_id, v_no, v_date, v_customer, nullif(trim(p->>'po_number'), ''), nullif(p->>'po_date', '')::date,
    nullif(p->>'delivery_date', '')::date, nullif(p->>'warehouse_id', '')::uuid, nullif(p->>'delivery_address', ''),
    nullif(p->>'notes', ''))
  on conflict (id) do update set
    order_date = excluded.order_date, customer_id = excluded.customer_id, po_number = excluded.po_number,
    po_date = excluded.po_date, delivery_date = excluded.delivery_date, warehouse_id = excluded.warehouse_id,
    delivery_address = excluded.delivery_address, notes = excluded.notes, updated_at = now();

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    if nullif(l->>'item_id', '') is null then
      raise exception 'Line %: choose an item', v_i;
    end if;
    if coalesce(nullif(l->>'qty_kg', '')::numeric, 0) <= 0 then
      raise exception 'Line %: enter the ordered weight', v_i;
    end if;
    if exists (select 1 from public.sales_order_lines where order_id = v_id and item_id = (l->>'item_id')::uuid) then
      raise exception 'Line %: this item is already on the order; put the whole quantity on one line', v_i;
    end if;
    if coalesce(l->>'rate_unit', 'KG') = 'BAG' and coalesce(nullif(l->>'rate', '')::numeric, 0) > 0
       and coalesce(nullif(l->>'bags', '')::numeric, 0) <= 0 then
      raise exception 'Line %: enter the number of bags for a per-bag rate', v_i;
    end if;
    v_amount := round(coalesce(nullif(l->>'rate', '')::numeric, 0) *
      case when coalesce(l->>'rate_unit', 'KG') = 'BAG' then coalesce(nullif(l->>'bags', '')::numeric, 0)
           else nullif(l->>'qty_kg', '')::numeric end, 2);
    insert into public.sales_order_lines (order_id, line_no, item_id, bags, bag_size_kg, qty_kg, rate, rate_unit, amount)
    values (v_id, v_i, (l->>'item_id')::uuid, coalesce(nullif(l->>'bags', '')::numeric, 0),
      coalesce(nullif(l->>'bag_size_kg', '')::numeric, 0), (l->>'qty_kg')::numeric,
      coalesce(nullif(l->>'rate', '')::numeric, 0), coalesce(l->>'rate_unit', 'KG'), v_amount);
    v_goods := v_goods + v_amount;
  end loop;

  update public.sales_orders set goods_amount = v_goods where id = v_id;
  -- invoices already made keep showing the order's current PO number
  update public.sales s set po_number = o.po_number, po_date = o.po_date
  from public.sales_orders o where o.id = v_id and s.order_id = v_id;
  return v_id;
end;
$$;

-- OPEN: still to deliver. CLOSED: finished (fully delivered, or the rest will not be sent). CANCELLED: called off.
create or replace function public.set_sales_order_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_perm('sale');
  if p_status not in ('OPEN', 'CLOSED', 'CANCELLED') then
    raise exception 'Unknown order status %', p_status;
  end if;
  if p_status = 'CANCELLED' and exists (select 1 from public.sales where order_id = p_id) then
    raise exception 'Goods have already been delivered on this order; close it instead of cancelling';
  end if;
  update public.sales_orders set status = p_status, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Order not found';
  end if;
end;
$$;

create or replace function public.delete_sales_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_perm('delete_doc');
  if exists (select 1 from public.sales where order_id = p_id) then
    raise exception 'Invoices have been made against this order; delete them first, or cancel/close the order';
  end if;
  delete from public.sales_orders where id = p_id;
end;
$$;

------------------------------------------------------------------------------------------
-- 3. Invoices take the order and PO number (save_sale from 0012, with order_id/po_number added)
------------------------------------------------------------------------------------------
create or replace function public.save_sale(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'sale_date')::date;
  v_no text := nullif(p->>'sale_no', '');
  v_order uuid := nullif(p->>'order_id', '')::uuid;
  v_po text := nullif(trim(p->>'po_number'), '');
  v_po_date date := nullif(p->>'po_date', '')::date;
  o public.sales_orders;
  l jsonb;
  v_i int := 0;
  v_goods numeric := 0;
  v_amount numeric;
  v_other_paid numeric;
  h public.sales;
begin
  perform public.require_perm('sale');
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  if v_order is not null then
    select * into o from public.sales_orders where id = v_order;
    if o.id is null then
      raise exception 'Order not found';
    end if;
    if o.customer_id <> (p->>'customer_id')::uuid then
      raise exception 'Order % is for another customer', o.order_no;
    end if;
    -- a new delivery needs an open order; an invoice already on the order can still be edited
    if o.status <> 'OPEN' and not exists (select 1 from public.sales where id = v_id and order_id = v_order) then
      raise exception 'Order % is %; reopen it to deliver more', o.order_no, lower(o.status);
    end if;
    v_po := coalesce(o.po_number, v_po);
    v_po_date := coalesce(o.po_date, v_po_date);
  end if;

  if v_id is not null then
    perform public.unpost_sale(v_id);
    delete from public.sale_lines where sale_id = v_id;
    select sale_no into v_no from public.sales where id = v_id;
  else
    v_id := gen_random_uuid();
  end if;

  insert into public.sales (id, sale_no, sale_date, customer_id, broker_id, warehouse_id, vehicle_no, driver_name, driver_phone,
    reference, notes, transport_charge, labour_charge, discount, commission_amount, received_amount, received_account_id,
    received_method, received_cheque_no, received_cheque_date, order_id, po_number, po_date)
  values (v_id, coalesce(v_no, public.next_doc_no('SAL', v_date)), v_date, (p->>'customer_id')::uuid,
    nullif(p->>'broker_id', '')::uuid, (p->>'warehouse_id')::uuid, p->>'vehicle_no', p->>'driver_name', p->>'driver_phone',
    p->>'reference', p->>'notes', coalesce(nullif(p->>'transport_charge', '')::numeric, 0), coalesce(nullif(p->>'labour_charge', '')::numeric, 0),
    coalesce(nullif(p->>'discount', '')::numeric, 0), coalesce(nullif(p->>'commission_amount', '')::numeric, 0),
    coalesce(nullif(p->>'received_amount', '')::numeric, 0), nullif(p->>'received_account_id', '')::uuid,
    coalesce(nullif(p->>'received_method', ''), 'CASH'), nullif(p->>'received_cheque_no', ''), nullif(p->>'received_cheque_date', '')::date,
    v_order, v_po, v_po_date)
  on conflict (id) do update set
    sale_date = excluded.sale_date, customer_id = excluded.customer_id, broker_id = excluded.broker_id,
    warehouse_id = excluded.warehouse_id, vehicle_no = excluded.vehicle_no, driver_name = excluded.driver_name,
    driver_phone = excluded.driver_phone, reference = excluded.reference, notes = excluded.notes,
    transport_charge = excluded.transport_charge, labour_charge = excluded.labour_charge, discount = excluded.discount,
    commission_amount = excluded.commission_amount, received_amount = excluded.received_amount,
    received_account_id = excluded.received_account_id, received_method = excluded.received_method,
    received_cheque_no = excluded.received_cheque_no, received_cheque_date = excluded.received_cheque_date,
    order_id = excluded.order_id, po_number = excluded.po_number, po_date = excluded.po_date, updated_at = now();

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    if coalesce(l->>'rate_unit', 'KG') = 'BAG' and coalesce(nullif(l->>'bags', '')::numeric, 0) <= 0 then
      raise exception 'Line %: enter the number of bags for a per-bag rate', v_i;
    end if;
    v_amount := public.line_amount(coalesce(l->>'rate_unit', 'KG'), nullif(l->>'rate', '')::numeric,
      nullif(l->>'qty_kg', '')::numeric, nullif(l->>'bags', '')::numeric);
    insert into public.sale_lines (sale_id, line_no, item_id, lot_id, warehouse_id, bags, bag_size_kg, qty_kg, rate, rate_unit, amount)
    values (v_id, v_i, (l->>'item_id')::uuid, nullif(l->>'lot_id', '')::uuid, nullif(l->>'warehouse_id', '')::uuid,
      coalesce(nullif(l->>'bags', '')::numeric, 0), coalesce(nullif(l->>'bag_size_kg', '')::numeric, 0),
      nullif(l->>'qty_kg', '')::numeric, coalesce(nullif(l->>'rate', '')::numeric, 0), coalesce(l->>'rate_unit', 'KG'), v_amount);
    v_goods := v_goods + v_amount;
  end loop;

  update public.sales set
    goods_amount = v_goods,
    total_amount = v_goods - discount + transport_charge + labour_charge
  where id = v_id
  returning * into h;

  if h.received_amount > 0 and h.received_account_id is null then
    raise exception 'Choose the cash or bank account the money was received into';
  end if;
  select coalesce((select sum(bs.amount) from public.bill_settlements bs join public.money_txns m on m.id = bs.money_txn_id
                   where bs.sale_id = v_id and m.linked_sale_id is distinct from v_id), 0)
       + coalesce((select sum(amount) from public.sale_returns where sale_id = v_id), 0)
  into v_other_paid;
  if h.total_amount + 0.005 < v_other_paid + h.received_amount then
    raise exception 'The invoice total (%) is less than what has already been received or returned against it (%)',
      h.total_amount, v_other_paid + h.received_amount;
  end if;

  perform public.post_sale(v_id);
  return v_id;
end;
$$;

------------------------------------------------------------------------------------------
-- 4. Views: invoice dues (picks up the new columns), order lines and orders with delivery progress
------------------------------------------------------------------------------------------
drop view if exists public.v_sale_dues;
create view public.v_sale_dues with (security_invoker = true) as
select
  s.*, p.name as customer_name, p.name_bn as customer_name_bn,
  coalesce(st.settled, 0) + coalesce(rt.returned, 0) as total_paid,
  s.total_amount - coalesce(st.settled, 0) - coalesce(rt.returned, 0) as due_amount,
  current_date - s.sale_date as age_days
from public.sales s
join public.parties p on p.id = s.customer_id
left join (select sale_id, sum(amount) as settled from public.bill_settlements where sale_id is not null group by sale_id) st on st.sale_id = s.id
left join (select sale_id, sum(amount) as returned from public.sale_returns where sale_id is not null group by sale_id) rt on rt.sale_id = s.id;

-- Delivered = sold on the order's invoices less goods returned against them
drop view if exists public.v_sales_orders;
drop view if exists public.v_sales_order_lines;
create view public.v_sales_order_lines with (security_invoker = true) as
with sold as (
  select s.order_id, sl.item_id, sum(sl.qty_kg) as kg, sum(sl.bags) as bags
  from public.sale_lines sl join public.sales s on s.id = sl.sale_id
  where s.order_id is not null
  group by s.order_id, sl.item_id
),
returned as (
  select s.order_id, r.item_id, sum(r.qty_kg) as kg, sum(r.bags) as bags
  from public.sale_returns r join public.sales s on s.id = r.sale_id
  where s.order_id is not null
  group by s.order_id, r.item_id
)
select
  ol.*,
  coalesce(so.kg, 0) - coalesce(rt.kg, 0) as delivered_kg,
  coalesce(so.bags, 0) - coalesce(rt.bags, 0) as delivered_bags,
  greatest(ol.qty_kg - (coalesce(so.kg, 0) - coalesce(rt.kg, 0)), 0) as remaining_kg,
  greatest(ol.bags - (coalesce(so.bags, 0) - coalesce(rt.bags, 0)), 0) as remaining_bags
from public.sales_order_lines ol
left join sold so on so.order_id = ol.order_id and so.item_id = ol.item_id
left join returned rt on rt.order_id = ol.order_id and rt.item_id = ol.item_id;

create view public.v_sales_orders with (security_invoker = true) as
with lines as (
  select order_id, sum(qty_kg) as ordered_kg, sum(bags) as ordered_bags,
    sum(least(delivered_kg, qty_kg)) as delivered_kg, sum(remaining_kg) as remaining_kg
  from public.v_sales_order_lines group by order_id
),
inv as (
  select order_id, count(*) as invoice_count, sum(total_amount) as invoiced_amount, max(sale_date) as last_delivery
  from public.sales where order_id is not null group by order_id
)
select
  o.*, p.name as customer_name, p.name_bn as customer_name_bn, p.phone as customer_phone,
  coalesce(l.ordered_kg, 0) as ordered_kg, coalesce(l.ordered_bags, 0) as ordered_bags,
  coalesce(l.delivered_kg, 0) as delivered_kg, coalesce(l.remaining_kg, 0) as remaining_kg,
  case when coalesce(l.ordered_kg, 0) > 0 then round(100 * coalesce(l.delivered_kg, 0) / l.ordered_kg, 1) else 0 end as delivered_pct,
  coalesce(i.invoice_count, 0) as invoice_count, coalesce(i.invoiced_amount, 0) as invoiced_amount, i.last_delivery,
  case
    when o.status = 'CANCELLED' then 'CANCELLED'
    when coalesce(l.remaining_kg, 0) <= 0.0005 and coalesce(l.ordered_kg, 0) > 0 then 'DELIVERED'
    when o.status = 'CLOSED' then 'CLOSED'
    when coalesce(l.delivered_kg, 0) > 0 then 'PARTIAL'
    else 'PENDING'
  end as progress,
  (o.status = 'OPEN' and o.delivery_date is not null and o.delivery_date < current_date
    and coalesce(l.remaining_kg, 0) > 0.0005) as overdue
from public.sales_orders o
join public.parties p on p.id = o.customer_id
left join lines l on l.order_id = o.id
left join inv i on i.order_id = o.id;

------------------------------------------------------------------------------------------
-- 5. Security, permissions, audit
------------------------------------------------------------------------------------------
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

drop policy if exists "read sales_orders" on public.sales_orders;
create policy "read sales_orders" on public.sales_orders for select to authenticated using (public.app_role() is not null);
drop policy if exists "read sales_order_lines" on public.sales_order_lines;
create policy "read sales_order_lines" on public.sales_order_lines for select to authenticated using (public.app_role() is not null);

grant select on public.sales_orders, public.sales_order_lines, public.v_sales_orders, public.v_sales_order_lines,
  public.v_sale_dues to authenticated;

revoke execute on function public.save_sales_order(jsonb), public.set_sales_order_status(uuid, text),
  public.delete_sales_order(uuid), public.save_sale(jsonb) from public, anon;
grant execute on function public.save_sales_order(jsonb), public.set_sales_order_status(uuid, text),
  public.delete_sales_order(uuid), public.save_sale(jsonb) to authenticated;

drop trigger if exists audit_sales_orders on public.sales_orders;
create trigger audit_sales_orders after insert or update or delete on public.sales_orders
for each row execute function public.audit_row();
