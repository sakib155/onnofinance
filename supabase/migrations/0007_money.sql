-- 0007 Money: receipts, payments, expenses, other income, transfers, capital, drawings, loans
--
-- One table, one posting function. A bounced cheque has no accounting effect.
-- Receipts and payments are settled against open bills (sales / purchases): either the
-- bills the user picks, or automatically oldest first.

create table public.money_txns (
  id uuid primary key default gen_random_uuid(),
  txn_no text not null unique,
  txn_date date not null,
  -- RECEIPT, PAYMENT, EXPENSE, INCOME, TRANSFER, CAPITAL_IN, DRAWING,
  -- LOAN_TAKEN, LOAN_REPAY, LOAN_GIVEN, LOAN_RECOVER
  txn_type text not null check (txn_type in ('RECEIPT', 'PAYMENT', 'EXPENSE', 'INCOME', 'TRANSFER', 'CAPITAL_IN',
    'DRAWING', 'LOAN_TAKEN', 'LOAN_REPAY', 'LOAN_GIVEN', 'LOAN_RECOVER')),
  party_id uuid references public.parties(id),
  money_account_id uuid not null references public.accounts(id),   -- cash or bank
  counter_account_id uuid references public.accounts(id),          -- expense/income head, or transfer destination
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'CASH' check (method in ('CASH', 'BANK', 'CHEQUE')),
  cheque_no text,
  cheque_date date,
  cheque_status text check (cheque_status in ('PENDING', 'CLEARED', 'BOUNCED')),
  reference text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.money_txns (txn_date);
create index on public.money_txns (party_id);
create index on public.money_txns (txn_type);

-- Which bills a receipt/payment settled
create table public.bill_settlements (
  id bigint generated always as identity primary key,
  money_txn_id uuid not null references public.money_txns(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  constraint settlement_one_bill check ((sale_id is null) <> (purchase_id is null))
);

create index on public.bill_settlements (sale_id);
create index on public.bill_settlements (purchase_id);

-- Bill dues: total less paid at the time less later settlements less returns
create or replace view public.v_sale_dues with (security_invoker = true) as
select
  s.*, p.name as customer_name, p.name_bn as customer_name_bn,
  s.received_amount + coalesce(st.settled, 0) + coalesce(rt.returned, 0) as total_paid,
  s.total_amount - s.received_amount - coalesce(st.settled, 0) - coalesce(rt.returned, 0) as due_amount,
  current_date - s.sale_date as age_days
from public.sales s
join public.parties p on p.id = s.customer_id
left join (select sale_id, sum(amount) as settled from public.bill_settlements where sale_id is not null group by sale_id) st on st.sale_id = s.id
left join (select sale_id, sum(amount) as returned from public.sale_returns where sale_id is not null group by sale_id) rt on rt.sale_id = s.id;

create or replace view public.v_purchase_dues with (security_invoker = true) as
select
  pu.*, p.name as supplier_name, p.name_bn as supplier_name_bn, pu.supplier_total as total_amount,
  pu.paid_amount + coalesce(st.settled, 0) + coalesce(rt.returned, 0) as total_paid,
  pu.supplier_total - pu.paid_amount - coalesce(st.settled, 0) - coalesce(rt.returned, 0) as due_amount,
  current_date - pu.purchase_date as age_days
from public.purchases pu
join public.parties p on p.id = pu.supplier_id
left join (select purchase_id, sum(amount) as settled from public.bill_settlements where purchase_id is not null group by purchase_id) st on st.purchase_id = pu.id
left join (select purchase_id, sum(amount) as returned from public.purchase_returns where purchase_id is not null group by purchase_id) rt on rt.purchase_id = pu.id;

create or replace function public.post_money_txn(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.money_txns;
  v_lines jsonb;
  v_label text;
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
      public.jl_dr(public.system_account('LOAN_PAYABLE'), t.amount, t.party_id), public.jl_cr(t.money_account_id, t.amount))
    when 'LOAN_GIVEN' then jsonb_build_array(
      public.jl_dr(public.system_account('LOAN_RECEIVABLE'), t.amount, t.party_id), public.jl_cr(t.money_account_id, t.amount))
    when 'LOAN_RECOVER' then jsonb_build_array(
      public.jl_dr(t.money_account_id, t.amount), public.jl_cr(public.system_account('LOAN_RECEIVABLE'), t.amount, t.party_id))
  end;

  v_label := initcap(replace(lower(t.txn_type), '_', ' ')) || ' ' || t.txn_no;
  perform public.post_journal(t.txn_date, 'MONEY', t.id, coalesce(nullif(t.notes, ''), v_label), v_lines);
end;
$$;

-- Settle a receipt/payment against bills. p_allocations: [{sale_id|purchase_id, amount}] or null for oldest-first.
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
  v_left := t.amount;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for a in select * from jsonb_array_elements(p_allocations) loop
      v_take := least(coalesce((a->>'amount')::numeric, 0), v_left);
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

create or replace function public.save_money_txn(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := (p->>'txn_date')::date;
  v_type text := p->>'txn_type';
  v_no text;
  v_method text := coalesce(p->>'method', 'CASH');
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');

  if v_id is not null then
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

  insert into public.money_txns (id, txn_no, txn_date, txn_type, party_id, money_account_id, counter_account_id, amount,
    method, cheque_no, cheque_date, cheque_status, reference, notes)
  values (v_id, v_no, v_date, v_type, nullif(p->>'party_id', '')::uuid, (p->>'money_account_id')::uuid,
    nullif(p->>'counter_account_id', '')::uuid, (p->>'amount')::numeric, v_method,
    p->>'cheque_no', nullif(p->>'cheque_date', '')::date,
    case when v_method = 'CHEQUE' then coalesce(nullif(p->>'cheque_status', ''), 'PENDING') end,
    p->>'reference', p->>'notes')
  on conflict (id) do update set
    txn_date = excluded.txn_date, txn_type = excluded.txn_type, party_id = excluded.party_id,
    money_account_id = excluded.money_account_id, counter_account_id = excluded.counter_account_id,
    amount = excluded.amount, method = excluded.method, cheque_no = excluded.cheque_no,
    cheque_date = excluded.cheque_date, cheque_status = excluded.cheque_status,
    reference = excluded.reference, notes = excluded.notes, updated_at = now();

  perform public.post_money_txn(v_id);
  perform public.settle_bills(v_id, p->'allocations');
  return v_id;
end;
$$;

create or replace function public.set_cheque_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  update public.money_txns set cheque_status = p_status, updated_at = now() where id = p_id and method = 'CHEQUE';
  perform public.unpost_journal('MONEY', p_id);
  perform public.post_money_txn(p_id);
  perform public.settle_bills(p_id, null);
end;
$$;

create or replace function public.delete_money_txn(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role('ADMIN', 'ACCOUNTANT');
  perform public.unpost_journal('MONEY', p_id);
  delete from public.money_txns where id = p_id;
end;
$$;

create or replace view public.v_money_txns with (security_invoker = true) as
select
  t.*,
  m.name as money_account_name, m.subtype as money_account_subtype,
  c.name as counter_account_name,
  p.name as party_name
from public.money_txns t
join public.accounts m on m.id = t.money_account_id
left join public.accounts c on c.id = t.counter_account_id
left join public.parties p on p.id = t.party_id;
