-- 1) Create owner_transactions Table
create table if not exists public.owner_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('INVESTMENT', 'DRAWING')), -- INVESTMENT = Credit, DRAWING = Debit
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'Cash', -- Cash, Bank, MFS
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 2) Create Index
create index if not exists idx_owner_trans_date on public.owner_transactions(transaction_date);
create index if not exists idx_owner_trans_type on public.owner_transactions(transaction_type);

-- 3) Enable Row Level Security (RLS)
alter table public.owner_transactions enable row level security;

-- 4) Create Security Policies (RLS)
create policy "Allow all operations for authenticated users on owner_transactions"
  on public.owner_transactions
  for all
  to authenticated
  using (true)
  with check (true);
