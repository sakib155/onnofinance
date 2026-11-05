-- 0021 Rice mix estimates saved against a sales order.
--   Each row is one rice: name, kg, rate and sorting per 50 kg bag. The prices are worked out from these
--   by mixPrice() in the app, so the sums live in one place. An estimate never touches stock or the books.
-- Safe to run again.

create table if not exists public.order_mixes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  rows jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_mixes_order_idx on public.order_mixes (order_id);

create or replace function public.save_order_mix(p_order uuid, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_rows jsonb;
  v_id uuid;
begin
  perform public.require_perm('sale');
  select status into v_status from public.sales_orders where id = p_order;
  if v_status is null then
    raise exception 'Order not found';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'This order is cancelled; reopen it before editing';
  end if;
  select jsonb_agg(jsonb_build_object(
      'name', coalesce(r->>'name', ''),
      'kg', (r->>'kg')::numeric,
      'rate', (r->>'rate')::numeric,
      'sorting', greatest(coalesce(nullif(r->>'sorting', '')::numeric, 0), 0)))
  into v_rows
  from jsonb_array_elements(p_rows) r
  where (r->>'kg')::numeric > 0 and (r->>'rate')::numeric > 0;
  if v_rows is null then
    raise exception 'Add at least one item';
  end if;
  insert into public.order_mixes (order_id, rows) values (p_order, v_rows) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_order_mix(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_perm('sale');
  delete from public.order_mixes where id = p_id;
end;
$$;

alter table public.order_mixes enable row level security;
drop policy if exists "read order_mixes" on public.order_mixes;
create policy "read order_mixes" on public.order_mixes for select to authenticated using (public.app_role() is not null);
grant select on public.order_mixes to authenticated;

revoke execute on function public.save_order_mix(uuid, jsonb), public.delete_order_mix(uuid) from public, anon;
grant execute on function public.save_order_mix(uuid, jsonb), public.delete_order_mix(uuid) to authenticated;

drop trigger if exists audit_order_mixes on public.order_mixes;
create trigger audit_order_mixes after insert or update or delete on public.order_mixes
for each row execute function public.audit_row();

create or replace function public.schema_version()
returns int language sql immutable as $$ select 21 $$;
grant execute on function public.schema_version() to authenticated;
