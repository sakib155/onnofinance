-- =========================================================================
-- RICE MILL FINANCE SCHEMA MIGRATION (FIXED ORDER)
-- =========================================================================
-- Copy and run this script in your Supabase SQL Editor.
-- =========================================================================

-- 1) Create public.products (Inventory) if it does not exist
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  unit text not null default 'Bag (50kg)',
  unit_price numeric(12,2) not null default 0, -- default selling rate
  cost_price numeric(12,2) not null default 0, -- default purchase rate
  current_stock numeric(12,3) not null default 0,
  created_by uuid, -- referenced to profiles later or kept as uuid
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_name on public.products(name);

-- 2) Create public.stock_transactions if it does not exist
create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  change_amount numeric(12,3) not null, -- positive for ADD (purchase), negative for DEDUCT (sale)
  transaction_type text not null, -- 'PURCHASE', 'SALE', 'ADJUSTMENT'
  reference text,     -- invoice_no or purchase_bill_no
  reference_id uuid,  -- e.g., invoice_id
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_trans_prod_id on public.stock_transactions(product_id);

-- 3) Ensure profiles foreign keys on products and stock transactions if profiles table exists
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') then
    alter table public.products drop constraint if exists products_created_by_fkey;
    alter table public.products add constraint products_created_by_fkey foreign key (created_by) references public.profiles(id);
    
    alter table public.stock_transactions drop constraint if exists stock_transactions_created_by_fkey;
    alter table public.stock_transactions add constraint stock_transactions_created_by_fkey foreign key (created_by) references public.profiles(id);
  end if;
end $$;

-- 4) Add Columns to public.invoices (Transport, Labor & Commission details)
alter table public.invoices 
  add column if not exists truck_no text,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists challan_no text,
  add column if not exists gate_pass_no text,
  add column if not exists labor_charge numeric(12,2) default 0,
  add column if not exists transport_cost numeric(12,2) default 0,
  add column if not exists commission numeric(12,2) default 0,
  add column if not exists broker_name text;

-- 5) Add Columns to public.invoice_items (Bags, Weights & Multi-Rate Types)
alter table public.invoice_items
  add column if not exists bags int default 0,
  add column if not exists bag_weight numeric(6,2) default 50,
  add column if not exists rate_type text default 'PER_BAG', -- 'PER_BAG', 'PER_KG', 'PER_MAUND'
  add column if not exists gross_weight numeric(12,3) default 0,
  add column if not exists product_id uuid references public.products(id) on delete set null;

-- 6) Create public.suppliers Table
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  opening_due numeric(12,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_suppliers_company_name on public.suppliers(company_name);

-- 7) Create public.paddy_purchases Table
create table if not exists public.paddy_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_date date not null default current_date,
  product_id uuid not null references public.products(id) on delete restrict,
  bags int not null default 0 check (bags > 0),
  bag_weight numeric(6,2) not null default 60, -- Paddy bags are typically 60kg, 75kg, 84kg
  total_weight numeric(12,3) not null default 0, -- Total Net Weight in KG
  rate numeric(12,2) not null default 0, -- Price based on rate_type
  rate_type text not null default 'PER_MAUND', -- 'PER_MAUND', 'PER_KG', 'PER_BAG'
  subtotal numeric(12,2) not null default 0,
  carrying_cost numeric(12,2) not null default 0,
  labor_charge numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_paddy_purchases_supplier on public.paddy_purchases(supplier_id);
create index if not exists idx_paddy_purchases_date on public.paddy_purchases(purchase_date);

-- 8) Create public.supplier_payments Table
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method text not null, -- Cash, Bank, MFS
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);

-- 9) Create public.milling_logs Table
create table if not exists public.milling_logs (
  id uuid primary key default gen_random_uuid(),
  milling_date date not null default current_date,
  paddy_product_id uuid not null references public.products(id) on delete restrict,
  paddy_bags_used int not null default 0 check (paddy_bags_used > 0),
  paddy_weight_used numeric(12,3) not null default 0,
  rice_product_id uuid not null references public.products(id) on delete restrict,
  rice_bags_produced int not null default 0 check (rice_bags_produced >= 0),
  rice_weight_produced numeric(12,3) not null default 0,
  byproduct_bran_bags int not null default 0,
  byproduct_husk_bags int not null default 0,
  labor_charge numeric(12,2) not null default 0,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_milling_logs_date on public.milling_logs(milling_date);

-- Link references to profiles if profiles table exists
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') then
    alter table public.suppliers drop constraint if exists suppliers_created_by_fkey;
    alter table public.suppliers add constraint suppliers_created_by_fkey foreign key (created_by) references public.profiles(id);
    
    alter table public.paddy_purchases drop constraint if exists paddy_purchases_created_by_fkey;
    alter table public.paddy_purchases add constraint paddy_purchases_created_by_fkey foreign key (created_by) references public.profiles(id);
    
    alter table public.supplier_payments drop constraint if exists supplier_payments_created_by_fkey;
    alter table public.supplier_payments add constraint supplier_payments_created_by_fkey foreign key (created_by) references public.profiles(id);
    
    alter table public.milling_logs drop constraint if exists milling_logs_created_by_fkey;
    alter table public.milling_logs add constraint milling_logs_created_by_fkey foreign key (created_by) references public.profiles(id);
  end if;
end $$;


-- =========================================================================
-- SCHEMA LOGIC, TRIGGERS & FUNCTIONS
-- =========================================================================

-- A) Function: Get Supplier Balance (opening_due + purchases - payments)
create or replace function public.get_supplier_balance(p_supplier_id uuid)
returns numeric
language plpgsql
security definer
as $$
declare
  v_opening numeric(12,2);
  v_purchases numeric(12,2);
  v_payments numeric(12,2);
