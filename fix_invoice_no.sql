create or replace function public.next_invoice_no(p_client_id uuid, p_inv_date date)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_pad int;
  v_next bigint;
begin
  select invoice_prefix, invoice_padding into v_prefix, v_pad
  from public.settings where id = 1;

  -- 1. Get Sequence Number
  update public.invoice_sequence
  set last_number = last_number + 1,
      updated_at = now()
  where id = 1
  returning last_number into v_next;

  -- 2. Combine: INV-000001
  return v_prefix || '-' || lpad(v_next::text, v_pad, '0');
end;
$$;
