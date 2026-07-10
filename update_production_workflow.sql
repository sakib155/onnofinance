-- =========================================================================
-- RICE MILL PRODUCTION WORKFLOW & COSTING SCHEMA
-- =========================================================================
-- Copy and run this script in your Supabase SQL Editor.
-- =========================================================================

-- 1) Alter public.products to add inventory_type
alter table public.products add column if not exists inventory_type text default 'FINISHED_GOOD';

alter table public.products drop constraint if exists chk_products_inventory_type;
alter table public.products add constraint chk_products_inventory_type 
  check (inventory_type in ('RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOOD'));

-- Update existing paddy products if they exist
update public.products 
set inventory_type = 'RAW_MATERIAL' 
where name ilike '%paddy%';

-- 2) Helper function to convert KG weight to product's stock unit
create or replace function public.convert_kg_to_product_unit(p_product_id uuid, p_qty_kg numeric)
returns numeric
language plpgsql
security definer
as $$
declare
  v_unit text;
  v_bag_weight numeric;
begin
  select unit into v_unit from public.products where id = p_product_id;
  
  if v_unit like 'Bag (%kg)' then
    -- Extract weight, e.g., 'Bag (50kg)' -> 50
    v_bag_weight := coalesce(nullif(regexp_replace(v_unit, '[^0-9]', '', 'g'), '')::numeric, 50);
    return round(p_qty_kg / v_bag_weight, 3);
  elsif v_unit like 'Bag%' then
    return round(p_qty_kg / 50.0, 3);
  else
    return p_qty_kg; -- E.g. 'KG' unit
  end if;
end;
$$;

-- 3) Create public.production_batches table
create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text unique not null,
  process_type text not null check (process_type in ('MILLING', 'SORTING')),
  production_date date not null default current_date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'COMPLETED')),
  labor_charge numeric(12,2) not null default 0 check (labor_charge >= 0),
  other_charges numeric(12,2) not null default 0 check (other_charges >= 0),
  total_input_weight numeric(12,3) not null default 0,
  total_output_weight numeric(12,3) not null default 0,
  total_input_cost numeric(12,2) not null default 0,
  costing_method text not null check (costing_method in ('MARKET_VALUE', 'WEIGHT_PROPORTION', 'CONFIGURED_PERCENTAGE')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prod_batches_date on public.production_batches(production_date);
create index if not exists idx_prod_batches_status on public.production_batches(status);

-- 4) Create public.production_inputs table
create table if not exists public.production_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  bags numeric(12,3) not null default 0 check (bags >= 0),
  bag_weight numeric(6,2) not null default 50 check (bag_weight >= 0),
  quantity_kg numeric(12,3) not null default 0 check (quantity_kg >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0)
);

create index if not exists idx_prod_inputs_batch on public.production_inputs(batch_id);

-- 5) Create public.production_outputs table
create table if not exists public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  bags numeric(12,3) not null default 0 check (bags >= 0),
  bag_weight numeric(6,2) not null default 50 check (bag_weight >= 0),
  quantity_kg numeric(12,3) not null default 0 check (quantity_kg >= 0),
  market_value numeric(12,2) not null default 0 check (market_value >= 0),
  configured_percentage numeric(5,2) not null default 0 check (configured_percentage >= 0),
  allocated_cost numeric(12,2) not null default 0,
  cost_per_kg numeric(12,4) not null default 0
);

create index if not exists idx_prod_outputs_batch on public.production_outputs(batch_id);

-- 6) Link profiles references if profiles exists
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') then
    alter table public.production_batches drop constraint if exists production_batches_created_by_fkey;
    alter table public.production_batches add constraint production_batches_created_by_fkey 
      foreign key (created_by) references public.profiles(id);
  end if;
end $$;

-- 7) Fix finalize_invoice to prevent Bag vs KG stock deduction mismatch & apply FIFO matching
-- Add remaining_stock column to paddy_purchases
alter table public.paddy_purchases add column if not exists remaining_stock numeric(12,3) not null default 0;

