import { ArrowLeftRight, Scale, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { DateRange, ItemPicker, LotPicker, nameOf, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, Card, ErrorBox, PageHeader } from '@/components/ui/layout'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { sourceLink } from '@/features/reports/Ledger'
import { rpc, useData, useItems, useSave } from '@/lib/data'
import { date, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { sourceTone } from './LotsPage'

type MoveRow = {
  id: number
  movement_date: string
  qty_kg: number
  bags: number
  value: number
  source_type: string
  source_id: string
  note: string | null
  item: { name: string; name_bn: string | null }
  warehouse: { name: string }
  lot: { lot_no: string } | null
}

function TransferForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({ transfer_date: today(), item_id: '', from_warehouse_id: '', to_warehouse_id: '', lot_id: '', bags: '', qty_kg: '', notes: '' })
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  const save = useSave(() => rpc('save_stock_transfer', { p: { ...v, bags: num(v.bags), qty_kg: num(v.qty_kg) } }))
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stock.newTransfer')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast(t('common.saved')), onClose()) })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.date')}>
          <Input type="date" value={v.transfer_date} onChange={(e) => set('transfer_date')(e.target.value)} />
        </Field>
        <Field label={t('common.item')}>
          <ItemPicker value={v.item_id} onChange={set('item_id')} />
        </Field>
        <Field label={t('stock.fromWarehouse')}>
          <WarehouseSelect value={v.from_warehouse_id} onChange={set('from_warehouse_id')} />
        </Field>
        <Field label={t('stock.toWarehouse')}>
          <WarehouseSelect value={v.to_warehouse_id} onChange={set('to_warehouse_id')} />
        </Field>
        <Field label={t('stock.lot')} className="sm:col-span-2">
          <LotPicker itemId={v.item_id} warehouseId={v.from_warehouse_id} value={v.lot_id} onChange={set('lot_id')} />
        </Field>
        <Field label={t('unit.bags')}>
          <Input type="number" min="0" value={v.bags} onChange={(e) => set('bags')(e.target.value)} />
        </Field>
        <Field label={t('trading.weightKg')}>
          <Input type="number" min="0" step="0.001" value={v.qty_kg} onChange={(e) => set('qty_kg')(e.target.value)} />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

function AdjustmentForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: items } = useItems()
  const [v, setV] = useState({
    adjustment_date: today(),
    kind: 'LOSS',
    item_id: '',
    warehouse_id: '',
    lot_id: '',
    bags: '',
    bag_size_kg: '',
    qty_kg: '',
    unit_cost: '',
    reason: '',
  })
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  const save = useSave(() =>
    rpc('save_stock_adjustment', { p: { ...v, bags: num(v.bags), bag_size_kg: num(v.bag_size_kg), qty_kg: num(v.qty_kg), unit_cost: num(v.unit_cost) } }),
  )
  const adding = v.kind !== 'LOSS'
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stock.newAdjustment')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast(t('common.saved')), onClose()) })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('stock.adjustmentKind')} className="sm:col-span-2" hint={t(`stock.adjustHelp.${v.kind}`)}>
          <Select value={v.kind} onChange={(e) => set('kind')(e.target.value)}>
            {['LOSS', 'GAIN', 'OPENING'].map((k) => (
              <option key={k} value={k}>
                {t(`stock.adjust.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.date')}>
          <Input type="date" value={v.adjustment_date} onChange={(e) => set('adjustment_date')(e.target.value)} />
        </Field>
        <Field label={t('stock.warehouse')}>
          <WarehouseSelect value={v.warehouse_id} onChange={set('warehouse_id')} />
        </Field>
        <Field label={t('common.item')}>
          <ItemPicker
            value={v.item_id}
            onChange={(id) => {
              const it = items?.find((i) => i.id === id)
              setV((s) => ({
                ...s,
                item_id: id,
                lot_id: '',
                bag_size_kg: s.bag_size_kg || String(it?.default_bag_kg ?? ''),
                unit_cost: s.unit_cost || String(it?.standard_price ?? ''),
              }))
            }}
          />
        </Field>
        {!adding && (
          <Field label={t('stock.lot')}>
            <LotPicker itemId={v.item_id} warehouseId={v.warehouse_id} value={v.lot_id} onChange={set('lot_id')} />
          </Field>
        )}
        <Field label={t('unit.bags')}>
          <Input type="number" min="0" value={v.bags} onChange={(e) => set('bags')(e.target.value)} />
        </Field>
        {adding && (
          <Field label={t('trading.bagSize')}>
            <Input type="number" min="0" value={v.bag_size_kg} onChange={(e) => set('bag_size_kg')(e.target.value)} />
          </Field>
        )}
        <Field label={t('trading.weightKg')}>
          <Input type="number" min="0" step="0.001" value={v.qty_kg} onChange={(e) => set('qty_kg')(e.target.value)} />
        </Field>
        {adding && (
          <Field label={t('trading.costPerKg')} hint={v.qty_kg && v.unit_cost ? `${t('stock.value')}: ${money(num(v.qty_kg) * num(v.unit_cost))}` : undefined}>
            <Input type="number" min="0" step="0.01" value={v.unit_cost} onChange={(e) => set('unit_cost')(e.target.value)} />
          </Field>
        )}
        <Field label={t('returns.reason')} className="sm:col-span-2">
          <Textarea value={v.reason} onChange={(e) => set('reason')(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

// Transfers and adjustments are deleted through their own functions
const deletable: Record<string, string> = { TRANSFER: 'delete_stock_transfer', ADJUSTMENT: 'delete_stock_adjustment' }

export function StockMovesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [item, setItem] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [form, setForm] = useState<'transfer' | 'adjust' | null>(null)
  const [deleting, setDeleting] = useState<MoveRow | null>(null)
  const { data, isLoading } = useData<MoveRow[]>(['moves', from, to, item, warehouse], () => {
    let q = supabase
      .from('stock_movements')
      .select('*, item:items(name, name_bn), warehouse:warehouses(name), lot:lots(lot_no)')
      .gte('movement_date', from)
      .lte('movement_date', to)
      .order('movement_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1000)
    if (item) q = q.eq('item_id', item)
    if (warehouse) q = q.eq('warehouse_id', warehouse)
    return q as never
  })
  const del = useSave((r: MoveRow) => rpc(deletable[r.source_type], { p_id: r.source_id }))
  const rows = data ?? []

  return (
    <>
      <PageHeader
        title={t('nav.stockMoves')}
        subtitle={t('stock.movesSubtitle')}
        actions={
          can('stock') && (
            <>
              <Button variant="secondary" onClick={() => setForm('transfer')}>
                <ArrowLeftRight className="size-4" />
                {t('stock.newTransfer')}
              </Button>
              <Button variant="secondary" onClick={() => setForm('adjust')}>
                <Scale className="size-4" />
                {t('stock.newAdjustment')}
              </Button>
            </>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <DateRange
            from={from}
            to={to}
            onChange={(f, tt) => {
              setFrom(f)
              setTo(tt)
            }}
          />
          <div className="w-56">
            <ItemPicker value={item} onChange={setItem} />
          </div>
          <div className="w-44">
            <WarehouseSelect value={warehouse} onChange={setWarehouse} allowAll />
          </div>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(m) => String(m.id)}
          columns={[
            { key: 'date', phone: 'sub', header: t('common.date'), cell: (m) => date(m.movement_date), className: 'whitespace-nowrap' },
            {
              key: 'src',
              phone: 'sub',
              header: t('stock.movement'),
              cell: (m) => {
                const link = sourceLink(m.source_type, m.source_id)
                const b = <Badge tone={sourceTone(m.source_type)}>{t(`source.${m.source_type}`)}</Badge>
                return (
                  <div className="flex items-center gap-2">
                    {link && !deletable[m.source_type] ? <Link to={link}>{b}</Link> : b}
                    <span className="text-xs text-slate-500">{m.note}</span>
                  </div>
                )
              },
            },
            { key: 'item', phone: 'title', header: t('common.item'), cell: (m) => nameOf(m.item) },
            { key: 'wh', header: t('stock.warehouse'), cell: (m) => m.warehouse.name },
            { key: 'lot', header: t('stock.lot'), cell: (m) => <span className="text-xs text-slate-500">{m.lot?.lot_no}</span> },
            { key: 'in', header: t('stock.in'), align: 'right', cell: (m) => (num(m.qty_kg) > 0 ? qty(m.qty_kg) : '') },
            { key: 'out', header: t('stock.out'), align: 'right', cell: (m) => (num(m.qty_kg) < 0 ? qty(-num(m.qty_kg)) : '') },
            { key: 'bags', header: t('unit.bags'), align: 'right', cell: (m) => qty(Math.abs(num(m.bags))) },
            {
              key: 'del',
              header: '',
              align: 'right',
              cell: (m) =>
                can('stock') &&
                deletable[m.source_type] && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(m)} aria-label={t('common.delete')}>
                    <Trash2 className="size-4" />
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      {form === 'transfer' && <TransferForm onClose={() => setForm(null)} />}
      {form === 'adjust' && <AdjustmentForm onClose={() => setForm(null)} />}
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('common.delete')}
        message={t('stock.deleteMoveConfirm')}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(deleting!, {
            onSuccess: () => {
              toast(t('common.deleted'))
              setDeleting(null)
            },
            onError: (e) => {
              setDeleting(null)
              toast(errorMessage(e), 'error')
            },
          })
        }
      />
    </>
  )
}
