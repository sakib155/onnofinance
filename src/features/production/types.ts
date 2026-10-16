import type { Item, ProductionStatus, Stage } from '@/lib/types'

export type Batch = {
  id: string
  batch_no: string
  start_date: string
  status: ProductionStatus
  input_warehouse_id: string
  output_warehouse_id: string
  input_warehouse_name: string
  output_warehouse_name: string
  notes: string | null
  input_kg: number
  input_cost: number
  processing_cost: number
  total_cost: number
  output_kg: number
  rice_kg: number
  byproduct_kg: number
  rice_yield_pct: number | null
  total_yield_pct: number | null
  rice_cost_per_kg: number | null
  completed_date: string | null
}

export type BatchInput = { id: string; item_id: string; lot_id: string | null; bags: number; qty_kg: number; cost: number; item: Item; lot: { lot_no: string } | null }

export type BatchStage = {
  id: string
  stage: Stage
  start_date: string | null
  end_date: string | null
  input_kg: number | null
  output_kg: number | null
  moisture_pct: number | null
  notes: string | null
}

export type BatchCost = {
  id: string
  stage: Stage | 'GENERAL'
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

export const statusTone = (s: ProductionStatus) =>
  (({ SOAKING: 'blue', DRYING: 'amber', MILLING: 'violet', COMPLETED: 'green', CANCELLED: 'red' }) as const)[s]
