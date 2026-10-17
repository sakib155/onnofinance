import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { nameOf, PrintButton, WarehouseSelect } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { kg, money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ITEM_CATEGORIES, type ItemCategory } from '@/lib/types'

type StockRow = {
  item_id: string
  item_name: string
  item_name_bn: string | null
  category: ItemCategory
  warehouse_id: string
  warehouse_name: string
  warehouse_name_bn: string | null
  qty_kg: number
  bags: number
  value: number
  avg_cost: number
  reorder_level_kg: number | null
}

export function useStockSummary() {
  return useData<StockRow[]>(['stock-summary'], () => supabase.from('v_stock_summary').select('*').order('item_name'))
}

export function StockPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [warehouse, setWarehouse] = useState('')
  const [category, setCategory] = useState('')
  const [byWarehouse, setByWarehouse] = useState(false)
  const { data, isLoading } = useStockSummary()
  const showValue = can('books')

  const rows = useMemo(() => {
    const filtered = (data ?? []).filter((r) => (!warehouse || r.warehouse_id === warehouse) && (!category || r.category === category))
    if (byWarehouse || warehouse) return filtered
    // combine warehouses per item
    const map = new Map<string, StockRow>()
    for (const r of filtered) {
      const m = map.get(r.item_id)
      if (m) {
        m.qty_kg = num(m.qty_kg) + num(r.qty_kg)
        m.bags = num(m.bags) + num(r.bags)
        m.value = num(m.value) + num(r.value)
        m.avg_cost = num(m.qty_kg) ? num(m.value) / num(m.qty_kg) : 0
      } else map.set(r.item_id, { ...r, warehouse_name: '', warehouse_name_bn: null })
    }
    return [...map.values()]
  }, [data, warehouse, category, byWarehouse])

  const byCat = (c: ItemCategory) => rows.filter((r) => r.category === c).reduce((s, r) => s + num(r.qty_kg), 0)
  const totalValue = rows.reduce((s, r) => s + num(r.value), 0)

  return (
    <>
      <PrintHeader title={t('nav.stockSummary')} />
      <PageHeader title={t('nav.stockSummary')} subtitle={t('stock.subtitle')} actions={<PrintButton />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t('category.PADDY')} value={kg(byCat('PADDY'))} />
        <Stat label={t('category.UNSORTED')} value={kg(byCat('UNSORTED'))} />
        <Stat label={t('category.RICE')} value={kg(byCat('RICE'))} />
        <Stat label={t('category.BYPRODUCT')} value={kg(byCat('BYPRODUCT'))} />
        {showValue && <Stat label={t('stock.totalValue')} value={money(totalValue)} />}
      </div>
      <Card padded={false}>
        <div className="no-print flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="w-48">
            <WarehouseSelect value={warehouse} onChange={setWarehouse} allowAll />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">{t('stock.allCategories')}</option>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </Select>
          {!warehouse && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={byWarehouse} onChange={(e) => setByWarehouse(e.target.checked)} className="accent-brand-700" />
              {t('stock.splitByWarehouse')}
            </label>
          )}
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => `${r.item_id}-${r.warehouse_id}`}
          onRowClick={(r) => navigate(`/stock/lots?item=${r.item_id}${byWarehouse || warehouse ? `&warehouse=${r.warehouse_id}` : ''}`)}
          empty={t('stock.empty')}
          columns={[
            {
              key: 'item',
              header: t('common.item'),
              cell: (r) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{nameOf({ name: r.item_name, name_bn: r.item_name_bn })}</span>
                  {r.reorder_level_kg != null && num(r.qty_kg) < num(r.reorder_level_kg) && (
                    <Badge tone="amber">
                      <AlertTriangle className="mr-1 size-3" />
                      {t('stock.low')}
                    </Badge>
                  )}
                </div>
              ),
            },
            { key: 'cat', header: t('items.category'), cell: (r) => t(`category.${r.category}`) },
            ...(byWarehouse || warehouse
              ? [{ key: 'wh', header: t('stock.warehouse'), cell: (r: StockRow) => nameOf({ name: r.warehouse_name, name_bn: r.warehouse_name_bn }) }]
              : []),
            { key: 'bags', header: t('unit.bags'), align: 'right', cell: (r) => qty(r.bags) },
            { key: 'kg', header: t('unit.kg'), align: 'right', cell: (r) => <span className="font-medium">{qty(r.qty_kg)}</span> },
            ...(showValue
              ? [
                  { key: 'avg', header: t('stock.avgCost'), align: 'right' as const, cell: (r: StockRow) => money(r.avg_cost) },
                  { key: 'val', header: t('stock.value'), align: 'right' as const, cell: (r: StockRow) => money(r.value), footer: money(totalValue) },
                ]
              : []),
          ]}
        />
      </Card>
    </>
  )
}
