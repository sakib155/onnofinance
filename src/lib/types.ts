export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PURCHASER', 'SALES', 'PRODUCTION', 'OPERATOR', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED'

export type Profile = {
  id: string
  full_name: string
  email: string | null
  role: Role
  status: MemberStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'

export type Account = {
  id: string
  code: string
  name: string
  name_bn: string | null
  type: AccountType
  subtype: string
  is_system: boolean
  is_active: boolean
  bank_name: string | null
  branch: string | null
  account_no: string | null
  opening_balance: number
  opening_date: string
  balance?: number
}

export const PARTY_TYPES = ['CUSTOMER', 'SUPPLIER', 'BROKER', 'TRANSPORTER', 'LENDER', 'EMPLOYEE', 'OTHER'] as const
export type PartyType = (typeof PARTY_TYPES)[number]

export type Party = {
  id: string
  code: string | null
  name: string
  name_bn: string | null
  phone: string | null
  address: string | null
  types: PartyType[]
  opening_balance: number
  opening_date: string
  credit_limit: number | null
  notes: string | null
  is_active: boolean
  balance?: number
}

export const ITEM_CATEGORIES = ['PADDY', 'UNSORTED', 'RICE', 'BYPRODUCT', 'PACKAGING', 'OTHER'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export type Item = {
  id: string
  code: string | null
  name: string
  name_bn: string | null
  category: ItemCategory
  default_bag_kg: number
  standard_price: number
  reorder_level_kg: number | null
  is_active: boolean
  output_of: MillSection[] // the mill sections this item comes out of
}

export type MillSection = 'DRYER' | 'SORTER'

export type Warehouse = {
  id: string
  name: string
  name_bn: string | null
  location: string | null
  is_active: boolean
}

export type Lot = {
  id: string
  lot_no: string
  item_id: string
  item_name: string
  item_name_bn: string | null
  category: ItemCategory
  warehouse_id: string
  warehouse_name: string
  source_type: string
  source_id: string
  received_date: string
  qty_kg: number
  bags: number
  bag_size_kg: number
  unit_cost: number
  remaining_kg: number
  remaining_bags: number
  // where the stock first came from (followed back through godown transfers)
  origin_type: string
  origin_no: string | null
  supplier_id: string | null
  supplier_name: string | null
  supplier_name_bn: string | null
}

// Shown wherever a lot is listed: the supplier for bought stock, else the purchase/batch it came from
export const lotOrigin = (l: Pick<Lot, 'supplier_name' | 'supplier_name_bn' | 'origin_no'>, bn: boolean) =>
  (bn && l.supplier_name_bn) || l.supplier_name || l.origin_no || ''

export type RateUnit = 'KG' | 'BAG'

export type MoneyTxnType =
  | 'RECEIPT'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'CAPITAL_IN'
  | 'DRAWING'
  | 'LOAN_TAKEN'
  | 'LOAN_REPAY'
  | 'LOAN_GIVEN'
  | 'LOAN_RECOVER'

export type ProductionStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED'
