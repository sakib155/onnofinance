-- =========================================================
-- EXTENSIONS
-- =========================================================
create extension if not exists pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================
do $$ begin
  create type public.user_role as enum ('ADMIN','ACCOUNTS','VIEWER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('DRAFT','UNPAID','PARTIAL','PAID','OVERDUE');
exception when duplicate_object then null; end $$;

-- =========================================================
-- TABLES
-- =========================================================

-- 1) Profiles (team users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'VIEWER',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create profile row when a user is created (optional)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'VIEWER')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 2) Settings (single company)
create table if not exists public.settings (
  id int primary key default 1,
  company_name text,
  company_address text,
  company_phone text,
  company_email text,
  logo_url text,
  invoice_prefix text not null default 'INV',
  invoice_padding int not null default 6, -- e.g. 000001
  footer_note text,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- 3) Invoice sequence (continuous numbering)
create table if not exists public.invoice_sequence (
  id int primary key default 1,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.invoice_sequence (id) values (1)
on conflict (id) do nothing;

-- 4) Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms_days int not null default 15,
  opening_due numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_company_name on public.clients(company_name);

-- 5) Invoices
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date not null,
  notes text,

  -- Monetary fields
  subtotal numeric(12,2) not null default 0,        -- sum of line items
  previous_due numeric(12,2) not null default 0,    -- snapshot at finalize time
  invoice_total numeric(12,2) not null default 0,   -- equals subtotal (kept explicit)
  paid_total numeric(12,2) not null default 0,      -- sum of payments
  balance_due numeric(12,2) not null default 0,     -- invoice_total - paid_total

  status public.invoice_status not null default 'DRAFT',
  is_locked boolean not null default false,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due_date on public.invoices(due_date);

-- 6) Invoice items
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,3) not null default 0,
  rate numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0
);

create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);

-- 7) Payments (against invoice)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method text not null, -- Cash/Bank/MFS etc
  reference text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_invoice_id on public.payments(invoice_id);
create index if not exists idx_payments_client_id on public.payments(client_id);

-- 8) Audit logs (recommended)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  entity text not null,
  entity_id uuid,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- HELPERS: ROLE CHECKS
-- =========================================================
create or replace function public.current_role()
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  return coalesce(v_role, 'VIEWER'::public.user_role);
end;
$$;

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.current_role() = 'ADMIN';
end;
$$;

create or replace function public.is_accounts_or_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.current_role() in ('ADMIN','ACCOUNTS');
end;
$$;

-- =========================================================
-- FINANCE FUNCTIONS
-- =========================================================

-- A) Get client balance (opening_due + invoices - payments)
create or replace function public.get_client_balance(p_client_id uuid)
returns numeric
language plpgsql
security definer
as $$
declare
  v_opening numeric(12,2);
  v_invoices numeric(12,2);
  v_payments numeric(12,2);
begin
  select opening_due into v_opening from public.clients where id = p_client_id;

  select coalesce(sum(invoice_total),0)
    into v_invoices
  from public.invoices
  where client_id = p_client_id
    and status <> 'DRAFT';

  select coalesce(sum(amount),0)
    into v_payments
  from public.payments
  where client_id = p_client_id;

  return coalesce(v_opening,0) + v_invoices - v_payments;
end;
$$;

-- B) Generate next continuous invoice number: TC-022626-000001
create or replace function public.next_invoice_no(p_client_id uuid, p_inv_date date)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_pad int;
  v_next bigint;
  v_comp_name text;
  v_initials text := '';
  v_word text;
  v_date_part text;
begin
  select invoice_prefix, invoice_padding into v_prefix, v_pad
  from public.settings where id = 1;

  -- 1. Extract first letter of each word in company name (e.g. Test Client -> TC)
  select company_name into v_comp_name from public.clients where id = p_client_id;
  for v_word in select unnest(string_to_array(v_comp_name, ' '))
  loop
    if length(v_word) > 0 then
      v_initials := v_initials || upper(substring(v_word, 1, 1));
    end if;
  end loop;

  -- 2. Format Date (MMDDYY)
  v_date_part := to_char(p_inv_date, 'MMDDYY');

  -- 3. Get Sequence Number
  update public.invoice_sequence
  set last_number = last_number + 1,
      updated_at = now()
  where id = 1
  returning last_number into v_next;

  -- 4. Combine: TC-022626-000001
  return v_initials || '-' || v_date_part || '-' || lpad(v_next::text, v_pad, '0');
