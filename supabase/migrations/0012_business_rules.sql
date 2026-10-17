-- 0012 Business rule improvements
--
-- 1. A per-bag rate needs a bag count.
-- 3. Each sale line can ship from its own godown.
-- 4. Money received at a sale / paid at a purchase becomes a linked receipt / payment voucher,
--    so it can be cash, bank or a cheque that later clears or bounces. Existing records are converted.
-- 5. An invoice or bill cannot be lowered below what has already been paid against it.
-- 6. Loan repayments and recoveries can include interest.
-- 7. Dues ageing works on each party's whole balance (oldest-first), not only on bills.
--
-- Safe to run on a project that already has data. Run once.

------------------------------------------------------------------------------------------
-- Schema
------------------------------------------------------------------------------------------
alter table public.sale_lines add column if not exists warehouse_id uuid references public.warehouses(id);

alter table public.sales add column if not exists received_method text not null default 'CASH'
  check (received_method in ('CASH', 'BANK', 'CHEQUE'));
alter table public.sales add column if not exists received_cheque_no text;
alter table public.sales add column if not exists received_cheque_date date;

alter table public.purchases add column if not exists paid_method text not null default 'CASH'
  check (paid_method in ('CASH', 'BANK', 'CHEQUE'));
alter table public.purchases add column if not exists paid_cheque_no text;
alter table public.purchases add column if not exists paid_cheque_date date;

alter table public.money_txns add column if not exists linked_sale_id uuid references public.sales(id) on delete cascade;
alter table public.money_txns add column if not exists linked_purchase_id uuid references public.purchases(id) on delete cascade;
alter table public.money_txns add column if not exists interest_amount numeric(14,2) not null default 0
  check (interest_amount >= 0);

create index if not exists money_txns_linked_sale_idx on public.money_txns (linked_sale_id) where linked_sale_id is not null;
create index if not exists money_txns_linked_purchase_idx on public.money_txns (linked_purchase_id) where linked_purchase_id is not null;

insert into public.accounts (code, name, name_bn, type, subtype, is_system) values
  ('4110', 'Interest Received', 'প্রাপ্ত সুদ', 'INCOME', 'INTEREST_INCOME', true),
  ('6095', 'Loan Interest', 'ঋণের সুদ', 'EXPENSE', 'INTEREST_EXPENSE', true)
on conflict (code) do nothing;

------------------------------------------------------------------------------------------
-- Dues: paid = settlements (every receipt/payment, including those made at the sale/purchase) + returns
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

drop view if exists public.v_purchase_dues;
create view public.v_purchase_dues with (security_invoker = true) as
select
  pu.*, p.name as supplier_name, p.name_bn as supplier_name_bn, pu.supplier_total as total_amount,
  coalesce(st.settled, 0) + coalesce(rt.returned, 0) as total_paid,
  pu.supplier_total - coalesce(st.settled, 0) - coalesce(rt.returned, 0) as due_amount,
  current_date - pu.purchase_date as age_days
from public.purchases pu
join public.parties p on p.id = pu.supplier_id
left join (select purchase_id, sum(amount) as settled from public.bill_settlements where purchase_id is not null group by purchase_id) st on st.purchase_id = pu.id
left join (select purchase_id, sum(amount) as returned from public.purchase_returns where purchase_id is not null group by purchase_id) rt on rt.purchase_id = pu.id;

drop view if exists public.v_money_txns;
create view public.v_money_txns with (security_invoker = true) as
select
  t.*,
  m.name as money_account_name, m.subtype as money_account_subtype,
  c.name as counter_account_name,
  p.name as party_name,
  s.sale_no as linked_sale_no,
  pu.purchase_no as linked_purchase_no
from public.money_txns t
join public.accounts m on m.id = t.money_account_id
left join public.accounts c on c.id = t.counter_account_id
left join public.parties p on p.id = t.party_id
left join public.sales s on s.id = t.linked_sale_id
left join public.purchases pu on pu.id = t.linked_purchase_id;

