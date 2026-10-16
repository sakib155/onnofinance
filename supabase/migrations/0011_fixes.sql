-- 0011 Fixes found while testing against a live project. Safe to run more than once.

-- Bill allocations sent as JSON null (rather than left out) meant "settle oldest first",
-- but jsonb_array_length failed on the null. Treat anything that isn't an array as "none".
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

revoke execute on function public.settle_bills(uuid, jsonb) from public, anon, authenticated;
