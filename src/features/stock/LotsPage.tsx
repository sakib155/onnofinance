import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { ItemPicker, nameOf, WarehouseSelect } from '@/components/common'
import { Checkbox } from '@/components/ui/form'
import { Badge, Card, PageHeader } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { sourceLink } from '@/features/reports/Ledger'
import { useData } from '@/lib/data'
import { date, money, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Lot } from '@/lib/types'

type Movement = {
  id: number
  movement_date: string
  qty_kg: number
  bags: number
  value: number
  source_type: string
  source_id: string
  note: string | null
}

export const sourceTone = (s: string) =>
  (({ PURCHASE: 'amber', PRODUCTION: 'green', SALE: 'blue', TRANSFER: 'violet', PRODUCTION_INPUT: 'green' }) as const)[s] ?? 'slate'

function LotHistory({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { t } = useTranslation()
  const { data, isLoading } = useData<Movement[]>(['lot-moves', lot.id], () =>
    supabase.from('stock_movements').select('*').eq('lot_id', lot.id).order('movement_date').order('id'),
  )
  const rows = (data ?? []).reduce<(Movement & { balance: number })[]>(
    (acc, m) => [...acc, { ...m, balance: (acc.at(-1)?.balance ?? 0) + Number(m.qty_kg) }],
    [],
  )
  return (
    <Modal open onClose={onClose} title={`${lot.lot_no} · ${nameOf({ name: lot.item_name, name_bn: lot.item_name_bn })}`} size="lg">
      <Table
        loading={isLoading}
        rows={rows}
        rowKey={(m) => String(m.id)}
        columns={[
          { key: 'date', phone: 'sub', header: t('common.date'), cell: (m) => date(m.movement_date) },
          {
            key: 'src',
            phone: 'title',
            header: t('stock.movement'),
            cell: (m) => {
              const link = sourceLink(m.source_type, m.source_id)
              const label = <Badge tone={sourceTone(m.source_type)}>{t(`source.${m.source_type}`)}</Badge>
              return (
                <span className="flex items-center gap-2">
                  {link ? <Link to={link}>{label}</Link> : label}
                  <span className="text-xs text-slate-500">{m.note}</span>
                </span>
              )
            },
          },
          { key: 'in', header: t('stock.in'), align: 'right', cell: (m) => (m.qty_kg > 0 ? qty(m.qty_kg) : '') },
          { key: 'out', header: t('stock.out'), align: 'right', cell: (m) => (m.qty_kg < 0 ? qty(-m.qty_kg) : '') },
          {
            key: 'bal',
            phone: 'value',
            header: t('common.balance'),
            align: 'right',
            cell: (m) => qty(m.balance),
          },
        ]}
      />
    </Modal>
  )
}

export function LotsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const [params, setParams] = useSearchParams()
  const item = params.get('item') ?? ''
  const warehouse = params.get('warehouse') ?? ''
  const [openOnly, setOpenOnly] = useState(true)
  const [viewing, setViewing] = useState<Lot | null>(null)
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  const { data, isLoading } = useData<Lot[]>(['lots', item, warehouse, openOnly], () => {
    let q = supabase.from('v_lots').select('*').order('received_date', { ascending: false }).limit(500)
    if (item) q = q.eq('item_id', item)
    if (warehouse) q = q.eq('warehouse_id', warehouse)
    if (openOnly) q = q.gt('remaining_kg', 0.0005)
    return q
  })

  return (
    <>
      <PageHeader title={t('nav.lots')} subtitle={t('stock.lotsSubtitle')} />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="w-60">
            <ItemPicker value={item} onChange={(v) => setParam('item', v)} />
          </div>
          <div className="w-48">
            <WarehouseSelect value={warehouse} onChange={(v) => setParam('warehouse', v)} allowAll />
          </div>
          <Checkbox label={t('stock.withStockOnly')} checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        </div>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(l) => l.id}
          onRowClick={setViewing}
          columns={[
            { key: 'lot', phone: 'sub', header: t('stock.lot'), cell: (l) => <span className="font-medium whitespace-nowrap">{l.lot_no}</span> },
            { key: 'date', phone: 'sub', header: t('common.date'), cell: (l) => date(l.received_date) },
            { key: 'item', phone: 'title', header: t('common.item'), cell: (l) => nameOf({ name: l.item_name, name_bn: l.item_name_bn }) },
            { key: 'wh', header: t('stock.warehouse'), cell: (l) => l.warehouse_name },
            { key: 'src', header: t('stock.source'), cell: (l) => <Badge tone={sourceTone(l.source_type)}>{t(`source.${l.source_type}`)}</Badge> },
            {
              key: 'from',
              header: t('stock.from'),
              cell: (l) => (
                <span className="text-xs">
                  {l.supplier_name ? <span className="font-medium text-slate-700">{nameOf({ name: l.supplier_name, name_bn: l.supplier_name_bn })}</span> : null}
                  {l.origin_no && <span className="block text-slate-500">{l.origin_no}</span>}
                </span>
              ),
            },
            { key: 'in', header: t('stock.received'), align: 'right', cell: (l) => qty(l.qty_kg) },
            { key: 'left', phone: 'value', header: t('stock.remaining'), align: 'right', cell: (l) => <span className="font-medium">{qty(l.remaining_kg)}</span> },
            { key: 'bags', header: t('unit.bags'), align: 'right', cell: (l) => qty(l.remaining_bags) },
            ...(can('books') ? [{ key: 'cost', header: t('trading.costPerKg'), align: 'right' as const, cell: (l: Lot) => money(l.unit_cost) }] : []),
          ]}
        />
      </Card>
      {viewing && <LotHistory lot={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
