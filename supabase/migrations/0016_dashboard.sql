-- 0016 Dashboard: more figures for the redesigned dashboard. Same function, the earlier keys are kept.
--   stock      kg and value per item category (paddy -> unsorted -> sorted rice, by-products)
--   sections   per mill section: running batches, batches finished in the period, kg in/out, yield, cost per kg
--   gross_profit, sales_kg, received, paid   for the period
--   cheques    pending cheques in and out, and those due within a week
--   trend      6 months of sales, purchases and gross profit
--   recent     the latest documents of every kind

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
    'sales_count', (select count(*) from public.sales where sale_date between p_from and p_to),
    'sales_kg', (select coalesce(sum(sl.qty_kg), 0) from public.sale_lines sl join public.sales s on s.id = sl.sale_id where s.sale_date between p_from and p_to),
    'gross_profit', (select coalesce(sum(goods_amount - discount - cost_amount), 0) from public.sales where sale_date between p_from and p_to),
    'purchases', (select coalesce(sum(total_cost), 0) from public.purchases where purchase_date between p_from and p_to),
    'purchases_count', (select count(*) from public.purchases where purchase_date between p_from and p_to),
    'expenses', (select coalesce(sum(amount), 0) from public.money_txns where txn_type = 'EXPENSE' and txn_date between p_from and p_to and coalesce(cheque_status, '') <> 'BOUNCED'),
    'received', (select coalesce(sum(amount), 0) from public.money_txns where txn_type = 'RECEIPT' and txn_date between p_from and p_to and coalesce(cheque_status, '') <> 'BOUNCED'),
    'paid', (select coalesce(sum(amount), 0) from public.money_txns where txn_type = 'PAYMENT' and txn_date between p_from and p_to and coalesce(cheque_status, '') <> 'BOUNCED'),
    'profit', (select coalesce(sum(case when type = 'INCOME' then amount else -amount end), 0) from public.report_profit_loss(p_from, p_to)),
    'pending_cheques', (select count(*) from public.money_txns where cheque_status = 'PENDING'),
    'cheques', (
      select jsonb_build_object(
        'in_count', count(*) filter (where txn_type in ('RECEIPT', 'INCOME', 'CAPITAL_IN', 'LOAN_TAKEN', 'LOAN_RECOVER')),
        'in_amount', coalesce(sum(amount) filter (where txn_type in ('RECEIPT', 'INCOME', 'CAPITAL_IN', 'LOAN_TAKEN', 'LOAN_RECOVER')), 0),
        'out_count', count(*) filter (where txn_type not in ('RECEIPT', 'INCOME', 'CAPITAL_IN', 'LOAN_TAKEN', 'LOAN_RECOVER')),
        'out_amount', coalesce(sum(amount) filter (where txn_type not in ('RECEIPT', 'INCOME', 'CAPITAL_IN', 'LOAN_TAKEN', 'LOAN_RECOVER')), 0),
        'due_week', count(*) filter (where coalesce(cheque_date, txn_date) <= current_date + 7),
        'overdue', count(*) filter (where coalesce(cheque_date, txn_date) < current_date)
      )
      from public.money_txns where cheque_status = 'PENDING'
    ),
    'stock', (
      select coalesce(jsonb_agg(jsonb_build_object('category', c.category, 'kg', coalesce(x.kg, 0), 'value', coalesce(x.value, 0)) order by c.ord), '[]'::jsonb)
      from (values ('PADDY', 1), ('UNSORTED', 2), ('RICE', 3), ('BYPRODUCT', 4)) c(category, ord)
      left join (
        select i.category, sum(l.remaining_kg) as kg, sum(l.remaining_kg * l.unit_cost) as value
        from public.lots l join public.items i on i.id = l.item_id where l.remaining_kg > 0 group by i.category
      ) x on x.category = c.category
    ),
    'sections', (
      select coalesce(jsonb_object_agg(x.kind, to_jsonb(x) - 'kind'), '{}'::jsonb)
      from (
        select k.kind,
          (select count(*) from public.production_batches b where b.kind = k.kind and b.status = 'RUNNING') as running,
          (select coalesce(sum(b.input_kg), 0) from public.production_batches b where b.kind = k.kind and b.status = 'RUNNING') as running_kg,
          count(v.id) as completed,
          coalesce(sum(v.input_kg), 0) as material_kg,
          coalesce(sum(v.main_kg), 0) as main_kg,
          coalesce(sum(v.byproduct_kg), 0) as byproduct_kg,
          case when sum(v.input_kg) > 0 then round(100 * sum(v.main_kg) / sum(v.input_kg), 1) end as yield_pct,
          case when sum(v.main_kg) > 0 then round(sum(v.main_cost) / sum(v.main_kg), 2) end as cost_per_kg
        from (values ('DRYER'), ('SORTER')) k(kind)
        left join public.v_production_batches v on v.kind = k.kind and v.status = 'COMPLETED'
          and v.completed_date between p_from and p_to
        group by k.kind
      ) x
    ),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'sales', s, 'purchases', pu, 'gross_profit', gp) order by m), '[]'::jsonb)
      from (
        select m,
          (select coalesce(sum(total_amount), 0) from public.sales where date_trunc('month', sale_date) = m) as s,
          (select coalesce(sum(total_cost), 0) from public.purchases where date_trunc('month', purchase_date) = m) as pu,
          (select coalesce(sum(goods_amount - discount - cost_amount), 0) from public.sales where date_trunc('month', sale_date) = m) as gp
        from generate_series(date_trunc('month', p_to::timestamp) - interval '5 months', date_trunc('month', p_to::timestamp), interval '1 month') m
      ) x
    ),
    'recent', (
      select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
      from (
        select * from (
          select 'SALE' as kind, s.id, s.sale_no as doc_no, s.sale_date as doc_date, p.name as party, s.total_amount as amount, s.created_at
          from public.sales s join public.parties p on p.id = s.customer_id order by s.created_at desc limit 8
        ) a
        union all
        select * from (
          select 'PURCHASE', pu.id, pu.purchase_no, pu.purchase_date, p.name, pu.total_cost, pu.created_at
          from public.purchases pu join public.parties p on p.id = pu.supplier_id order by pu.created_at desc limit 8
        ) b
        union all
        select * from (
          select 'MONEY:' || m.txn_type, m.id, m.txn_no, m.txn_date, p.name, m.amount, m.created_at
          from public.money_txns m left join public.parties p on p.id = m.party_id
          where m.linked_sale_id is null and m.linked_purchase_id is null
          order by m.created_at desc limit 8
        ) c
        union all
        select * from (
          select 'BATCH:' || b.kind, b.id, b.batch_no, b.start_date, null::text, b.input_kg, b.created_at
          from public.production_batches b order by b.created_at desc limit 8
        ) d
        union all
        select * from (
          select 'ORDER', o.id, o.order_no, o.order_date, p.name, o.goods_amount, o.created_at
          from public.sales_orders o join public.parties p on p.id = o.customer_id order by o.created_at desc limit 8
        ) e
        order by created_at desc
        limit 10
      ) r
    )
  )
$$;
