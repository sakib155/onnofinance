-- 0001 Core: users, roles, company settings, document numbering, audit log

create type public.user_role as enum ('ADMIN', 'ACCOUNTANT', 'OPERATOR', 'VIEWER');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.user_role not null default 'VIEWER',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- The first user to sign up becomes ADMIN; everyone after starts as VIEWER.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    case when exists (select 1 from public.profiles) then 'VIEWER'::public.user_role else 'ADMIN'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(variadic roles public.user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = any(roles), false)
$$;

create or replace function public.require_role(variadic roles public.user_role[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(variadic roles) then
    raise exception 'You do not have permission for this action' using errcode = '42501';
  end if;
end;
$$;

-- Company settings (single row)
create table public.company_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'My Rice Mill',
  name_bn text,
  address text,
  phone text,
  email text,
  header_image_url text,
  default_bag_kg numeric(10,3) not null default 50,
  invoice_footer text,
  updated_at timestamptz not null default now()
);

-- Document numbering: PUR-2026-00001 style, per type per year
create table public.doc_sequences (
  doc_type text not null,
  year int not null,
  last_no int not null default 0,
  primary key (doc_type, year)
);

create or replace function public.next_doc_no(p_doc_type text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from p_date);
  v_no int;
begin
  insert into public.doc_sequences (doc_type, year, last_no)
  values (p_doc_type, v_year, 1)
  on conflict (doc_type, year) do update set last_no = public.doc_sequences.last_no + 1
  returning last_no into v_no;
  return p_doc_type || '-' || v_year || '-' || lpad(v_no::text, 5, '0');
end;
$$;

-- Audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
