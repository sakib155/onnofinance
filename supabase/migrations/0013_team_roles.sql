-- 0013 Team: super admin, approval of new sign-ups, invitations, department roles
--
-- Roles
--   SUPER_ADMIN  everything, and the only role that manages the team
--   ADMIN        everything except the team
--   ACCOUNTANT   money, every document, reports and setup
--   PURCHASER    purchases, purchase returns, suppliers
--   SALES        sales, sale returns, customers
--   PRODUCTION   milling batches, stock transfers and adjustments
--   OPERATOR     purchases, sales, milling and stock together (kept from earlier versions)
--   VIEWER       read-only, including the books
--
-- New sign-ups are PENDING and can see nothing until the super admin approves them, unless the
-- super admin invited their email first. Permissions live in one place: public.perm_roles().
--
-- Safe to run on a project that already has data. Run once.

------------------------------------------------------------------------------------------
-- 1. Roles become text so new roles can be added in the same script.
--    Dropping the old role functions also drops the policies built on them; all are recreated below.
------------------------------------------------------------------------------------------
drop function if exists public.require_role(variadic public.user_role[]) cascade;
drop function if exists public.has_role(variadic public.user_role[]) cascade;
drop function if exists public.app_role() cascade;

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
drop type if exists public.user_role;
alter table public.profiles alter column role set default 'VIEWER';
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role in ('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PURCHASER', 'SALES', 'PRODUCTION', 'OPERATOR', 'VIEWER'));

-- Approval status replaces the old active flag
alter table public.profiles add column if not exists status text not null default 'PENDING';
alter table public.profiles drop constraint if exists profiles_status_valid;
alter table public.profiles add constraint profiles_status_valid check (status in ('PENDING', 'ACTIVE', 'BLOCKED'));
alter table public.profiles add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists approved_at timestamptz;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active') then
    update public.profiles set status = case when is_active then 'ACTIVE' else 'BLOCKED' end, approved_at = coalesce(approved_at, created_at);
    alter table public.profiles drop column is_active;
  end if;
end $$;

-- The earliest admin becomes the super admin (on a fresh install, the first sign-up does)
update public.profiles set role = 'SUPER_ADMIN'
where id = (select id from public.profiles where role = 'ADMIN' and status = 'ACTIVE' order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'SUPER_ADMIN');

------------------------------------------------------------------------------------------
-- 2. Role and permission checks
------------------------------------------------------------------------------------------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'ACTIVE'
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any(roles), false)
$$;

-- Which roles hold each permission. The app's permission list (src/app/auth.tsx) mirrors this.
create or replace function public.perm_roles(p_perm text)
returns text[] language sql immutable as $$
  select case p_perm
    when 'purchase'        then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PURCHASER', 'OPERATOR']
    when 'sale'            then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'SALES', 'OPERATOR']
    when 'production'      then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PRODUCTION', 'OPERATOR']
    when 'stock'           then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PRODUCTION', 'OPERATOR']
    when 'purchase_return' then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PURCHASER']
    when 'sale_return'     then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'SALES']
    when 'parties'         then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PURCHASER', 'SALES', 'OPERATOR']
    when 'delete_doc'      then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
    when 'reopen_batch'    then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
    when 'money'           then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
    when 'setup'           then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
    when 'books'           then array['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'VIEWER']
    when 'company'         then array['SUPER_ADMIN', 'ADMIN']
    when 'audit'           then array['SUPER_ADMIN', 'ADMIN']
    when 'delete_master'   then array['SUPER_ADMIN', 'ADMIN']
    when 'team'            then array['SUPER_ADMIN']
    else array[]::text[]
  end
$$;

create or replace function public.can(p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any(public.perm_roles(p_perm)), false)
$$;

create or replace function public.require_perm(p_perm text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can(p_perm) then
    raise exception 'You do not have permission for this action' using errcode = '42501';
  end if;
end;
$$;

------------------------------------------------------------------------------------------
-- 3. Point every document function at its permission.
--    Each function's role check is swapped in place; the rest of its body is unchanged.
------------------------------------------------------------------------------------------
do $$
declare
  m record;
  v_def text;
  v_new text;
begin
  for m in select * from (values
    ('save_purchase', 'purchase'), ('delete_purchase', 'delete_doc'),
    ('save_sale', 'sale'), ('delete_sale', 'delete_doc'),
    ('save_sale_return', 'sale_return'), ('delete_sale_return', 'sale_return'),
    ('save_purchase_return', 'purchase_return'), ('delete_purchase_return', 'purchase_return'),
    ('save_stock_transfer', 'stock'), ('delete_stock_transfer', 'stock'),
    ('save_stock_adjustment', 'stock'), ('delete_stock_adjustment', 'stock'),
    ('save_production_batch', 'production'), ('save_production_stage', 'production'),
    ('save_production_cost', 'production'), ('delete_production_cost', 'production'),
    ('complete_production_batch', 'production'), ('reopen_production_batch', 'reopen_batch'),
    ('delete_production_batch', 'delete_doc'),
    ('save_money_txn', 'money'), ('set_cheque_status', 'money'), ('delete_money_txn', 'money')
  ) as t(fn, perm) loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.fn;
    if v_def is null then
      raise exception 'Function % not found', m.fn;
    end if;
    v_new := regexp_replace(v_def, 'perform public\.require_(role|perm)\([^;]*\);', format('perform public.require_perm(%L);', m.perm));
    if v_new = v_def and v_def not like format('%%require_perm(%L)%%', m.perm) then
      raise exception 'Could not find the permission check in %', m.fn;
    end if;
    execute v_new;
  end loop;
end $$;

------------------------------------------------------------------------------------------
-- 4. Invitations and sign-up
------------------------------------------------------------------------------------------
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null check (role in ('ADMIN', 'ACCOUNTANT', 'PURCHASER', 'SALES', 'PRODUCTION', 'OPERATOR', 'VIEWER')),
  invited_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create unique index if not exists team_invites_email_idx on public.team_invites (lower(email));

-- First sign-up: super admin. Invited email: active with the invited role. Anyone else: pending.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv public.team_invites;
begin
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, full_name, email, role, status, approved_at)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'SUPER_ADMIN', 'ACTIVE', now())
    on conflict (id) do nothing;
    return new;
  end if;

  select * into inv from public.team_invites where lower(email) = lower(new.email) and used_at is null;
  if inv.id is not null then
    insert into public.profiles (id, full_name, email, role, status, approved_by, approved_at)
    values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), inv.full_name, ''), new.email,
      inv.role, 'ACTIVE', inv.invited_by, now())
    on conflict (id) do nothing;
    update public.team_invites set used_at = now() where id = inv.id;
  else
    insert into public.profiles (id, full_name, email, role, status)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'VIEWER', 'PENDING')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Add a member: approve them now if they already signed up, otherwise invite their email
