-- 0019 Supplier yield: which paddy (and unsorted rice) suppliers give the cheapest rice.
--   Cheap paddy with a low yield can cost more per kg of rice than dearer paddy with a high yield,
--   so suppliers are ranked by what their material actually produced, not by purchase price.
--   * Finished batches in the period, per section (DRYER = paddy, SORTER = unsorted rice).
--   * A batch that mixed several suppliers' lots is shared out by the kg of material each supplied:
--     its main product, by-products, by-product value and its other costs (fuel, labour, consumables).
--     Each supplier keeps the actual cost of its own lots.
--   * Material that did not come from a purchase is shown as its own row: our own dryer output
--     (origin PRODUCTION) or opening / adjusted stock.
--   * cheaper_but_dearer marks a supplier whose material was cheaper to buy than another's in the same
--     section but gave dearer rice; beaten_by names the supplier whose dearer material gave the cheapest rice.
-- Safe to run again.

drop function if exists public.report_supplier_yield(date, date);
create function public.report_supplier_yield(p_from date, p_to date)
returns table (
  kind text,
  supplier_id uuid,
  supplier_name text,
  supplier_name_bn text,
  origin_type text,
  material_kg numeric,
  batches bigint,
  mixed_batches bigint,
  material_cost numeric,
  purchase_cost_per_kg numeric,
  main_kg numeric,
  main_yield_pct numeric,
  byproduct_kg numeric,
  byproduct_value numeric,
  other_cost numeric,
  main_cost numeric,
  main_cost_per_kg numeric,
  rank bigint,
  cheaper_but_dearer boolean,
  beaten_by text,
  beaten_by_bn text
)
language sql stable security invoker set search_path = public as $$
  with b as (
    select v.id, v.kind, v.total_cost, v.main_kg, v.byproduct_kg, v.byproduct_value
    from public.v_production_batches v
    where v.status = 'COMPLETED' and v.completed_date between p_from and p_to
  ),
  -- the material each batch used, by where it came from
  used as (
    select b.id as batch_id, b.kind, il.supplier_id, il.supplier_name, il.supplier_name_bn,
      case when il.supplier_id is null then il.origin_type end as origin_type,
      sum(il.qty_kg) as kg, sum(il.cost) as cost
    from b join public.v_batch_input_lots il on il.batch_id = b.id and il.purpose = 'MATERIAL'
    group by 1, 2, 3, 4, 5, 6
  ),
  share as (
    select u.*,
      u.kg / sum(u.kg) over (partition by u.batch_id) as part,
      count(*) over (partition by u.batch_id) > 1 as mixed,
      sum(u.cost) over (partition by u.batch_id) as batch_material_cost
    from used u
  ),
  per as (
    select s.kind, s.supplier_id, max(s.supplier_name) as supplier_name, max(s.supplier_name_bn) as supplier_name_bn, s.origin_type,
      sum(s.kg) as material_kg,
      count(distinct s.batch_id) as batches,
      count(distinct s.batch_id) filter (where s.mixed) as mixed_batches,
      sum(s.cost) as material_cost,
      sum(s.part * b.main_kg) as main_kg,
      sum(s.part * b.byproduct_kg) as byproduct_kg,
      sum(s.part * coalesce(b.byproduct_value, 0)) as byproduct_value,
      sum(s.part * (b.total_cost - s.batch_material_cost)) as other_cost
    from share s join b on b.id = s.batch_id
    group by s.kind, s.supplier_id, s.origin_type
  ),
  r as (
    select p.*,
      p.material_cost + p.other_cost - p.byproduct_value as main_cost,
      case when p.material_kg > 0 then p.material_cost / p.material_kg end as purchase_cost_per_kg,
      case when p.main_kg > 0 then (p.material_cost + p.other_cost - p.byproduct_value) / p.main_kg end as main_cost_per_kg
    from per p
  )
  select r.kind, r.supplier_id, r.supplier_name, r.supplier_name_bn, r.origin_type,
    round(r.material_kg, 2), r.batches, r.mixed_batches,
    round(r.material_cost, 2), round(r.purchase_cost_per_kg, 4),
    round(r.main_kg, 2),
    case when r.material_kg > 0 then round(100 * r.main_kg / r.material_kg, 2) end,
    round(r.byproduct_kg, 2), round(r.byproduct_value, 2), round(r.other_cost, 2),
    round(r.main_cost, 2), round(r.main_cost_per_kg, 4),
    rank() over (partition by r.kind order by r.main_cost_per_kg nulls last),
    x.supplier_name is not null,
    x.supplier_name, x.supplier_name_bn
  from r
  left join lateral (
    select o.supplier_name, o.supplier_name_bn from r o
    where o.kind = r.kind and o.supplier_id is not null and r.supplier_id is not null
      and o.purchase_cost_per_kg > r.purchase_cost_per_kg and o.main_cost_per_kg < r.main_cost_per_kg
    order by o.main_cost_per_kg limit 1
  ) x on true
  order by r.kind, r.main_cost_per_kg nulls last, r.supplier_name
$$;

revoke execute on function public.report_supplier_yield(date, date) from public, anon;
grant execute on function public.report_supplier_yield(date, date) to authenticated;
