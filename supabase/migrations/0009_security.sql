-- 0009 Security: row-level security, function permissions, audit triggers
--
-- Reading: any active signed-in user, except that OPERATOR cannot read the books (journal).
-- Writing master data: directly on the table, limited by role.
-- Writing documents (purchases, sales, money, production, stock): only through the save_*/delete_*
-- functions, which check the role themselves. The tables have no write policies at all.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'company_settings', 'doc_sequences', 'audit_log',
    'accounts', 'parties', 'items', 'warehouses',
    'journal_entries', 'journal_lines',
    'lots', 'stock_movements', 'lot_allocations', 'stock_transfers', 'stock_adjustments',
    'purchases', 'purchase_lines', 'sales', 'sale_lines', 'sale_returns', 'purchase_returns',
    'production_batches', 'production_inputs', 'production_stages', 'production_costs', 'production_outputs',
    'money_txns', 'bill_settlements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- read access for every active user
  foreach t in array array[
    'company_settings', 'accounts', 'parties', 'items', 'warehouses',
    'lots', 'stock_movements', 'lot_allocations', 'stock_transfers', 'stock_adjustments',
    'purchases', 'purchase_lines', 'sales', 'sale_lines', 'sale_returns', 'purchase_returns',
    'production_batches', 'production_inputs', 'production_stages', 'production_costs', 'production_outputs',
    'money_txns', 'bill_settlements'
  ] loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (public.app_role() is not null)', t);
  end loop;

  -- the books: not for operators
  foreach t in array array['journal_entries', 'journal_lines'] loop
    execute format($p$create policy "read %1$s" on public.%1$I for select to authenticated
      using (public.has_role('ADMIN', 'ACCOUNTANT', 'VIEWER'))$p$, t);
  end loop;
end $$;

-- Profiles: everyone sees the team list; only admins change roles
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() is not null);
create policy "admin updates profiles" on public.profiles for update to authenticated
  using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

create policy "admin reads audit" on public.audit_log for select to authenticated using (public.has_role('ADMIN'));

create policy "admin updates settings" on public.company_settings for update to authenticated
  using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- Master data
create policy "write accounts" on public.accounts for insert to authenticated with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "update accounts" on public.accounts for update to authenticated
  using (public.has_role('ADMIN', 'ACCOUNTANT')) with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "delete accounts" on public.accounts for delete to authenticated using (public.has_role('ADMIN') and not is_system);

create policy "write parties" on public.parties for insert to authenticated with check (public.has_role('ADMIN', 'ACCOUNTANT', 'OPERATOR'));
create policy "update parties" on public.parties for update to authenticated
  using (public.has_role('ADMIN', 'ACCOUNTANT', 'OPERATOR')) with check (public.has_role('ADMIN', 'ACCOUNTANT', 'OPERATOR'));
create policy "delete parties" on public.parties for delete to authenticated using (public.has_role('ADMIN'));

create policy "write items" on public.items for insert to authenticated with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "update items" on public.items for update to authenticated
  using (public.has_role('ADMIN', 'ACCOUNTANT')) with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "delete items" on public.items for delete to authenticated using (public.has_role('ADMIN'));

create policy "write warehouses" on public.warehouses for insert to authenticated with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "update warehouses" on public.warehouses for update to authenticated
  using (public.has_role('ADMIN', 'ACCOUNTANT')) with check (public.has_role('ADMIN', 'ACCOUNTANT'));
create policy "delete warehouses" on public.warehouses for delete to authenticated using (public.has_role('ADMIN'));

-- Internal functions: not callable from the app. Only the role-checked save/delete functions use them.
revoke execute on function
  public.handle_new_user(), public.next_doc_no(text, date), public.audit_row(),
  public.post_journal(date, text, uuid, text, jsonb), public.unpost_journal(text, uuid),
  public.post_party_opening(), public.post_account_opening(),
  public.receive_stock(date, uuid, uuid, numeric, numeric, numeric, numeric, text, uuid, uuid, uuid, text),
  public.consume_stock(date, uuid, uuid, numeric, numeric, text, uuid, uuid, uuid, numeric, text),
  public.unpost_stock(text, uuid),
  public.post_purchase(uuid), public.unpost_purchase(uuid),
  public.post_sale(uuid), public.unpost_sale(uuid),
  public.post_money_txn(uuid), public.settle_bills(uuid, jsonb),
  public.require_open_batch(uuid)
from public, anon, authenticated;

-- Callable document functions: signed-in users only (each checks the role itself)
revoke execute on function
  public.save_purchase(jsonb), public.delete_purchase(uuid),
  public.save_sale(jsonb), public.delete_sale(uuid),
  public.save_sale_return(jsonb), public.delete_sale_return(uuid),
  public.save_purchase_return(jsonb), public.delete_purchase_return(uuid),
  public.save_stock_transfer(jsonb), public.delete_stock_transfer(uuid),
  public.save_stock_adjustment(jsonb), public.delete_stock_adjustment(uuid),
  public.save_production_batch(jsonb), public.save_production_stage(jsonb),
  public.save_production_cost(jsonb), public.delete_production_cost(uuid),
  public.complete_production_batch(jsonb), public.reopen_production_batch(uuid), public.delete_production_batch(uuid),
  public.save_money_txn(jsonb), public.set_cheque_status(uuid, text), public.delete_money_txn(uuid)
from public, anon;
grant execute on function
  public.save_purchase(jsonb), public.delete_purchase(uuid),
  public.save_sale(jsonb), public.delete_sale(uuid),
  public.save_sale_return(jsonb), public.delete_sale_return(uuid),
  public.save_purchase_return(jsonb), public.delete_purchase_return(uuid),
  public.save_stock_transfer(jsonb), public.delete_stock_transfer(uuid),
  public.save_stock_adjustment(jsonb), public.delete_stock_adjustment(uuid),
  public.save_production_batch(jsonb), public.save_production_stage(jsonb),
  public.save_production_cost(jsonb), public.delete_production_cost(uuid),
  public.complete_production_batch(jsonb), public.reopen_production_batch(uuid), public.delete_production_batch(uuid),
  public.save_money_txn(jsonb), public.set_cheque_status(uuid, text), public.delete_money_txn(uuid)
to authenticated;

-- Audit trail
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'company_settings', 'accounts', 'parties', 'items', 'warehouses',
    'purchases', 'sales', 'sale_returns', 'purchase_returns', 'money_txns',
    'production_batches', 'production_costs', 'stock_transfers', 'stock_adjustments'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
      for each row execute function public.audit_row()', t);
  end loop;
end $$;
