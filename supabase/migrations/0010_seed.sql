-- 0010 Starting data: company settings, chart of accounts, a warehouse, common items

insert into public.company_settings (id, name, name_bn) values (1, 'My Rice Mill & Trading', 'আমার রাইস মিল ও ট্রেডিং')
on conflict (id) do nothing;

insert into public.accounts (code, name, name_bn, type, subtype, is_system) values
  -- Assets
  ('1000', 'Cash in Hand',            'হাতে নগদ',            'ASSET',     'CASH',             true),
  ('1100', 'Accounts Receivable',     'পাওনা (দেনাদার)',      'ASSET',     'RECEIVABLE',       true),
  ('1200', 'Stock (Inventory)',       'মজুদ মাল',            'ASSET',     'INVENTORY',        true),
  ('1210', 'Production in Process',   'চলমান উৎপাদন',        'ASSET',     'WIP',              true),
  ('1300', 'Loans Given',             'প্রদত্ত ঋণ',           'ASSET',     'LOAN_RECEIVABLE',  true),
  -- Liabilities
  ('2000', 'Accounts Payable',        'দেনা (পাওনাদার)',      'LIABILITY', 'PAYABLE',          true),
  ('2100', 'Loans Taken',             'গৃহীত ঋণ',            'LIABILITY', 'LOAN_PAYABLE',     true),
  -- Equity
  ('3000', 'Owner Capital',           'মালিকের মূলধন',        'EQUITY',    'CAPITAL',          true),
  ('3100', 'Owner Drawings',          'মালিকের উত্তোলন',      'EQUITY',    'DRAWINGS',         true),
  ('3900', 'Opening Balance Equity',  'প্রারম্ভিক জের',        'EQUITY',    'OPENING_EQUITY',   true),
  -- Income
  ('4000', 'Sales',                   'বিক্রয়',              'INCOME',    'SALES',            true),
  ('4010', 'Sales Returns',           'বিক্রয় ফেরত',          'INCOME',    'SALES_RETURN',     true),
  ('4100', 'Other Income',            'অন্যান্য আয়',          'INCOME',    'OTHER_INCOME',     true),
  -- Expenses
  ('5000', 'Cost of Goods Sold',      'বিক্রিত মালের খরচ',    'EXPENSE',   'COGS',             true),
  ('5010', 'Stock Gain / Loss',       'মজুদ ঘাটতি/বাড়তি',     'EXPENSE',   'STOCK_ADJUSTMENT', true),
  ('5020', 'Broker Commission',       'দালালি কমিশন',        'EXPENSE',   'COMMISSION',       true),
  ('6000', 'Labour',                  'শ্রমিক মজুরি',         'EXPENSE',   'EXPENSE',          false),
  ('6010', 'Fuel (Husk / Wood / Coal)', 'জ্বালানি',            'EXPENSE',   'EXPENSE',          false),
  ('6020', 'Electricity',             'বিদ্যুৎ বিল',          'EXPENSE',   'EXPENSE',          false),
  ('6030', 'Transport',               'পরিবহন',              'EXPENSE',   'EXPENSE',          false),
  ('6040', 'Salaries',                'বেতন',                'EXPENSE',   'EXPENSE',          false),
  ('6050', 'Machine Repair',          'মেশিন মেরামত',         'EXPENSE',   'EXPENSE',          false),
  ('6060', 'Rent',                    'ভাড়া',               'EXPENSE',   'EXPENSE',          false),
  ('6070', 'Empty Sacks / Packaging', 'খালি বস্তা',           'EXPENSE',   'EXPENSE',          false),
  ('6080', 'Office & Mobile',         'অফিস ও মোবাইল',       'EXPENSE',   'EXPENSE',          false),
  ('6090', 'Bank Charges & Interest', 'ব্যাংক চার্জ ও সুদ',     'EXPENSE',   'EXPENSE',          false),
  ('6100', 'Licence, Tax & Fees',     'লাইসেন্স, কর ও ফি',     'EXPENSE',   'EXPENSE',          false),
  ('6900', 'Miscellaneous',           'বিবিধ',               'EXPENSE',   'EXPENSE',          false);

insert into public.warehouses (name, name_bn, location) values ('Main Godown', 'প্রধান গুদাম', 'Mill premises');

insert into public.items (code, name, name_bn, category, default_bag_kg, standard_price) values
  ('P-01', 'Paddy (Coarse)',  'ধান (মোটা)',      'PADDY',     75, 0),
  ('P-02', 'Paddy (Fine)',    'ধান (চিকন)',      'PADDY',     75, 0),
  ('R-01', 'Rice (Coarse)',   'চাল (মোটা)',      'RICE',      50, 50),
  ('R-02', 'Rice (Fine)',     'চাল (চিকন)',      'RICE',      50, 70),
  ('B-01', 'Broken Rice',     'খুদ',            'BYPRODUCT', 50, 30),
  ('B-02', 'Rice Bran',       'কুঁড়া',          'BYPRODUCT', 40, 20),
  ('B-03', 'Husk',            'তুষ',            'BYPRODUCT', 30, 4),
  ('K-01', 'Empty Sack',      'খালি বস্তা',       'PACKAGING', 0,  0);