-- Create purchase_sales association table
create table if not exists public.purchase_sales (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.paddy_purchases(id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items(id) on delete cascade,
  quantity numeric(12,3) not null, -- Quantity matched in product stock unit
  created_at timestamptz not null default now()
);

-- Enable RLS and add policy for authenticated users
alter table public.purchase_sales enable row level security;
drop policy if exists "Allow all operations for authenticated users on purchase_sales" on public.purchase_sales;
create policy "Allow all operations for authenticated users on purchase_sales"
  on public.purchase_sales for all to authenticated using (true) with check (true);

-- Purchase-Sale Delete Trigger (To restore remaining stock)
create or replace function public.after_purchase_sale_delete()
returns trigger language plpgsql security definer as $$
begin
  update public.paddy_purchases
  set remaining_stock = remaining_stock + old.quantity
  where id = old.purchase_id;
  return old;
end;
$$;

drop trigger if exists trg_after_purchase_sale_delete on public.purchase_sales;
create trigger trg_after_purchase_sale_delete
after delete on public.purchase_sales
for each row execute procedure public.after_purchase_sale_delete();

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
  v_item record;
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

  -- DEDUCT STOCK (CONVERTED PROPERLY) AND PERFORM FIFO MATCHING
  for v_item in 
    select id, product_id, quantity, bags, rate_type 
    from public.invoice_items 
    where invoice_id = p_invoice_id and product_id is not null
  loop
      declare
        v_deduct_stock numeric;
        v_unit text;
        v_remaining_to_deduct numeric;
        v_purchase record;
        v_allocate numeric;
        v_allocated_cost numeric;
        v_total_cost numeric := 0;
        v_total_allocated numeric := 0;
      begin
        select unit into v_unit from public.products where id = v_item.product_id;
        
        -- If product is bag-based and invoice item has bag count, use bags directly. Otherwise convert weight.
        if v_unit like 'Bag%' and coalesce(v_item.bags, 0) > 0 then
          v_deduct_stock := v_item.bags;
        else
          v_deduct_stock := public.convert_kg_to_product_unit(v_item.product_id, v_item.quantity);
        end if;

        -- 1. Deduct from products table
        update public.products 
        set current_stock = current_stock - v_deduct_stock 
        where id = v_item.product_id;
        
        -- 2. Log the stock transaction
        insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
        values (v_item.product_id, -v_deduct_stock, 'SALE', v_no, p_invoice_id, auth.uid());

        -- 3. FIFO Matching Logic
        v_remaining_to_deduct := v_deduct_stock;
        
        for v_purchase in
          select id, remaining_stock, rate, rate_type, bag_weight
          from public.paddy_purchases
          where product_id = v_item.product_id and remaining_stock > 0
          order by purchase_date asc, created_at asc
        loop
          exit when v_remaining_to_deduct <= 0;

          v_allocate := least(v_remaining_to_deduct, v_purchase.remaining_stock);

          -- Deduct from purchase remaining stock
          update public.paddy_purchases
          set remaining_stock = remaining_stock - v_allocate
          where id = v_purchase.id;

          -- Log connection in purchase_sales
          insert into public.purchase_sales (purchase_id, invoice_item_id, quantity)
          values (v_purchase.id, v_item.id, v_allocate);

          -- Calculate purchase cost in BDT for this allocation
          if v_unit like 'Bag%' then
            -- product unit is Bags
            if v_purchase.rate_type = 'PER_BAG' then
              v_allocated_cost := v_allocate * v_purchase.rate;
            elsif v_purchase.rate_type = 'PER_MAUND' then
              v_allocated_cost := v_allocate * (coalesce(v_purchase.bag_weight, 50) / 40.0) * v_purchase.rate;
            else -- PER_KG
              v_allocated_cost := v_allocate * coalesce(v_purchase.bag_weight, 50) * v_purchase.rate;
            end if;
          else
            -- product unit is KG
            if v_purchase.rate_type = 'PER_BAG' then
              v_allocated_cost := (v_allocate / coalesce(v_purchase.bag_weight, 50)) * v_purchase.rate;
            elsif v_purchase.rate_type = 'PER_MAUND' then
              v_allocated_cost := (v_allocate / 40.0) * v_purchase.rate;
            else -- PER_KG
              v_allocated_cost := v_allocate * v_purchase.rate;
            end if;
          end if;

          v_total_cost := v_total_cost + v_allocated_cost;
          v_total_allocated := v_total_allocated + v_allocate;
          v_remaining_to_deduct := v_remaining_to_deduct - v_allocate;
        end loop;

        -- 4. Calculate and Update cost_rate on invoice_items
        if v_total_allocated > 0 then
          -- Convert cost to match the invoice item's rate_type
          declare
            v_item_cost_rate numeric := 0;
          begin
            if v_item.rate_type = 'PER_BAG' then
              if coalesce(v_item.bags, 0) > 0 then
                v_item_cost_rate := v_total_cost / v_item.bags;
              else
                -- Fallback to total weight based calculation if bags count is missing
                v_item_cost_rate := v_total_cost / v_total_allocated;
              end if;
            elsif v_item.rate_type = 'PER_MAUND' then
              v_item_cost_rate := v_total_cost / (v_item.quantity / 40.0);
            else -- PER_KG
              v_item_cost_rate := v_total_cost / v_item.quantity;
            end if;

            update public.invoice_items
            set cost_rate = round(v_item_cost_rate, 2)
            where id = v_item.id;
          end;
        else
          -- Fallback if no matching purchase exists: use product's default cost_price
          declare
            v_default_cost numeric;
          begin
            select cost_price into v_default_cost from public.products where id = v_item.product_id;
            update public.invoice_items
            set cost_rate = coalesce(v_default_cost, 0)
            where id = v_item.id;
          end;
        end if;
        
      end;
  end loop;

end;
$$;

-- 8) Core function: Complete Production Batch
create or replace function public.complete_production_batch(p_batch_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_batch_no text;
  v_status text;
  v_labor numeric;
  v_other numeric;
  v_method text;
  v_total_input_cost numeric := 0;
  v_total_output_weight numeric := 0;
  v_total_market_value numeric := 0;
  v_input_cost numeric;
  v_input record;
  v_output record;
  v_unit_cost numeric;
  v_stock_change numeric;
  v_unit text;
begin
  -- Authenticate checks
  if not public.is_accounts_or_admin() then
    raise exception 'Unauthorized to complete production batches.';
  end if;

  select batch_number, status, labor_charge, other_charges, costing_method
  into v_batch_no, v_status, v_labor, v_other, v_method
  from public.production_batches
  where id = p_batch_id;

  if v_status = 'COMPLETED' then
    raise exception 'Batch is already completed.';
  end if;

  -- A) Compute inputs cost: Sum of input costs (unit-aware)
  select coalesce(sum(
    case 
      when p.unit like 'Bag%' then i.bags * i.cost_price
      else i.quantity_kg * i.cost_price
    end
  ), 0)
  into v_input_cost
  from public.production_inputs i
  join public.products p on p.id = i.product_id
  where i.batch_id = p_batch_id;

  v_total_input_cost := v_input_cost + v_labor + v_other;

  -- B) Compute outputs weights and total market values
  select coalesce(sum(quantity_kg), 0)
  into v_total_output_weight
  from public.production_outputs
  where batch_id = p_batch_id;

  if v_total_output_weight <= 0 then
    raise exception 'Total output weight must be greater than 0 kg.';
  end if;

  select coalesce(sum(quantity_kg * market_value), 0)
  into v_total_market_value
  from public.production_outputs
  where batch_id = p_batch_id;

  -- C) Allocate costs to outputs & update inventory & cost rates
  for v_output in 
    select id, product_id, quantity_kg, market_value, configured_percentage, bag_weight, bags
    from public.production_outputs
    where batch_id = p_batch_id
  loop
    declare
      v_allocated numeric := 0;
      v_cost_per_kg numeric := 0;
      v_cost_price_unit numeric := 0;
    begin
      -- 1. Cost Allocation Math
      if v_method = 'WEIGHT_PROPORTION' then
        v_allocated := (v_output.quantity_kg / v_total_output_weight) * v_total_input_cost;
      elsif v_method = 'MARKET_VALUE' then
        if v_total_market_value > 0 then
          v_allocated := ((v_output.quantity_kg * v_output.market_value) / v_total_market_value) * v_total_input_cost;
        else
          -- Fallback if market value is 0
          v_allocated := (v_output.quantity_kg / v_total_output_weight) * v_total_input_cost;
        end if;
      elsif v_method = 'CONFIGURED_PERCENTAGE' then
        v_allocated := (v_output.configured_percentage / 100.0) * v_total_input_cost;
      end if;

      v_cost_per_kg := round(v_allocated / v_output.quantity_kg, 4);

      -- Update production output record
      update public.production_outputs
      set allocated_cost = round(v_allocated, 2),
          cost_per_kg = v_cost_per_kg
      where id = v_output.id;

      -- 2. Convert KG to Product's Stock Unit (Bags vs KG)
      select unit into v_unit from public.products where id = v_output.product_id;
      if v_unit like 'Bag%' and coalesce(v_output.bags, 0) > 0 then
        v_stock_change := v_output.bags;
      else
        v_stock_change := public.convert_kg_to_product_unit(v_output.product_id, v_output.quantity_kg);
      end if;

      -- 3. Increase Product current_stock
      update public.products
      set current_stock = current_stock + v_stock_change,
          updated_at = now()
      where id = v_output.product_id;

      -- 4. Set the new product cost price based on conversion
      -- E.g. if product unit is Bag (50kg), v_stock_change is bags count, cost price is per bag:
      -- Unit Cost Price = (Allocated Cost) / (Bags count)
      if v_stock_change > 0 then
        v_cost_price_unit := round(v_allocated / v_stock_change, 2);
        update public.products
        set cost_price = v_cost_price_unit
        where id = v_output.product_id;
      end if;

      -- 5. Record stock transaction
      insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
      values (v_output.product_id, v_stock_change, 'ADJUSTMENT', 'Production Batch Output #' || v_batch_no, p_batch_id, p_actor_id);
    end;
  end loop;

  -- D) Process inputs: Deduct from inventory & log stock transactions
  for v_input in
    select product_id, quantity_kg, bags
    from public.production_inputs
    where batch_id = p_batch_id
  loop
    declare
      v_input_unit text;
      v_stock_deduct numeric;
    begin
      select unit into v_input_unit from public.products where id = v_input.product_id;
      if v_input_unit like 'Bag%' and coalesce(v_input.bags, 0) > 0 then
        v_stock_deduct := v_input.bags;
      else
        v_stock_deduct := public.convert_kg_to_product_unit(v_input.product_id, v_input.quantity_kg);
      end if;

      -- Deduct from products
      update public.products
      set current_stock = current_stock - v_stock_deduct,
          updated_at = now()
      where id = v_input.product_id;

      -- Record stock transaction
      insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
      values (v_input.product_id, -v_stock_deduct, 'ADJUSTMENT', 'Production Batch Input #' || v_batch_no, p_batch_id, p_actor_id);
    end;
  end loop;

  -- E) Set batch header details & finalize status
  update public.production_batches
  set status = 'COMPLETED',
      total_input_cost = round(v_total_input_cost, 2),
      total_input_weight = round((select sum(quantity_kg) from public.production_inputs where batch_id = p_batch_id), 3),
      total_output_weight = round(v_total_output_weight, 3),
      updated_at = now()
  where id = p_batch_id;

  -- F) Log audit trail
  insert into public.audit_logs(actor_id, entity, entity_id, action, meta)
  values (p_actor_id, 'production_batch', p_batch_id, 'COMPLETE', jsonb_build_object('batch_number', v_batch_no, 'total_cost', v_total_input_cost));

