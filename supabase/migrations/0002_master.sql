-- 0002 Master data: chart of accounts (incl. cash/bank and expense heads), parties, items, warehouses

create type public.account_type as enum ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- subtype drives behaviour:
--   CASH, BANK                 money accounts (cash book / bank book)
--   RECEIVABLE, PAYABLE        party control accounts
--   LOAN_PAYABLE, LOAN_RECEIVABLE
--   INVENTORY, WIP             stock and production in progress
--   SALES, SALES_RETURN, OTHER_INCOME, COGS, EXPENSE, STOCK_ADJUSTMENT
--   CAPITAL, DRAWINGS, OPENING_EQUITY
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_bn text,
  type public.account_type not null,
  subtype text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  bank_name text,
  branch text,
  account_no text,
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index on public.accounts (subtype);

-- System account by subtype (first system account of that subtype)
create or replace function public.system_account(p_subtype text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.accounts
  where subtype = p_subtype and is_system
  order by code limit 1;
  if v_id is null then
    raise exception 'System account % is missing', p_subtype;
  end if;
  return v_id;
end;
$$;

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  name_bn text,
  phone text,
  address text,
  -- any of CUSTOMER, SUPPLIER, BROKER, TRANSPORTER, LENDER, EMPLOYEE, OTHER
  types text[] not null default '{}',
  -- positive: they owe us (receivable); negative: we owe them (payable)
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  credit_limit numeric(14,2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint parties_types_valid check (
    types <@ array['CUSTOMER','SUPPLIER','BROKER','TRANSPORTER','LENDER','EMPLOYEE','OTHER']
  )
);

create index on public.parties using gin (types);

create type public.item_category as enum ('PADDY', 'RICE', 'BYPRODUCT', 'PACKAGING', 'OTHER');

create table public.items (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  name_bn text,
  category public.item_category not null,
  default_bag_kg numeric(10,3) not null default 50,
  -- reference price per kg, used to split production cost across outputs
  standard_price numeric(14,4) not null default 0,
  reorder_level_kg numeric(14,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_bn text,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