begin
  select opening_due into v_opening from public.suppliers where id = p_supplier_id;

  select coalesce(sum(total_amount),0)
    into v_purchases
  from public.paddy_purchases
  where supplier_id = p_supplier_id;

  select coalesce(sum(amount),0)
    into v_payments
  from public.supplier_payments
  where supplier_id = p_supplier_id;

  return coalesce(v_opening,0) + v_purchases - v_payments;
end;
$$;

-- B) View: Supplier Outstanding Dues
create or replace view public.v_supplier_due as
select
  s.id as supplier_id,
  s.company_name,
  s.phone,
  (public.get_supplier_balance(s.id)) as current_due
from public.suppliers s;

-- C) Update Invoice Item Trigger to support multi-rate calculations
create or replace function public.invoice_item_amount()
returns trigger language plpgsql as $$
begin
  -- Deduce net weight from bag weight and counts
  if coalesce(new.bags, 0) > 0 and coalesce(new.bag_weight, 0) > 0 then
    new.gross_weight := new.bags * new.bag_weight;
    new.quantity := new.gross_weight;
  end if;

  -- Recalc amount based on rate type
  if new.rate_type = 'PER_BAG' then
    new.amount := round(coalesce(new.bags, 0) * coalesce(new.rate, 0), 2);
  elsif new.rate_type = 'PER_MAUND' then
    new.amount := round((coalesce(new.quantity, 0) / 40.0) * coalesce(new.rate, 0), 2);
  else -- PER_KG
    new.amount := round(coalesce(new.quantity, 0) * coalesce(new.rate, 0), 2);
  end if;

  return new;
end;
$$;

-- D) Override recalc_invoice to include labor_charge, transport_cost, commission
create or replace function public.recalc_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_subtotal numeric(12,2);
  v_paid numeric(12,2);
  v_total numeric(12,2);
  v_due numeric(12,2);
  v_due_date date;
  v_status public.invoice_status;
  
  v_labor numeric(12,2);
  v_transport numeric(12,2);
  v_commission numeric(12,2);
begin
  select coalesce(sum(amount),0) into v_subtotal
  from public.invoice_items where invoice_id = p_invoice_id;

  select coalesce(sum(amount),0) into v_paid
  from public.payments where invoice_id = p_invoice_id;

  select coalesce(labor_charge,0), coalesce(transport_cost,0), coalesce(commission,0), due_date
  into v_labor, v_transport, v_commission, v_due_date
  from public.invoices where id = p_invoice_id;

  -- Rice Mill sales invoice total: subtotal of products + labor_charge + transport_cost - commission
  v_total := v_subtotal + v_labor + v_transport - v_commission;
  v_due := greatest(v_total - v_paid, 0);

  if v_total = 0 and v_paid = 0 then
    v_status := 'DRAFT';
  elsif v_due = 0 then
    v_status := 'PAID';
  elsif v_paid > 0 and v_due > 0 then
    v_status := 'PARTIAL';
  else
    v_status := 'UNPAID';
  end if;

  if v_due > 0 and v_due_date < current_date then
    v_status := 'OVERDUE';
  end if;

  update public.invoices
     set subtotal = v_subtotal,
          invoice_total = v_total,
          paid_total = v_paid,
          balance_due = v_due,
          status = case when status='DRAFT' and v_total>0 then v_status else v_status end,
          is_locked = (v_paid > 0),
          updated_at = now()
   where id = p_invoice_id;
end;
$$;

-- E) Trigger for stock increase on Paddy Purchases
create or replace function public.after_paddy_purchase_insert()
returns trigger language plpgsql security definer as $$
begin
  -- Increase product current_stock (for raw paddy)
  update public.products
  set current_stock = current_stock + new.bags
  where id = new.product_id;

  -- Record stock transaction
  insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
  values (new.product_id, new.bags, 'PURCHASE', 'Paddy Purchase #' || new.id, new.id, new.created_by);

  return new;
end;
$$;