end;
$$;

-- C) Recalculate invoice totals (items + payments + status)
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
begin
  select coalesce(sum(amount),0) into v_subtotal
  from public.invoice_items where invoice_id = p_invoice_id;

  select coalesce(sum(amount),0) into v_paid
  from public.payments where invoice_id = p_invoice_id;

  v_total := v_subtotal;
  v_due := greatest(v_total - v_paid, 0);

  select due_date into v_due_date from public.invoices where id = p_invoice_id;

  if v_total = 0 and v_paid = 0 then
    v_status := 'DRAFT';
  elsif v_due = 0 then
    v_status := 'PAID';
  elsif v_paid > 0 and v_due > 0 then
    -- overdue handled below
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

-- D) Finalize invoice: sets invoice_no, due_date, previous_due snapshot, status
create or replace function public.finalize_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_client uuid;
  v_terms int;
  v_inv_date date;
  v_prev_due numeric(12,2);
  v_no text;
begin
  if not public.is_accounts_or_admin() then
    raise exception 'Not allowed';
  end if;

  select client_id, invoice_date into v_client, v_inv_date
  from public.invoices where id = p_invoice_id;

  select payment_terms_days into v_terms
  from public.clients where id = v_client;

  -- Snapshot previous due BEFORE this invoice is counted as finalized
  v_prev_due := public.get_client_balance(v_client);

  v_no := public.next_invoice_no(v_client, v_inv_date);

  update public.invoices
     set invoice_no = v_no,
         due_date = (v_inv_date + v_terms),
         previous_due = v_prev_due,
         status = 'UNPAID',
         updated_at = now()
   where id = p_invoice_id;

  perform public.recalc_invoice(p_invoice_id);

  insert into public.audit_logs(actor_id, entity, entity_id, action, meta)
  values (auth.uid(), 'invoice', p_invoice_id, 'FINALIZE', jsonb_build_object('invoice_no', v_no));
end;
$$;

-- =========================================================
-- TRIGGERS
-- =========================================================

-- Keep invoice_items amount correct
create or replace function public.invoice_item_amount()
returns trigger language plpgsql as $$
begin
  new.amount := round(coalesce(new.quantity,0) * coalesce(new.rate,0), 2);
  return new;
end;
$$;

drop trigger if exists trg_invoice_item_amount on public.invoice_items;
create trigger trg_invoice_item_amount
before insert or update on public.invoice_items
for each row execute procedure public.invoice_item_amount();

-- After invoice items change -> recalc invoice
create or replace function public.after_invoice_items_change()
returns trigger language plpgsql security definer as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists trg_after_invoice_items_change on public.invoice_items;
create trigger trg_after_invoice_items_change
after insert or update or delete on public.invoice_items
for each row execute procedure public.after_invoice_items_change();

-- After payments change -> recalc invoice
create or replace function public.after_payments_change()
returns trigger language plpgsql security definer as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists trg_after_payments_change on public.payments;
create trigger trg_after_payments_change
after insert or update or delete on public.payments
for each row execute procedure public.after_payments_change();

-- Prevent editing locked invoices/items for non-admin
create or replace function public.prevent_locked_invoice_edits()
returns trigger language plpgsql as $$
declare
  v_locked boolean;
begin
  select is_locked into v_locked from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if v_locked and not public.is_admin() then
    raise exception 'Invoice is locked due to payments. Admin only.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_locked_invoice_item_edits on public.invoice_items;
create trigger trg_prevent_locked_invoice_item_edits
before update or delete on public.invoice_items
for each row execute procedure public.prevent_locked_invoice_edits();

-- =========================================================
-- VIEWS (OPTIONAL) FOR DASHBOARD
-- =========================================================

create or replace view public.v_client_due as
select
  c.id as client_id,
  c.company_name,
  c.phone,
  (public.get_client_balance(c.id)) as current_due