------------------------------------------------------------------------------------------
-- Money
------------------------------------------------------------------------------------------
create or replace function public.post_money_txn(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.money_txns;
  v_lines jsonb;
  v_label text;
  v_principal numeric;
begin
  select * into t from public.money_txns where id = p_id;
  if t.cheque_status = 'BOUNCED' then
    return;
  end if;

  if t.txn_type in ('RECEIPT', 'PAYMENT', 'LOAN_TAKEN', 'LOAN_REPAY', 'LOAN_GIVEN', 'LOAN_RECOVER') and t.party_id is null then
    raise exception 'Choose the party';
  end if;
  if t.txn_type in ('EXPENSE', 'INCOME', 'TRANSFER') and t.counter_account_id is null then
    raise exception 'Choose the account';
  end if;
  v_principal := t.amount - t.interest_amount;

  v_lines := case t.txn_type
    when 'RECEIPT' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount), public.jl_cr(public.system_account('RECEIVABLE'), t.amount, t.party_id))
    when 'PAYMENT' then jsonb_build_array(
      public.jl_dr(public.system_account('PAYABLE'), t.amount, t.party_id), public.jl_cr(t.money_account_id, t.amount))
    when 'EXPENSE' then jsonb_build_array(
      public.jl_dr(t.counter_account_id, t.amount), public.jl_cr(t.money_account_id, t.amount))
    when 'INCOME' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount), public.jl_cr(t.counter_account_id, t.amount))
    when 'TRANSFER' then jsonb_build_array(
      public.jl_dr(t.counter_account_id, t.amount), public.jl_cr(t.money_account_id, t.amount))
    when 'CAPITAL_IN' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount), public.jl_cr(public.system_account('CAPITAL'), t.amount))
    when 'DRAWING' then jsonb_build_array(
      public.jl_dr(public.system_account('DRAWINGS'), t.amount), public.jl_cr(t.money_account_id, t.amount))
    when 'LOAN_TAKEN' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount), public.jl_cr(public.system_account('LOAN_PAYABLE'), t.amount, t.party_id))
    when 'LOAN_REPAY' then jsonb_build_array(
      public.jl_dr(public.system_account('LOAN_PAYABLE'), v_principal, t.party_id),
      public.jl_dr(public.system_account('INTEREST_EXPENSE'), t.interest_amount, null, 'Interest'),
      public.jl_cr(t.money_account_id, t.amount))
    when 'LOAN_GIVEN' then jsonb_build_array(
      public.jl_dr(public.system_account('LOAN_RECEIVABLE'), t.amount, t.party_id), public.jl_cr(t.money_account_id, t.amount))
    when 'LOAN_RECOVER' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount),
      public.jl_cr(public.system_account('LOAN_RECEIVABLE'), v_principal, t.party_id),
      public.jl_cr(public.system_account('INTEREST_INCOME'), t.interest_amount, null, 'Interest'))
  end;

  v_label := initcap(replace(lower(t.txn_type), '_', ' ')) || ' ' || t.txn_no;
  perform public.post_journal(t.txn_date, 'MONEY', t.id, coalesce(nullif(t.notes, ''), v_label), v_lines);
end;
$$;