drop trigger if exists trg_after_paddy_purchase_insert on public.paddy_purchases;
create trigger trg_after_paddy_purchase_insert
after insert on public.paddy_purchases
for each row execute procedure public.after_paddy_purchase_insert();

-- F) Trigger for stock update on Milling Logs
create or replace function public.after_milling_log_insert()
returns trigger language plpgsql security definer as $$
begin
  -- 1) Deduct paddy stock
  update public.products
  set current_stock = current_stock - new.paddy_bags_used
  where id = new.paddy_product_id;

  insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
  values (new.paddy_product_id, -new.paddy_bags_used, 'ADJUSTMENT', 'Milling Usage', new.id, new.created_by);

  -- 2) Increase rice stock
  update public.products
  set current_stock = current_stock + new.rice_bags_produced
  where id = new.rice_product_id;

  insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
  values (new.rice_product_id, new.rice_bags_produced, 'ADJUSTMENT', 'Milling Output', new.id, new.created_by);

  return new;
end;
$$;

drop trigger if exists trg_after_milling_log_insert on public.milling_logs;
create trigger trg_after_milling_log_insert
after insert on public.milling_logs
for each row execute procedure public.after_milling_log_insert();

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

alter table public.products enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.suppliers enable row level security;
alter table public.paddy_purchases enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.milling_logs enable row level security;

-- PRODUCTS (INVENTORY)
drop policy if exists "products_read_all" on public.products;
create policy "products_read_all" on public.products for select using (auth.role() = 'authenticated');
drop policy if exists "products_write_accounts_admin" on public.products;
create policy "products_write_accounts_admin" on public.products for insert with check (public.is_accounts_or_admin());
drop policy if exists "products_update_accounts_admin" on public.products;
create policy "products_update_accounts_admin" on public.products for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());
drop policy if exists "products_delete_admin_only" on public.products;
create policy "products_delete_admin_only" on public.products for delete using (public.is_admin());

-- STOCK TRANSACTIONS
drop policy if exists "stock_trans_read_all" on public.stock_transactions;
create policy "stock_trans_read_all" on public.stock_transactions for select using (auth.role() = 'authenticated');
drop policy if exists "stock_trans_write_accounts_admin" on public.stock_transactions;
create policy "stock_trans_write_accounts_admin" on public.stock_transactions for insert with check (public.is_accounts_or_admin());

-- SUPPLIERS RLS
drop policy if exists "suppliers_read_all" on public.suppliers;
create policy "suppliers_read_all" on public.suppliers for select using (auth.role() = 'authenticated');
drop policy if exists "suppliers_write_accounts_admin" on public.suppliers;
create policy "suppliers_write_accounts_admin" on public.suppliers for insert with check (public.is_accounts_or_admin());
drop policy if exists "suppliers_update_accounts_admin" on public.suppliers;
create policy "suppliers_update_accounts_admin" on public.suppliers for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());
drop policy if exists "suppliers_delete_admin" on public.suppliers;
create policy "suppliers_delete_admin" on public.suppliers for delete using (public.is_admin());

-- PADDY PURCHASES RLS
drop policy if exists "paddy_purchases_read_all" on public.paddy_purchases;
create policy "paddy_purchases_read_all" on public.paddy_purchases for select using (auth.role() = 'authenticated');
drop policy if exists "paddy_purchases_write_accounts_admin" on public.paddy_purchases;
create policy "paddy_purchases_write_accounts_admin" on public.paddy_purchases for insert with check (public.is_accounts_or_admin());
drop policy if exists "paddy_purchases_delete_admin" on public.paddy_purchases;
create policy "paddy_purchases_delete_admin" on public.paddy_purchases for delete using (public.is_admin());

-- SUPPLIER PAYMENTS RLS
drop policy if exists "supplier_payments_read_all" on public.supplier_payments;
create policy "supplier_payments_read_all" on public.supplier_payments for select using (auth.role() = 'authenticated');
drop policy if exists "supplier_payments_write_accounts_admin" on public.supplier_payments;
create policy "supplier_payments_write_accounts_admin" on public.supplier_payments for insert with check (public.is_accounts_or_admin());
drop policy if exists "supplier_payments_delete_admin" on public.supplier_payments;
create policy "supplier_payments_delete_admin" on public.supplier_payments for delete using (public.is_admin());

-- MILLING LOGS RLS
drop policy if exists "milling_logs_read_all" on public.milling_logs;
create policy "milling_logs_read_all" on public.milling_logs for select using (auth.role() = 'authenticated');
drop policy if exists "milling_logs_write_accounts_admin" on public.milling_logs;
create policy "milling_logs_write_accounts_admin" on public.milling_logs for insert with check (public.is_accounts_or_admin());
drop policy if exists "milling_logs_delete_admin" on public.milling_logs;
create policy "milling_logs_delete_admin" on public.milling_logs for delete using (public.is_admin());
