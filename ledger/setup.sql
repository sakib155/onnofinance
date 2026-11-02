-- Onno Ledger: run once in the Supabase SQL Editor, then run seed.sql. Safe to run again.
create table if not exists public.ledger_members (
  email text primary key
);

create table if not exists public.ledger_sales (
  id text primary key default gen_random_uuid()::text,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  date date,
  description text not null default '',
  product text not null check (btrim(product) <> ''),
  party text not null check (btrim(party) <> ''),
  kg numeric not null check (kg > 0),
  rate numeric not null check (rate > 0),
  cost numeric not null check (cost >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (date is null or to_char(date, 'YYYY-MM') = month)
);

create table if not exists public.ledger_settings (
  id boolean primary key default true check (id),
  overhead numeric not null check (overhead >= 0),
  target numeric not null
);
insert into public.ledger_settings (overhead, target) values (150000, 0.15) on conflict do nothing;

-- A signed-up account sees nothing until its confirmed email is listed in ledger_members.
create or replace function public.is_ledger_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ledger_members m
    join auth.users u on lower(u.email) = lower(m.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;

alter table public.ledger_members enable row level security;
alter table public.ledger_sales enable row level security;
alter table public.ledger_settings enable row level security;

revoke all on public.ledger_members, public.ledger_sales, public.ledger_settings from anon, authenticated;
grant select, insert, update, delete on public.ledger_sales to authenticated;
grant select, update on public.ledger_settings to authenticated;
revoke all on function public.is_ledger_member() from public, anon;
grant execute on function public.is_ledger_member() to authenticated;

drop policy if exists ledger_sales_members on public.ledger_sales;
create policy ledger_sales_members on public.ledger_sales for all to authenticated
  using (public.is_ledger_member()) with check (public.is_ledger_member());

drop policy if exists ledger_settings_read on public.ledger_settings;
create policy ledger_settings_read on public.ledger_settings for select to authenticated
  using (public.is_ledger_member());
drop policy if exists ledger_settings_write on public.ledger_settings;
create policy ledger_settings_write on public.ledger_settings for update to authenticated
  using (public.is_ledger_member()) with check (public.is_ledger_member());