from public.clients c;

create or replace view public.v_overdue_invoices as
select
  i.id,
  i.invoice_no,
  i.client_id,
  c.company_name,
  i.invoice_date,
  i.due_date,
  i.invoice_total,
  i.paid_total,
  i.balance_due,
  (current_date - i.due_date) as days_overdue
from public.invoices i
join public.clients c on c.id = i.client_id
where i.balance_due > 0 and i.due_date < current_date;


-- Enable RLS
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.invoice_sequence enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

-- PROFILES
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select using (id = auth.uid());
drop policy if exists "profiles_admin_read_all" on public.profiles;
create policy "profiles_admin_read_all" on public.profiles for select using (public.is_admin());
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- SETTINGS
drop policy if exists "settings_read_all" on public.settings;
create policy "settings_read_all" on public.settings for select using (auth.role() = 'authenticated');
drop policy if exists "settings_admin_update" on public.settings;
create policy "settings_admin_update" on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- INVOICE SEQUENCE
drop policy if exists "seq_no_direct_select" on public.invoice_sequence;
create policy "seq_no_direct_select" on public.invoice_sequence for select using (public.is_admin());
drop policy if exists "seq_no_direct_update" on public.invoice_sequence;
create policy "seq_no_direct_update" on public.invoice_sequence for update using (public.is_admin()) with check (public.is_admin());

-- CLIENTS
drop policy if exists "clients_read_all" on public.clients;
create policy "clients_read_all" on public.clients for select using (auth.role() = 'authenticated');
drop policy if exists "clients_write_accounts_admin" on public.clients;
create policy "clients_write_accounts_admin" on public.clients for insert with check (public.is_accounts_or_admin());
drop policy if exists "clients_update_accounts_admin" on public.clients;
create policy "clients_update_accounts_admin" on public.clients for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());

-- INVOICES
drop policy if exists "invoices_read_all" on public.invoices;
create policy "invoices_read_all" on public.invoices for select using (auth.role() = 'authenticated');
drop policy if exists "invoices_insert_accounts_admin" on public.invoices;
create policy "invoices_insert_accounts_admin" on public.invoices for insert with check (public.is_accounts_or_admin());
drop policy if exists "invoices_update_accounts_admin" on public.invoices;
create policy "invoices_update_accounts_admin" on public.invoices for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());

-- INVOICE ITEMS
drop policy if exists "invoice_items_read_all" on public.invoice_items;
create policy "invoice_items_read_all" on public.invoice_items for select using (auth.role() = 'authenticated');
drop policy if exists "invoice_items_write_accounts_admin" on public.invoice_items;
create policy "invoice_items_write_accounts_admin" on public.invoice_items for insert with check (public.is_accounts_or_admin());
drop policy if exists "invoice_items_update_accounts_admin" on public.invoice_items;
create policy "invoice_items_update_accounts_admin" on public.invoice_items for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());
drop policy if exists "invoice_items_delete_accounts_admin" on public.invoice_items;
create policy "invoice_items_delete_accounts_admin" on public.invoice_items for delete using (public.is_accounts_or_admin());

-- PAYMENTS
drop policy if exists "payments_read_all" on public.payments;
create policy "payments_read_all" on public.payments for select using (auth.role() = 'authenticated');
drop policy if exists "payments_write_accounts_admin" on public.payments;
create policy "payments_write_accounts_admin" on public.payments for insert with check (public.is_accounts_or_admin());
drop policy if exists "payments_update_accounts_admin" on public.payments;
create policy "payments_update_accounts_admin" on public.payments for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());
drop policy if exists "payments_delete_admin_only" on public.payments;
create policy "payments_delete_admin_only" on public.payments for delete using (public.is_admin());

-- AUDIT LOGS
drop policy if exists "audit_read_admin_only" on public.audit_logs;
create policy "audit_read_admin_only" on public.audit_logs for select using (public.is_admin());
drop policy if exists "audit_insert_accounts_admin" on public.audit_logs;
create policy "audit_insert_accounts_admin" on public.audit_logs for insert with check (public.is_accounts_or_admin());
