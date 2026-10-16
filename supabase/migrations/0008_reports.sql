-- 0008 Reports. These run with the caller's rights, so row-level security decides who can see them.

-- Ledger for one account (cash book, bank book, any account) or one party, with running balance.
-- Exactly one of p_account / p_party should be given.
create or replace function public.report_ledger(p_account uuid, p_party uuid, p_from date, p_to date)
returns table (
  row_no bigint, entry_date date, entry_id uuid, source_type text, source_id uuid,
  narration text, memo text, account_name text, party_name text,
  debit numeric, credit numeric, balance numeric
) language sql stable as $$
  with base as (
    select l.*, e.entry_date, e.source_type, e.source_id, e.narration, e.created_at
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    where (p_account is null or l.account_id = p_account)
      and (p_party is null or l.party_id = p_party)
  ),
  opening as (
    select coalesce(sum(debit - credit), 0) as bal from base where entry_date < p_from
  ),
  period as (
    select b.*, row_number() over (order by b.entry_date, b.created_at, b.id) as rn
    from base b where b.entry_date between p_from and p_to
  )
  select 0::bigint, p_from, null::uuid, 'OPENING', null::uuid, 'Opening balance', null, null, null,
    null::numeric, null::numeric, (select bal from opening)
  union all
  select p.rn, p.entry_date, p.entry_id, p.source_type, p.source_id, p.narration, p.memo,
    a.name, pa.name, p.debit, p.credit,
    (select bal from opening) + sum(p.debit - p.credit) over (order by p.rn)
  from period p
  join public.accounts a on a.id = p.account_id
  left join public.parties pa on pa.id = p.party_id
  order by 1
$$;

create or replace function public.report_trial_balance(p_to date)
returns table (account_id uuid, code text, name text, type public.account_type, subtype text, debit numeric, credit numeric)
language sql stable as $$
  select a.id, a.code, a.name, a.type, a.subtype,
    greatest(sum(l.debit - l.credit), 0), greatest(sum(l.credit - l.debit), 0)
  from public.accounts a
  join public.journal_lines l on l.account_id = a.id
  join public.journal_entries e on e.id = l.entry_id and e.entry_date <= p_to
  group by a.id
  having sum(l.debit - l.credit) <> 0
  order by a.code
$$;

-- Profit & loss: income shown positive, expenses positive
create or replace function public.report_profit_loss(p_from date, p_to date)
returns table (account_id uuid, code text, name text, type public.account_type, subtype text, amount numeric)
language sql stable as $$
  select a.id, a.code, a.name, a.type, a.subtype,
    case when a.type = 'INCOME' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end
  from public.accounts a
  join public.journal_lines l on l.account_id = a.id
  join public.journal_entries e on e.id = l.entry_id and e.entry_date between p_from and p_to
  where a.type in ('INCOME', 'EXPENSE')
  group by a.id
  having sum(l.debit - l.credit) <> 0
  order by a.type desc, a.code
$$;

-- Balance sheet: assets positive, liabilities and equity positive; profit to date shown as one equity line
create or replace function public.report_balance_sheet(p_to date)
returns table (section text, account_id uuid, code text, name text, subtype text, amount numeric)
language sql stable as $$
  with bal as (
    select a.id, a.code, a.name, a.type, a.subtype, sum(l.debit - l.credit) as dr
    from public.accounts a
    join public.journal_lines l on l.account_id = a.id
    join public.journal_entries e on e.id = l.entry_id and e.entry_date <= p_to
    group by a.id
  )
  select type::text, id, code, name, subtype, case when type = 'ASSET' then dr else -dr end
  from bal where type in ('ASSET', 'LIABILITY', 'EQUITY') and dr <> 0
  union all
  select 'EQUITY', null, '3999', 'Profit / loss to date', 'PROFIT', coalesce(-sum(dr), 0)
  from bal where type in ('INCOME', 'EXPENSE')
  order by 1, 3
$$;

-- Day / period cash summary across all cash and bank accounts
create or replace function public.report_cash_summary(p_from date, p_to date)
returns table (account_id uuid, name text, subtype text, opening numeric, money_in numeric, money_out numeric, closing numeric)
language sql stable as $$
  select a.id, a.name, a.subtype,
    coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0),
    coalesce(sum(l.debit) filter (where e.entry_date between p_from and p_to), 0),
    coalesce(sum(l.credit) filter (where e.entry_date between p_from and p_to), 0),
    coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0)
  from public.accounts a
  left join public.journal_lines l on l.account_id = a.id
  left join public.journal_entries e on e.id = l.entry_id
  where a.subtype in ('CASH', 'BANK') and a.is_active
  group by a.id
  order by a.subtype desc, a.code
$$;

-- Lot profit: each purchased or produced lot, following transfers to its child lots
create or replace view public.v_lot_profit with (security_invoker = true) as
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
    sum(a.qty_kg) filter (where a.source_type = 'PRODUCTION_INPUT') as milled_kg,
    sum(a.qty_kg) filter (where a.source_type in ('ADJUSTMENT', 'PURCHASE_RETURN')) as other_out_kg
  from tree t join public.lot_allocations a on a.lot_id = t.lot_id
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
  l.qty_kg, l.unit_cost, round(l.qty_kg * l.unit_cost, 2) as total_cost,
  coalesce(a.sold_kg, 0) as sold_kg, coalesce(a.revenue, 0) as revenue, coalesce(a.cost_of_sold, 0) as cost_of_sold,
  coalesce(a.revenue, 0) - coalesce(a.cost_of_sold, 0) as profit,
  case when coalesce(a.revenue, 0) > 0 then round(100 * (a.revenue - a.cost_of_sold) / a.revenue, 2) end as margin_pct,
  coalesce(a.milled_kg, 0) as milled_kg, coalesce(a.other_out_kg, 0) as other_out_kg,
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

-- Dashboard figures
create or replace function public.dashboard_stats(p_from date, p_to date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cash', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.accounts a on a.id = l.account_id where a.subtype = 'CASH'),
    'bank', (select coalesce(sum(l.debit - l.credit), 0) from public.journal_lines l join public.accounts a on a.id = l.account_id where a.subtype = 'BANK'),
    'receivable', (select coalesce(sum(balance), 0) from public.v_party_balances where balance > 0),
    'payable', (select coalesce(-sum(balance), 0) from public.v_party_balances where balance < 0),
    'stock_value', (select coalesce(sum(remaining_kg * unit_cost), 0) from public.lots where remaining_kg > 0),
    'paddy_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'PADDY'),
    'rice_kg', (select coalesce(sum(l.remaining_kg), 0) from public.lots l join public.items i on i.id = l.item_id where i.category = 'RICE'),
    'open_batches', (select count(*) from public.production_batches where status in ('SOAKING', 'DRYING', 'MILLING')),
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
