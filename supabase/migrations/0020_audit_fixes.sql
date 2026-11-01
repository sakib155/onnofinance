-- 0020 Fixes from the code audit.
--   * A picked lot must be the line's item and godown; before, any lot was taken as given.
--   * "Today" on the server is Dhaka's day, not UTC's (bill ages, overdue orders, cheques due).
--   * A hand-typed split of a receipt or payment only settles that party's own bills, each up to
--     what it still owes; before, any bill and any amount up to the receipt was accepted.
--   * schema_version() tells the app which migration the database has, so a missed one shows up.
--   * Section figures and each item's last price change come from the database, so the screens
--     stay right past the 1000 rows the server sends at a time.
-- Safe to run again.

-- 1. Picked lot: same item and godown as the line, else "Not enough stock"
do $$
declare
  v_def text;
  v_find text := '(case when p_lot is not null then id = p_lot else item_id = p_item and warehouse_id = p_warehouse end)';
begin
  select pg_get_functiondef('public.consume_stock(date, uuid, uuid, numeric, numeric, text, uuid, uuid, uuid, numeric, text)'::regprocedure)
  into v_def;
  if position(v_find in v_def) > 0 then
    execute replace(v_def, v_find, 'item_id = p_item and warehouse_id = p_warehouse and (p_lot is null or id = p_lot)');
  elsif position('(p_lot is null or id = p_lot)' in v_def) = 0 then
    raise exception 'consume_stock does not look as expected';
  end if;
end $$;

-- 2. current_date and dates from now() follow Dhaka in every new connection
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Asia/Dhaka');
end $$;
set timezone to 'Asia/Dhaka';

-- 3. Bill splits typed by hand: only the party's bills, capped at what each still owes.
--    Same as 0012 except the allocation loop.
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
      -- only this party's own bills, and no more than each one still owes
      if t.txn_type = 'RECEIPT' then
        select id as sale_id, null::uuid as purchase_id, due_amount into r from public.v_sale_dues
        where id = nullif(a->>'sale_id', '')::uuid and customer_id = t.party_id;
      else
        select null::uuid as sale_id, id as purchase_id, due_amount into r from public.v_purchase_dues
        where id = nullif(a->>'purchase_id', '')::uuid and supplier_id = t.party_id;
      end if;
      continue when not found;
      v_take := least(coalesce(nullif(a->>'amount', '')::numeric, 0), v_left, r.due_amount);
      continue when v_take <= 0;
      insert into public.bill_settlements (money_txn_id, sale_id, purchase_id, amount)
      values (p_id, r.sale_id, r.purchase_id, v_take);
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

-- 4. Per section: running and completed batches, and the averages of completed ones.
--    A function, not a view, so later migrations can still drop and remake v_production_batches.
create or replace function public.section_stats(p_kind text)
returns table (running bigint, running_kg numeric, completed bigint, completed_kg numeric,
               avg_yield_pct numeric, avg_cost_per_kg numeric, avg_minutes numeric)
language sql stable as $$
  select count(*) filter (where status = 'RUNNING'),
    coalesce(sum(input_kg) filter (where status = 'RUNNING'), 0),
    count(*) filter (where status = 'COMPLETED'),
    coalesce(sum(main_kg) filter (where status = 'COMPLETED'), 0),
    avg(main_yield_pct) filter (where status = 'COMPLETED'),
    avg(main_cost_per_kg) filter (where status = 'COMPLETED'),
    avg(minutes_taken) filter (where status = 'COMPLETED')
  from public.v_production_batches where kind = p_kind
$$;
grant execute on function public.section_stats(text) to authenticated;

-- 5. When each item's current price last changed
create or replace view public.v_item_price_changed with (security_invoker = true) as
select item_id, max(changed_at) as changed_at from public.item_price_history group by item_id;

grant select on public.v_item_price_changed to authenticated;

-- 6. Which migration this database is on. Each new migration raises the number.
create or replace function public.schema_version()
returns int language sql immutable as $$ select 20 $$;
grant execute on function public.schema_version() to authenticated;