end;
$$;

-- 9) Core function: Revert Production Batch to Draft
create or replace function public.revert_production_batch(p_batch_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_batch_no text;
  v_status text;
  v_input record;
  v_output record;
  v_unit text;
  v_stock_change numeric;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can revert completed production batches.';
  end if;

  select batch_number, status
  into v_batch_no, v_status
  from public.production_batches
  where id = p_batch_id;

  if v_status = 'DRAFT' then
    raise exception 'Batch is already in DRAFT state.';
  end if;

  -- A) Revert outputs stock additions
  for v_output in 
    select product_id, quantity_kg, bags
    from public.production_outputs
    where batch_id = p_batch_id
  loop
    select unit into v_unit from public.products where id = v_output.product_id;
    if v_unit like 'Bag%' and coalesce(v_output.bags, 0) > 0 then
      v_stock_change := v_output.bags;
    else
      v_stock_change := public.convert_kg_to_product_unit(v_output.product_id, v_output.quantity_kg);
    end if;

    update public.products
    set current_stock = current_stock - v_stock_change,
        updated_at = now()
    where id = v_output.product_id;
  end loop;

  -- B) Revert inputs stock deductions
  for v_input in 
    select product_id, quantity_kg, bags
    from public.production_inputs
    where batch_id = p_batch_id
  loop
    select unit into v_unit from public.products where id = v_input.product_id;
    if v_unit like 'Bag%' and coalesce(v_input.bags, 0) > 0 then
      v_stock_change := v_input.bags;
    else
      v_stock_change := public.convert_kg_to_product_unit(v_input.product_id, v_input.quantity_kg);
    end if;

    update public.products
    set current_stock = current_stock + v_stock_change,
        updated_at = now()
    where id = v_input.product_id;
  end loop;

  -- C) Delete associated stock transactions
  delete from public.stock_transactions
  where reference_id = p_batch_id;

  -- D) Clear costing allocations in outputs
  update public.production_outputs
  set allocated_cost = 0,
      cost_per_kg = 0
  where batch_id = p_batch_id;

  -- E) Revert batch status back to DRAFT
  update public.production_batches
  set status = 'DRAFT',
      updated_at = now()
  where id = p_batch_id;

  -- F) Log audit trail
  insert into public.audit_logs(actor_id, entity, entity_id, action, meta)
  values (p_actor_id, 'production_batch', p_batch_id, 'REVERT', jsonb_build_object('batch_number', v_batch_no));