create or replace function public.settle_bills(p_id uuid, p_allocations jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.money_txns;
  v_left numeric;
  v_take numeric;
  a jsonb;
  r record;
begin
  select * into t from public.money_txns where id = p_id;
  delete from public.bill_settlements where money_txn_id = p_id;
  if t.txn_type not in ('RECEIPT', 'PAYMENT') or t.cheque_status = 'BOUNCED' then
    return;
  end if;

  -- money taken at a sale or purchase always settles that document
  if t.linked_sale_id is not null then
    insert into public.bill_settlements (money_txn_id, sale_id, amount) values (p_id, t.linked_sale_id, t.amount);
    return;
  end if;
  if t.linked_purchase_id is not null then
    insert into public.bill_settlements (money_txn_id, purchase_id, amount) values (p_id, t.linked_purchase_id, t.amount);
    return;
  end if;

  v_left := t.amount;
  if jsonb_typeof(p_allocations) = 'array' and jsonb_array_length(p_allocations) > 0 then
    for a in select * from jsonb_array_elements(p_allocations) loop
      v_take := least(coalesce(nullif(a->>'amount', '')::numeric, 0), v_left);
      continue when v_take <= 0;
      insert into public.bill_settlements (money_txn_id, sale_id, purchase_id, amount)
      values (p_id, nullif(a->>'sale_id', '')::uuid, nullif(a->>'purchase_id', '')::uuid, v_take);
      v_left := v_left - v_take;
    end loop;
    return;
  end if;

  if t.txn_type = 'RECEIPT' then
    for r in select id, due_amount from public.v_sale_dues
             where customer_id = t.party_id and due_amount > 0.005 order by sale_date, sale_no loop
      exit when v_left <= 0.005;
      v_take := least(r.due_amount, v_left);
      insert into public.bill_settlements (money_txn_id, sale_id, amount) values (p_id, r.id, v_take);
      v_left := v_left - v_take;
    end loop;
  else
    for r in select id, due_amount from public.v_purchase_dues
             where supplier_id = t.party_id and due_amount > 0.005 order by purchase_date, purchase_no loop
      exit when v_left <= 0.005;
      v_take := least(r.due_amount, v_left);
      insert into public.bill_settlements (money_txn_id, purchase_id, amount) values (p_id, r.id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;
end;
$$;

-- Receipt / payment made together with a sale or purchase
create or replace function public.create_linked_money_txn(
  p_type text, p_date date, p_party uuid, p_account uuid, p_amount numeric,
  p_method text, p_cheque_no text, p_cheque_date date, p_sale uuid, p_purchase uuid, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_account is null then
    raise exception 'Choose the cash or bank account';
  end if;
  insert into public.money_txns (txn_no, txn_date, txn_type, party_id, money_account_id, amount, method,
    cheque_no, cheque_date, cheque_status, notes, linked_sale_id, linked_purchase_id)
  values (public.next_doc_no(case p_type when 'RECEIPT' then 'RCV' else 'PAY' end, p_date), p_date, p_type, p_party,
    p_account, p_amount, coalesce(p_method, 'CASH'), p_cheque_no, p_cheque_date,
    case when p_method = 'CHEQUE' then 'PENDING' end, p_note, p_sale, p_purchase)
  returning id into v_id;
  perform public.post_money_txn(v_id);
  perform public.settle_bills(v_id, null);
  return v_id;
end;
$$;

create or replace function public.remove_linked_money_txns(p_sale uuid, p_purchase uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.money_txns
           where (p_sale is not null and linked_sale_id = p_sale) or (p_purchase is not null and linked_purchase_id = p_purchase) loop
    perform public.unpost_journal('MONEY', r.id);
    delete from public.money_txns where id = r.id;
  end loop;
end;
$$;

create or replace function public.save_money_txn(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'txn_date')::date;
  v_type text := p->>'txn_type';
  v_no text;
  v_method text := coalesce(nullif(p->>'method', ''), 'CASH');
  v_amount numeric := nullif(p->>'amount', '')::numeric;
  v_interest numeric := coalesce(nullif(p->>'interest_amount', '')::numeric, 0);
  v_link text;
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');

  if v_id is not null then
    select coalesce(s.sale_no, pu.purchase_no) into v_link
    from public.money_txns t
    left join public.sales s on s.id = t.linked_sale_id
    left join public.purchases pu on pu.id = t.linked_purchase_id
    where t.id = v_id and (t.linked_sale_id is not null or t.linked_purchase_id is not null);
    if v_link is not null then
      raise exception 'This was recorded with % — change it there', v_link;
    end if;
    perform public.unpost_journal('MONEY', v_id);
    select txn_no into v_no from public.money_txns where id = v_id;
  else
    v_id := gen_random_uuid();
    v_no := public.next_doc_no(case v_type
      when 'RECEIPT' then 'RCV' when 'PAYMENT' then 'PAY' when 'EXPENSE' then 'EXP' when 'INCOME' then 'INC'
      when 'TRANSFER' then 'TRN' when 'CAPITAL_IN' then 'CAP' when 'DRAWING' then 'DRW' else 'LON' end, v_date);
  end if;

  if v_type = 'TRANSFER' and p->>'counter_account_id' = p->>'money_account_id' then
    raise exception 'Choose two different accounts for a transfer';
  end if;
  if v_type not in ('LOAN_REPAY', 'LOAN_RECOVER') then
    v_interest := 0;
  elsif v_interest > coalesce(v_amount, 0) then
    raise exception 'Interest cannot be more than the amount';
  end if;

  insert into public.money_txns (id, txn_no, txn_date, txn_type, party_id, money_account_id, counter_account_id, amount,
    interest_amount, method, cheque_no, cheque_date, cheque_status, reference, notes)
  values (v_id, v_no, v_date, v_type, nullif(p->>'party_id', '')::uuid, (p->>'money_account_id')::uuid,
    nullif(p->>'counter_account_id', '')::uuid, v_amount, v_interest, v_method,
    p->>'cheque_no', nullif(p->>'cheque_date', '')::date,
    case when v_method = 'CHEQUE' then coalesce(nullif(p->>'cheque_status', ''), 'PENDING') end,
    p->>'reference', p->>'notes')
  on conflict (id) do update set
    txn_date = excluded.txn_date, txn_type = excluded.txn_type, party_id = excluded.party_id,
    money_account_id = excluded.money_account_id, counter_account_id = excluded.counter_account_id,
    amount = excluded.amount, interest_amount = excluded.interest_amount, method = excluded.method,
    cheque_no = excluded.cheque_no, cheque_date = excluded.cheque_date, cheque_status = excluded.cheque_status,
    reference = excluded.reference, notes = excluded.notes, updated_at = now();

  perform public.post_money_txn(v_id);
  perform public.settle_bills(v_id, p->'allocations');
  return v_id;
end;
$$;

create or replace function public.delete_money_txn(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  if exists (select 1 from public.money_txns where id = p_id and (linked_sale_id is not null or linked_purchase_id is not null)) then
    raise exception 'This was recorded with a sale or purchase — change it there';
  end if;
  perform public.unpost_journal('MONEY', p_id);
  delete from public.money_txns where id = p_id;
end;
$$;

------------------------------------------------------------------------------------------
-- Purchases
------------------------------------------------------------------------------------------
create or replace function public.post_purchase_journal(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.purchases;
  v_ap uuid := public.system_account('PAYABLE');
  v_extra numeric;
  v_lines jsonb;
begin
  select * into h from public.purchases where id = p_id;
  v_extra := h.transport_cost + h.labour_cost + h.other_cost;
  v_lines := jsonb_build_array(
    public.jl_dr(public.system_account('INVENTORY'), h.total_cost, null, 'Goods received'),
    public.jl_cr(v_ap, h.goods_amount - h.discount, h.supplier_id, 'Supplier bill')
  );
  if h.commission_amount > 0 then
    if h.broker_id is null then
      raise exception 'Choose the broker to pay commission to';
    end if;
    v_lines := v_lines || public.jl_cr(v_ap, h.commission_amount, h.broker_id, 'Broker commission');
  end if;
  if v_extra > 0 then
    v_lines := v_lines || case when h.costs_account_id is not null
      then public.jl_cr(h.costs_account_id, v_extra, null, 'Transport and labour')
      else public.jl_cr(v_ap, v_extra, h.supplier_id, 'Transport and labour') end;
  end if;
  perform public.post_journal(h.purchase_date, 'PURCHASE', h.id, 'Purchase ' || h.purchase_no, v_lines);
end;
$$;

create or replace function public.post_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.purchases;
  r public.purchase_lines;
  v_extra numeric;
  v_lot uuid;
  v_unit numeric;
begin
  select * into h from public.purchases where id = p_id;
  v_extra := h.transport_cost + h.labour_cost + h.other_cost + h.commission_amount;

  -- stock: spread extra costs and discount across lines by value
  for r in select * from public.purchase_lines where purchase_id = p_id order by line_no loop
    v_unit := case when r.net_kg > 0 then
      (r.amount + case when h.goods_amount > 0 then v_extra * r.amount / h.goods_amount else 0 end
                - case when h.goods_amount > 0 then h.discount * r.amount / h.goods_amount else 0 end) / r.net_kg
      else 0 end;
    v_lot := public.receive_stock(h.purchase_date, r.item_id, h.warehouse_id, r.net_kg, r.bags, r.bag_size_kg,
      v_unit, 'PURCHASE', h.id, r.id, null, h.purchase_no);
    update public.purchase_lines set lot_id = v_lot, unit_cost = round(v_unit, 6) where id = r.id;
  end loop;

  perform public.post_purchase_journal(p_id);

  if h.paid_amount > 0 then
    perform public.create_linked_money_txn('PAYMENT', h.purchase_date, h.supplier_id, h.paid_account_id, h.paid_amount,
      h.paid_method, h.paid_cheque_no, h.paid_cheque_date, null, h.id, 'Paid with ' || h.purchase_no);
  end if;
end;
$$;

create or replace function public.unpost_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.remove_linked_money_txns(null, p_id);
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
  v_other_paid numeric;
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
    discount, transport_cost, labour_cost, other_cost, costs_account_id, commission_amount, paid_amount, paid_account_id,
    paid_method, paid_cheque_no, paid_cheque_date)
  values (v_id, coalesce(v_no, public.next_doc_no('PUR', v_date)), v_date, (p->>'supplier_id')::uuid,
    nullif(p->>'broker_id', '')::uuid, (p->>'warehouse_id')::uuid, p->>'vehicle_no', p->>'reference', p->>'notes',
    coalesce(nullif(p->>'discount', '')::numeric, 0), coalesce(nullif(p->>'transport_cost', '')::numeric, 0),
    coalesce(nullif(p->>'labour_cost', '')::numeric, 0), coalesce(nullif(p->>'other_cost', '')::numeric, 0),
    nullif(p->>'costs_account_id', '')::uuid, coalesce(nullif(p->>'commission_amount', '')::numeric, 0),
    coalesce(nullif(p->>'paid_amount', '')::numeric, 0), nullif(p->>'paid_account_id', '')::uuid,
    coalesce(nullif(p->>'paid_method', ''), 'CASH'), nullif(p->>'paid_cheque_no', ''), nullif(p->>'paid_cheque_date', '')::date)
  on conflict (id) do update set
    purchase_date = excluded.purchase_date, supplier_id = excluded.supplier_id, broker_id = excluded.broker_id,
    warehouse_id = excluded.warehouse_id, vehicle_no = excluded.vehicle_no, reference = excluded.reference,
    notes = excluded.notes, discount = excluded.discount, transport_cost = excluded.transport_cost,
    labour_cost = excluded.labour_cost, other_cost = excluded.other_cost, costs_account_id = excluded.costs_account_id,
    commission_amount = excluded.commission_amount, paid_amount = excluded.paid_amount,
    paid_account_id = excluded.paid_account_id, paid_method = excluded.paid_method,
    paid_cheque_no = excluded.paid_cheque_no, paid_cheque_date = excluded.paid_cheque_date, updated_at = now();

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_i := v_i + 1;
    v_net := coalesce(nullif(l->>'gross_kg', '')::numeric, 0) - coalesce(nullif(l->>'deduction_kg', '')::numeric, 0);
    if v_net <= 0 then
      raise exception 'Line %: net weight must be greater than zero', v_i;
    end if;
    if coalesce(l->>'rate_unit', 'KG') = 'BAG' and coalesce(nullif(l->>'bags', '')::numeric, 0) <= 0 then
      raise exception 'Line %: enter the number of bags for a per-bag rate', v_i;
    end if;
    v_amount := public.line_amount(coalesce(l->>'rate_unit', 'KG'), nullif(l->>'rate', '')::numeric, v_net, nullif(l->>'bags', '')::numeric);
    insert into public.purchase_lines (purchase_id, line_no, item_id, bags, bag_size_kg, gross_kg, deduction_kg, net_kg,
      rate, rate_unit, amount)
    values (v_id, v_i, (l->>'item_id')::uuid, coalesce(nullif(l->>'bags', '')::numeric, 0), coalesce(nullif(l->>'bag_size_kg', '')::numeric, 0),
      nullif(l->>'gross_kg', '')::numeric, coalesce(nullif(l->>'deduction_kg', '')::numeric, 0), v_net,
      coalesce(nullif(l->>'rate', '')::numeric, 0), coalesce(l->>'rate_unit', 'KG'), v_amount);
    v_goods := v_goods + v_amount;
  end loop;

  update public.purchases set
    goods_amount = v_goods,
    supplier_total = v_goods - discount
      + case when costs_account_id is null then transport_cost + labour_cost + other_cost else 0 end,
    total_cost = v_goods - discount + transport_cost + labour_cost + other_cost + commission_amount
  where id = v_id
  returning * into h;

  if h.paid_amount > 0 and h.paid_account_id is null then
    raise exception 'Choose the cash or bank account the payment was made from';
  end if;
  -- already paid by separate payments or returns: the bill can't drop below that
  select coalesce((select sum(bs.amount) from public.bill_settlements bs join public.money_txns m on m.id = bs.money_txn_id
                   where bs.purchase_id = v_id and m.linked_purchase_id is distinct from v_id), 0)
       + coalesce((select sum(amount) from public.purchase_returns where purchase_id = v_id), 0)
  into v_other_paid;
  if h.supplier_total + 0.005 < v_other_paid + h.paid_amount then
    raise exception 'The supplier bill (%) is less than what has already been paid or returned against it (%)',
      h.supplier_total, v_other_paid + h.paid_amount;
  end if;

  perform public.post_purchase(v_id);
  return v_id;
end;
$$;

------------------------------------------------------------------------------------------
-- Sales
------------------------------------------------------------------------------------------
create or replace function public.post_sale_journal(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.sales;
  v_lines jsonb;
begin
  select * into h from public.sales where id = p_id;
  v_lines := jsonb_build_array(
    public.jl_dr(public.system_account('RECEIVABLE'), h.total_amount, h.customer_id, 'Sale'),
    public.jl_cr(public.system_account('SALES'), h.goods_amount - h.discount, null, 'Sales'),
    public.jl_cr(public.system_account('OTHER_INCOME'), h.transport_charge + h.labour_charge, null, 'Transport and labour charged'),
    public.jl_dr(public.system_account('COGS'), h.cost_amount, null, 'Cost of goods sold'),
    public.jl_cr(public.system_account('INVENTORY'), h.cost_amount, null, 'Goods issued')
  );
  if h.commission_amount > 0 then
    if h.broker_id is null then
      raise exception 'Choose the broker to pay commission to';
    end if;
    v_lines := v_lines
      || public.jl_dr(public.system_account('COMMISSION'), h.commission_amount, null, 'Broker commission')
      || public.jl_cr(public.system_account('PAYABLE'), h.commission_amount, h.broker_id, 'Broker commission');
  end if;
  perform public.post_journal(h.sale_date, 'SALE', h.id, 'Sale ' || h.sale_no, v_lines);
end;
$$;

create or replace function public.post_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  h public.sales;
  r public.sale_lines;
  v_cost numeric;
  v_total_cost numeric := 0;
begin
  select * into h from public.sales where id = p_id;

  for r in select * from public.sale_lines where sale_id = p_id order by line_no loop
    v_cost := public.consume_stock(h.sale_date, r.item_id, coalesce(r.warehouse_id, h.warehouse_id), r.qty_kg, r.bags,
      'SALE', h.id, r.id, r.lot_id,
      -- revenue for lot profit: line amount less its share of discount
      r.amount - case when h.goods_amount > 0 then h.discount * r.amount / h.goods_amount else 0 end,
      h.sale_no);
    update public.sale_lines set cost_amount = v_cost where id = r.id;
    v_total_cost := v_total_cost + v_cost;
  end loop;
  update public.sales set cost_amount = v_total_cost where id = p_id;

  perform public.post_sale_journal(p_id);

  if h.received_amount > 0 then
    perform public.create_linked_money_txn('RECEIPT', h.sale_date, h.customer_id, h.received_account_id, h.received_amount,
      h.received_method, h.received_cheque_no, h.received_cheque_date, h.id, null, 'Received with ' || h.sale_no);
  end if;
end;
$$;

create or replace function public.unpost_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.sale_returns where sale_id = p_id) then
    raise exception 'This sale has returns. Delete the returns first.';
  end if;
  perform public.remove_linked_money_txns(p_id, null);
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
  v_other_paid numeric;
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
    reference, notes, transport_charge, labour_charge, discount, commission_amount, received_amount, received_account_id,
    received_method, received_cheque_no, received_cheque_date)
  values (v_id, coalesce(v_no, public.next_doc_no('SAL', v_date)), v_date, (p->>'customer_id')::uuid,
    nullif(p->>'broker_id', '')::uuid, (p->>'warehouse_id')::uuid, p->>'vehicle_no', p->>'driver_name', p->>'driver_phone',
    p->>'reference', p->>'notes', coalesce(nullif(p->>'transport_charge', '')::numeric, 0), coalesce(nullif(p->>'labour_charge', '')::numeric, 0),
    coalesce(nullif(p->>'discount', '')::numeric, 0), coalesce(nullif(p->>'commission_amount', '')::numeric, 0),
    coalesce(nullif(p->>'received_amount', '')::numeric, 0), nullif(p->>'received_account_id', '')::uuid,
    coalesce(nullif(p->>'received_method', ''), 'CASH'), nullif(p->>'received_cheque_no', ''), nullif(p->>'received_cheque_date', '')::date)
  on conflict (id) do update set
    sale_date = excluded.sale_date, customer_id = excluded.customer_id, broker_id = excluded.broker_id,
    warehouse_id = excluded.warehouse_id, vehicle_no = excluded.vehicle_no, driver_name = excluded.driver_name,
    driver_phone = excluded.driver_phone, reference = excluded.reference, notes = excluded.notes,
    transport_charge = excluded.transport_charge, labour_charge = excluded.labour_charge, discount = excluded.discount,
    commission_amount = excluded.commission_amount, received_amount = excluded.received_amount,
    received_account_id = excluded.received_account_id, received_method = excluded.received_method,
    received_cheque_no = excluded.received_cheque_no, received_cheque_date = excluded.received_cheque_date, updated_at = now();

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
  -- already received by separate receipts or returned: the invoice can't drop below that
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
-- Dues ageing on the whole balance: what is still owed is made up of the newest increases
------------------------------------------------------------------------------------------
create or replace function public.report_ageing(p_as_of date)
returns table (party_id uuid, name text, name_bn text, phone text, credit_limit numeric, balance numeric,
  b0 numeric, b30 numeric, b60 numeric, b90 numeric)
language sql stable as $$
  with lines as (
    select l.id, l.party_id, l.debit, l.credit, e.entry_date
    from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
    where l.party_id is not null and e.entry_date <= p_as_of
  ),
  bal as (
    select party_id, sum(debit - credit) as balance from lines group by party_id having abs(sum(debit - credit)) > 0.005
  ),
  incr as (
    select ln.id, ln.party_id, ln.entry_date, b.balance,
      case when b.balance > 0 then ln.debit else ln.credit end as amt
    from lines ln join bal b on b.party_id = ln.party_id
  ),
  run as (
    select *, sum(amt) over (partition by party_id order by entry_date desc, id desc rows unbounded preceding) as cum
    from incr where amt > 0
  ),
  part as (
    select party_id, p_as_of - entry_date as age, greatest(least(amt, abs(balance) - (cum - amt)), 0) as unpaid from run
  )
  select p.id, p.name, p.name_bn, p.phone, p.credit_limit, b.balance,
    coalesce(sum(part.unpaid) filter (where part.age < 30), 0),
    coalesce(sum(part.unpaid) filter (where part.age >= 30 and part.age < 60), 0),
    coalesce(sum(part.unpaid) filter (where part.age >= 60 and part.age < 90), 0),
    coalesce(sum(part.unpaid) filter (where part.age >= 90), 0)
  from bal b
  join public.parties p on p.id = b.party_id
  left join part on part.party_id = b.party_id
  group by p.id, b.balance
  order by abs(b.balance) desc
$$;

------------------------------------------------------------------------------------------
-- Permissions for the new internal functions
------------------------------------------------------------------------------------------
revoke execute on function
  public.post_purchase_journal(uuid), public.post_sale_journal(uuid),
  public.create_linked_money_txn(text, date, uuid, uuid, numeric, text, text, date, uuid, uuid, text),
  public.remove_linked_money_txns(uuid, uuid)
from public, anon, authenticated;

------------------------------------------------------------------------------------------
-- Convert existing records: money taken at a sale / paid at a purchase becomes a linked voucher
------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select s.* from public.sales s
           where s.received_amount > 0 and not exists (select 1 from public.money_txns m where m.linked_sale_id = s.id) loop
    perform public.unpost_journal('SALE', r.id);
    perform public.post_sale_journal(r.id);
    perform public.create_linked_money_txn('RECEIPT', r.sale_date, r.customer_id, r.received_account_id, r.received_amount,
      (select case when subtype = 'BANK' then 'BANK' else 'CASH' end from public.accounts where id = r.received_account_id),
      null, null, r.id, null, 'Received with ' || r.sale_no);
  end loop;

  for r in select pu.* from public.purchases pu
           where pu.paid_amount > 0 and not exists (select 1 from public.money_txns m where m.linked_purchase_id = pu.id) loop
    perform public.unpost_journal('PURCHASE', r.id);
    perform public.post_purchase_journal(r.id);
    perform public.create_linked_money_txn('PAYMENT', r.purchase_date, r.supplier_id, r.paid_account_id, r.paid_amount,
      (select case when subtype = 'BANK' then 'BANK' else 'CASH' end from public.accounts where id = r.paid_account_id),
      null, null, null, r.id, 'Paid with ' || r.purchase_no);
  end loop;
end $$;
