-- 0003 Accounting backbone: journal entries and lines, posting helpers, opening balances
--
-- Rule: party_id is set only on lines that hit a party control account
-- (RECEIVABLE, PAYABLE, LOAN_PAYABLE, LOAN_RECEIVABLE). A party's balance is therefore
-- sum(debit - credit) over its lines: positive = they owe us, negative = we owe them.

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  source_type text not null,
  source_id uuid,
  narration text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index on public.journal_entries (source_type, source_id);
create index on public.journal_entries (entry_date);

create table public.journal_lines (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  party_id uuid references public.parties(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  constraint journal_lines_one_side check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0))
);

create index on public.journal_lines (account_id);
create index on public.journal_lines (party_id);
create index on public.journal_lines (entry_id);

-- Post a balanced entry. p_lines: [{account_id, party_id?, debit?, credit?, memo?}, ...]
-- Zero lines are skipped. Returns the entry id, or null when every line is zero.
create or replace function public.post_journal(
  p_date date, p_source_type text, p_source_id uuid, p_narration text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  v_dr numeric := 0;
  v_cr numeric := 0;
  l jsonb;
  v_debit numeric;
  v_credit numeric;
begin
  -- v_dr: net (debit - credit), must be zero; v_cr: total absolute movement
  for l in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce((l->>'debit')::numeric, 0), 2) - round(coalesce((l->>'credit')::numeric, 0), 2);
    v_dr := v_dr + v_debit;
    v_cr := v_cr + abs(v_debit);
  end loop;

  if abs(v_dr) > 0.009 then
    raise exception 'Journal not balanced for % (difference %)', p_source_type, v_dr;
  end if;
  if v_cr = 0 then
    return null;
  end if;

  insert into public.journal_entries (entry_date, source_type, source_id, narration)
  values (p_date, p_source_type, p_source_id, p_narration)
  returning id into v_entry;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_debit := round(coalesce((l->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((l->>'credit')::numeric, 0), 2);
    -- normalise negatives onto the other side
    if v_debit < 0 then v_credit := v_credit - v_debit; v_debit := 0; end if;
    if v_credit < 0 then v_debit := v_debit - v_credit; v_credit := 0; end if;
    if v_debit - v_credit <> 0 then
      insert into public.journal_lines (entry_id, account_id, party_id, debit, credit, memo)
      values (
        v_entry,
        (l->>'account_id')::uuid,
        nullif(l->>'party_id', '')::uuid,
        greatest(v_debit - v_credit, 0),
        greatest(v_credit - v_debit, 0),
        l->>'memo'
      );
    end if;
  end loop;

  return v_entry;
end;
$$;

create or replace function public.unpost_journal(p_source_type text, p_source_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.journal_entries where source_type = p_source_type and source_id = p_source_id;
$$;

-- Small builders for journal lines
create or replace function public.jl_dr(p_account uuid, p_amount numeric, p_party uuid default null, p_memo text default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('account_id', p_account, 'party_id', p_party, 'debit', coalesce(p_amount, 0), 'memo', p_memo)
$$;

create or replace function public.jl_cr(p_account uuid, p_amount numeric, p_party uuid default null, p_memo text default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('account_id', p_account, 'party_id', p_party, 'credit', coalesce(p_amount, 0), 'memo', p_memo)
$$;

-- Opening balances: parties
create or replace function public.post_party_opening()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.unpost_journal('OPENING_PARTY', new.id);
  if new.opening_balance > 0 then
    perform public.post_journal(new.opening_date, 'OPENING_PARTY', new.id, 'Opening balance: ' || new.name, jsonb_build_array(
      public.jl_dr(public.system_account('RECEIVABLE'), new.opening_balance, new.id),
      public.jl_cr(public.system_account('OPENING_EQUITY'), new.opening_balance)
    ));
  elsif new.opening_balance < 0 then
    perform public.post_journal(new.opening_date, 'OPENING_PARTY', new.id, 'Opening balance: ' || new.name, jsonb_build_array(
      public.jl_dr(public.system_account('OPENING_EQUITY'), -new.opening_balance),
      public.jl_cr(public.system_account('PAYABLE'), -new.opening_balance, new.id)
    ));
  end if;
  return new;
end;
$$;

create trigger trg_party_opening
after insert or update of opening_balance, opening_date, name on public.parties
for each row execute function public.post_party_opening();

-- Opening balances: accounts (cash, bank, capital, loans, etc.)
create or replace function public.post_account_opening()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_eq uuid;
begin
  perform public.unpost_journal('OPENING_ACCOUNT', new.id);
  if new.opening_balance = 0 or new.subtype = 'OPENING_EQUITY' then
    return new;
  end if;
  v_eq := public.system_account('OPENING_EQUITY');
  -- Debit-normal accounts: assets and expenses
  if new.type in ('ASSET', 'EXPENSE') then
    perform public.post_journal(new.opening_date, 'OPENING_ACCOUNT', new.id, 'Opening balance: ' || new.name, jsonb_build_array(
      public.jl_dr(new.id, new.opening_balance), public.jl_cr(v_eq, new.opening_balance)));
  else
    perform public.post_journal(new.opening_date, 'OPENING_ACCOUNT', new.id, 'Opening balance: ' || new.name, jsonb_build_array(
      public.jl_dr(v_eq, new.opening_balance), public.jl_cr(new.id, new.opening_balance)));
  end if;
  return new;
end;
$$;

create trigger trg_account_opening
after insert or update of opening_balance, opening_date on public.accounts
for each row execute function public.post_account_opening();

-- Balances
create or replace view public.v_account_balances with (security_invoker = true) as
select
  a.*,
  coalesce(sum(l.debit), 0) as total_debit,
  coalesce(sum(l.credit), 0) as total_credit,
  coalesce(sum(l.debit - l.credit), 0) as balance
from public.accounts a
left join public.journal_lines l on l.account_id = a.id
group by a.id;

create or replace view public.v_party_balances with (security_invoker = true) as
select
  p.*,
  coalesce(sum(l.debit - l.credit), 0) as balance
from public.parties p
left join public.journal_lines l on l.party_id = p.id
group by p.id;
