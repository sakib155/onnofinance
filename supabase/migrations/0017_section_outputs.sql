-- 0017 What comes out of each mill section, in the mill's own words.
--   Dryer  (paddy in):         unsorted rice + Tush, Kura, Khud, Mora, Tamri
--   Sorter (unsorted rice in): sorted rice  + Khud, Mora, Mota, Grader, Dust, Loose Stock
-- Each item records which section(s) it comes out of; finishing a batch pre-fills those items.
-- Safe to run again. Names are only changed while they are still the original starter names,
-- and prices are only set on the newly added items.

alter table public.items add column if not exists output_of text[] not null default '{}';
alter table public.items drop constraint if exists items_output_of_check;
alter table public.items add constraint items_output_of_check check (output_of <@ array['DRYER', 'SORTER']);

-- Starter by-products renamed to the mill's terms (only if nobody renamed them yet)
update public.items set name = 'Khud (Broken Rice)' where code = 'B-01' and name = 'Broken Rice';
update public.items set name = 'Kura (Rice Bran)'   where code = 'B-02' and name = 'Rice Bran';
update public.items set name = 'Tush (Husk)'        where code = 'B-03' and name = 'Husk';

-- New by-products. Starting prices per kg are from the mill's own batch sheet
-- (Mora ৳1,300, Mota ৳3,000, Grader ৳6,000, Loose Stock ৳5,000 per 50 kg); edit them in Items.
insert into public.items (code, name, name_bn, category, default_bag_kg, standard_price) values
  ('B-05', 'Mora (Dead Rice)', 'মরা চাল',   'BYPRODUCT', 50, 26),
  ('B-06', 'Tamri',            'তামরি',     'BYPRODUCT', 50, 0),
  ('B-07', 'Mota',             'মোটা',      'BYPRODUCT', 50, 60),
  ('B-08', 'Grader',           'গ্রেডার',    'BYPRODUCT', 50, 120),
  ('B-09', 'Dust',             'ডাস্ট',      'BYPRODUCT', 50, 0),
  ('B-10', 'Loose Stock',      'লুজ স্টক',   'BYPRODUCT', 50, 100)
on conflict (code) do nothing;

-- Which section each starter item comes out of (only where nothing has been set yet)
update public.items set output_of = v.sections
from (values
  ('U-01', array['DRYER']), ('U-02', array['DRYER']),
  ('R-01', array['SORTER']), ('R-02', array['SORTER']),
  ('B-03', array['DRYER']),            -- Tush
  ('B-02', array['DRYER']),            -- Kura
  ('B-01', array['DRYER', 'SORTER']),  -- Khud
  ('B-05', array['DRYER', 'SORTER']),  -- Mora
  ('B-06', array['DRYER']),            -- Tamri
  ('B-07', array['SORTER']),           -- Mota
  ('B-08', array['SORTER']),           -- Grader
  ('B-09', array['SORTER']),           -- Dust
  ('B-10', array['SORTER'])            -- Loose Stock
) as v(code, sections)
where items.code = v.code and items.output_of = '{}';