end;
$$;

-- 10) Row Level Security (RLS) policies for Production Tables
alter table public.production_batches enable row level security;
alter table public.production_inputs enable row level security;
alter table public.production_outputs enable row level security;

-- Production Batches Policies
drop policy if exists "batches_read_all" on public.production_batches;
create policy "batches_read_all" on public.production_batches 
  for select using (auth.role() = 'authenticated');

drop policy if exists "batches_write_accounts_admin" on public.production_batches;
create policy "batches_write_accounts_admin" on public.production_batches 
  for insert with check (public.is_accounts_or_admin());

drop policy if exists "batches_update_accounts_admin" on public.production_batches;
create policy "batches_update_accounts_admin" on public.production_batches 
  for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());

drop policy if exists "batches_delete_admin" on public.production_batches;
create policy "batches_delete_admin" on public.production_batches 
  for delete using (public.is_admin());

-- Production Inputs Policies
drop policy if exists "inputs_read_all" on public.production_inputs;
create policy "inputs_read_all" on public.production_inputs 
  for select using (auth.role() = 'authenticated');

drop policy if exists "inputs_write_accounts_admin" on public.production_inputs;
create policy "inputs_write_accounts_admin" on public.production_inputs 
  for insert with check (public.is_accounts_or_admin());

drop policy if exists "inputs_update_accounts_admin" on public.production_inputs;
create policy "inputs_update_accounts_admin" on public.production_inputs 
  for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());

