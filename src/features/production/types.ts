import type { Item, ProductionStatus } from '@/lib/types'

export type BatchKind = 'DRYER' | 'SORTER'

// What each section takes in as material and gives out as its main product
export const SECTION = {
  DRYER: { material: 'PADDY', main: 'UNSORTED' },
  SORTER: { material: 'UNSORTED', main: 'RICE' },
} as const

export type Batch = {
  id: string
  batch_no: string
  kind: BatchKind
  start_date: string
  status: ProductionStatus
  input_warehouse_id: string
  output_warehouse_id: string
  input_warehouse_name: string
  output_warehouse_name: string
  notes: string | null
  input_kg: number
  input_cost: number
  material_cost: number
  consumable_cost: number
  processing_cost: number
  total_cost: number
  output_kg: number
  main_kg: number
  main_cost: number
  byproduct_kg: number
  byproduct_value: number
  main_yield_pct: number | null
  total_yield_pct: number | null
  main_cost_per_kg: number | null
  completed_date: string | null
}

export type BatchInput = {
  id: string
  item_id: string
  lot_id: string | null
  bags: number
  qty_kg: number
  cost: number
  purpose: 'MATERIAL' | 'CONSUMABLE'
  item: Item
  lot: { lot_no: string; source_type: string } | null
}

export type BatchCost = {
  id: string
  stage: string
  cost_date: string
  cost_head_id: string
  amount: number
  paid_account_id: string | null
  party_id: string | null
  notes: string | null
  head: { name: string; name_bn: string | null }
  paid: { name: string } | null
  party: { name: string } | null
}

export type BatchOutput = {
  id: string
  item_id: string
  bags: number
  bag_size_kg: number
  qty_kg: number
  cost_share: number
  unit_cost: number
  item: Item
  lot: { lot_no: string } | null
}

export const statusTone = (s: ProductionStatus) => (({ RUNNING: 'blue', COMPLETED: 'green', CANCELLED: 'red' }) as const)[s]
export const kindTone = (k: BatchKind) => (k === 'DRYER' ? 'amber' : 'violet')