create or replace function public.invite_member(p_email text, p_full_name text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  perform public.require_perm('team');
  if p_role = 'SUPER_ADMIN' or p_role is null then
    raise exception 'Choose a role';
  end if;
  if coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select id into v_profile from public.profiles where lower(email) = lower(trim(p_email));
  if v_profile is not null then
    update public.profiles set role = p_role, status = 'ACTIVE', approved_by = auth.uid(), approved_at = now(),
      full_name = coalesce(nullif(full_name, ''), p_full_name, '')
    where id = v_profile;
    return 'APPROVED';
  end if;

  insert into public.team_invites (email, full_name, role)
  values (lower(trim(p_email)), nullif(trim(p_full_name), ''), p_role)
  on conflict (lower(email)) do update set full_name = excluded.full_name, role = excluded.role, used_at = null,
    invited_by = auth.uid(), created_at = now();
  return 'INVITED';
end;
$$;

-- Team changes: only the super admin, and there must always be an active super admin left
create or replace function public.guard_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.role is distinct from old.role or new.status is distinct from old.status)
       and old.role = 'SUPER_ADMIN'
       and (new.role <> 'SUPER_ADMIN' or new.status <> 'ACTIVE')
       and not exists (select 1 from public.profiles where role = 'SUPER_ADMIN' and status = 'ACTIVE' and id <> old.id) then
      raise exception 'There must always be one active super admin';
    end if;
    if new.status = 'ACTIVE' and old.status <> 'ACTIVE' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
for each row execute function public.guard_profile_change();

------------------------------------------------------------------------------------------
-- 5. Row-level security, rebuilt on the permission list
------------------------------------------------------------------------------------------
alter table public.team_invites enable row level security;

do $$
declare
  t text;
  r record;
begin
  -- clear every policy on our tables, then recreate
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  foreach t in array array[
    'company_settings', 'accounts', 'parties', 'items', 'warehouses',
    'lots', 'stock_movements', 'lot_allocations', 'stock_transfers', 'stock_adjustments',
    'purchases', 'purchase_lines', 'sales', 'sale_lines', 'sale_returns', 'purchase_returns',
    'production_batches', 'production_inputs', 'production_stages', 'production_costs', 'production_outputs',
    'money_txns', 'bill_settlements'
  ] loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (public.app_role() is not null)', t);
  end loop;

  foreach t in array array['journal_entries', 'journal_lines'] loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (public.can(''books''))', t);
  end loop;
end $$;

-- Everyone sees their own profile (so a pending user can see they are pending); active users see the team
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() is not null);
create policy "team updates profiles" on public.profiles for update to authenticated
  using (public.can('team')) with check (public.can('team'));

create policy "team manages invites" on public.team_invites for all to authenticated
  using (public.can('team')) with check (public.can('team'));

create policy "read audit" on public.audit_log for select to authenticated using (public.can('audit'));

create policy "update company" on public.company_settings for update to authenticated
  using (public.can('company')) with check (public.can('company'));

create policy "insert accounts" on public.accounts for insert to authenticated with check (public.can('setup'));
create policy "update accounts" on public.accounts for update to authenticated using (public.can('setup')) with check (public.can('setup'));
create policy "delete accounts" on public.accounts for delete to authenticated using (public.can('delete_master') and not is_system);

create policy "insert parties" on public.parties for insert to authenticated with check (public.can('parties'));
create policy "update parties" on public.parties for update to authenticated using (public.can('parties')) with check (public.can('parties'));
create policy "delete parties" on public.parties for delete to authenticated using (public.can('delete_master'));

create policy "insert items" on public.items for insert to authenticated with check (public.can('setup'));
create policy "update items" on public.items for update to authenticated using (public.can('setup')) with check (public.can('setup'));
create policy "delete items" on public.items for delete to authenticated using (public.can('delete_master'));

create policy "insert warehouses" on public.warehouses for insert to authenticated with check (public.can('setup'));
create policy "update warehouses" on public.warehouses for update to authenticated using (public.can('setup')) with check (public.can('setup'));
create policy "delete warehouses" on public.warehouses for delete to authenticated using (public.can('delete_master'));

------------------------------------------------------------------------------------------
-- 6. Function permissions
------------------------------------------------------------------------------------------
revoke execute on function public.handle_new_user(), public.guard_profile_change() from public, anon, authenticated;
revoke execute on function public.invite_member(text, text, text) from public, anon;
grant execute on function public.invite_member(text, text, text) to authenticated;

drop trigger if exists audit_team_invites on public.team_invites;
create trigger audit_team_invites after insert or update or delete on public.team_invites
for each row execute function public.audit_row();