drop policy if exists "inputs_delete_accounts_admin" on public.production_inputs;
create policy "inputs_delete_accounts_admin" on public.production_inputs 
  for delete using (public.is_accounts_or_admin());

-- Production Outputs Policies
drop policy if exists "outputs_read_all" on public.production_outputs;
create policy "outputs_read_all" on public.production_outputs 
  for select using (auth.role() = 'authenticated');

drop policy if exists "outputs_write_accounts_admin" on public.production_outputs;
create policy "outputs_write_accounts_admin" on public.production_outputs 
  for insert with check (public.is_accounts_or_admin());

drop policy if exists "outputs_update_accounts_admin" on public.production_outputs;
create policy "outputs_update_accounts_admin" on public.production_outputs 
  for update using (public.is_accounts_or_admin()) with check (public.is_accounts_or_admin());

drop policy if exists "outputs_delete_accounts_admin" on public.production_outputs;
create policy "outputs_delete_accounts_admin" on public.production_outputs 
  for delete using (public.is_accounts_or_admin());


-- 11) PL/pgSQL block to safely seed products with inventory types
do $$
declare
  v_actor_id uuid;
begin
  -- Get first profile user if exists
  select id into v_actor_id from public.profiles limit 1;

  -- Miniket Paddy
  if not exists (select 1 from public.products where name = 'Miniket Paddy') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Miniket Paddy', 'PD-MK', 'Bag (60kg)', 0.00, 1200.00, 100.00, 'RAW_MATERIAL', v_actor_id);
  else
    update public.products set inventory_type = 'RAW_MATERIAL', unit = 'Bag (60kg)' where name = 'Miniket Paddy';
  end if;

  -- Purchased Unsorted Rice
  if not exists (select 1 from public.products where name = 'Purchased Unsorted Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Purchased Unsorted Rice', 'UR-PUR', 'Bag (50kg)', 0.00, 2500.00, 50.00, 'RAW_MATERIAL', v_actor_id);
  else
    update public.products set inventory_type = 'RAW_MATERIAL', unit = 'Bag (50kg)' where name = 'Purchased Unsorted Rice';
  end if;

  -- Produced Unsorted Rice
  if not exists (select 1 from public.products where name = 'Produced Unsorted Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Produced Unsorted Rice', 'UR-PROD', 'Bag (50kg)', 0.00, 2400.00, 0.00, 'SEMI_FINISHED', v_actor_id);
  else
    update public.products set inventory_type = 'SEMI_FINISHED', unit = 'Bag (50kg)' where name = 'Produced Unsorted Rice';
  end if;

  -- Premium Rice
  if not exists (select 1 from public.products where name = 'Premium Rice (Miniket)') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Premium Rice (Miniket)', 'PR-MK', 'Bag (50kg)', 3200.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Premium Rice (Miniket)';
  end if;

  -- Bran
  if not exists (select 1 from public.products where name = 'Rice Bran') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Rice Bran', 'BY-BRAN', 'Bag (25kg)', 400.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (25kg)' where name = 'Rice Bran';
  end if;

  -- Husk
  if not exists (select 1 from public.products where name = 'Rice Husk') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Rice Husk', 'BY-HUSK', 'Bag (25kg)', 150.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (25kg)' where name = 'Rice Husk';
  end if;

  -- Broken Rice
  if not exists (select 1 from public.products where name = 'Broken Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Broken Rice', 'BY-BROK', 'Bag (50kg)', 1200.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Broken Rice';
  end if;

  -- Khud
  if not exists (select 1 from public.products where name = 'Khud (Broken)') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Khud (Broken)', 'BY-KHUD', 'Bag (50kg)', 1000.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Khud (Broken)';
  end if;

  -- Mora
  if not exists (select 1 from public.products where name = 'Mora Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Mora Rice', 'BY-MORA', 'Bag (50kg)', 1100.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Mora Rice';
  end if;

  -- Mota
  if not exists (select 1 from public.products where name = 'Mota Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Mota Rice', 'BY-MOTA', 'Bag (50kg)', 1800.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Mota Rice';
  end if;

  -- Grader
  if not exists (select 1 from public.products where name = 'Grader Rice') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Grader Rice', 'BY-GRAD', 'Bag (50kg)', 2800.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Grader Rice';
  end if;

  -- Loose
  if not exists (select 1 from public.products where name = 'Loose Rice Stock') then
    insert into public.products (name, sku, unit, unit_price, cost_price, current_stock, inventory_type, created_by)
    values ('Loose Rice Stock', 'BY-LOOS', 'Bag (50kg)', 2500.00, 0.00, 0.00, 'FINISHED_GOOD', v_actor_id);
  else
    update public.products set inventory_type = 'FINISHED_GOOD', unit = 'Bag (50kg)' where name = 'Loose Rice Stock';
  end if;

end $$;

-- 12) Generalized purchase trigger to update stock correctly for any product (Paddy or Rice)
create or replace function public.after_paddy_purchase_insert()
returns trigger language plpgsql security definer as $$
declare
  v_unit text;
  v_add_stock numeric;
begin
  select unit into v_unit from public.products where id = new.product_id;
  
  -- If product is bag-based and purchase has bag counts, add bags to current_stock. Otherwise convert total weight.
  if v_unit like 'Bag%' and coalesce(new.bags, 0) > 0 then
    v_add_stock := new.bags;
  else
    v_add_stock := public.convert_kg_to_product_unit(new.product_id, new.total_weight);
  end if;

  -- Increase product current_stock
  update public.products
  set current_stock = current_stock + v_add_stock
  where id = new.product_id;

  -- Record stock transaction
  insert into public.stock_transactions(product_id, change_amount, transaction_type, reference, reference_id, created_by)
  values (new.product_id, v_add_stock, 'PURCHASE', 'Purchase #' || new.id, new.id, new.created_by);

  -- Set remaining stock on purchase
  update public.paddy_purchases
  set remaining_stock = v_add_stock
  where id = new.id;

  return new;
end;
$$;

-- Seed existing purchase records with initial remaining_stock
do $$
begin
  update public.paddy_purchases p
  set remaining_stock = case 
    when prod.unit like 'Bag%' and coalesce(p.bags, 0) > 0 then p.bags
    else public.convert_kg_to_product_unit(p.product_id, p.total_weight)
  end
  from public.products prod
  where p.product_id = prod.id and p.remaining_stock = 0;
end $$;

-- 13) Trigger to automatically deduct remaining purchase stock when stock is manually adjusted downwards
create or replace function public.after_stock_transaction_insert()
returns trigger language plpgsql security definer as $$
declare
  v_remaining_to_deduct numeric;
  v_purchase record;
  v_allocate numeric;
begin
  -- Only trigger for negative adjustments/deductions (excluding SALES which are handled in finalize_invoice)
  if new.change_amount < 0 and new.transaction_type = 'ADJUSTMENT' then
    v_remaining_to_deduct := abs(new.change_amount);
    
    for v_purchase in
      select id, remaining_stock
      from public.paddy_purchases
      where product_id = new.product_id and remaining_stock > 0
      order by purchase_date asc, created_at asc
    loop
      exit when v_remaining_to_deduct <= 0;
      
      v_allocate := least(v_remaining_to_deduct, v_purchase.remaining_stock);
      
      update public.paddy_purchases
      set remaining_stock = remaining_stock - v_allocate
      where id = v_purchase.id;
      
      v_remaining_to_deduct := v_remaining_to_deduct - v_allocate;
    end loop;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_after_stock_transaction_insert on public.stock_transactions;
create trigger trg_after_stock_transaction_insert
after insert on public.stock_transactions
for each row execute procedure public.after_stock_transaction_insert();

