import clsx from 'clsx'
import { ArrowLeft, CheckCircle2, Pencil, Plus, RotateCcw, Trash2, Truck, UserPlus, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { ItemPicker, nameOf, PartyPicker, PrintButton, WarehouseSelect } from '@/components/common'
import { DocPage, DocRow, SignatureFooter, td, th, useUserName } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat, type Tone } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { PartyForm } from '@/features/parties/PartyForm'
import { rpc, useData, useItems, useSave } from '@/lib/data'
import { date, kg, money, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Item, RateUnit } from '@/lib/types'
import { LineCard, LineCardField } from './LineCard'
import { SumRow } from './LinesEditor'

export type OrderStatus = 'OPEN' | 'CLOSED' | 'CANCELLED'
export type OrderProgress = 'PENDING' | 'PARTIAL' | 'DELIVERED' | 'CLOSED' | 'CANCELLED'

export type SalesOrder = {
  id: string
  order_no: string
  order_date: string
  customer_id: string
  po_number: string | null
  po_date: string | null
  delivery_date: string | null
  warehouse_id: string | null
  delivery_address: string | null
  notes: string | null
  status: OrderStatus
  goods_amount: number
  created_by: string | null
  created_at: string
}

export type OrderRow = SalesOrder & {
  customer_name: string
  customer_name_bn: string | null
  customer_phone: string | null
  ordered_kg: number
  ordered_bags: number
  delivered_kg: number
  remaining_kg: number
  delivered_pct: number
  invoice_count: number
  invoiced_amount: number
  last_delivery: string | null
  progress: OrderProgress
  overdue: boolean
}

export type OrderLine = {
  id: string
  order_id: string
  line_no: number
  item_id: string
  bags: number
  bag_size_kg: number
  qty_kg: number
  rate: number
  rate_unit: RateUnit
  amount: number
  delivered_kg: number
  delivered_bags: number
  remaining_kg: number
  remaining_bags: number
}

export const progressTone: Record<OrderProgress, Tone> = {
  PENDING: 'amber',
  PARTIAL: 'blue',
  DELIVERED: 'green',
  CLOSED: 'slate',
  CANCELLED: 'red',
}

export function ProgressBadge({ o }: { o: Pick<OrderRow, 'progress' | 'overdue'> }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex gap-1">
      <Badge tone={progressTone[o.progress]}>{t(`orders.progress.${o.progress}`)}</Badge>
      {o.overdue && <Badge tone="red">{t('orders.overdue')}</Badge>}
    </span>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, num(pct)))}%` }} />
    </div>
  )
}

// Open orders of one customer, for delivering against them from the sale form
export function useOpenOrders(customerId?: string) {
  return useData<OrderRow[]>(
    ['orders', 'open', customerId],
    () => supabase.from('v_sales_orders').select('*').eq('customer_id', customerId!).eq('status', 'OPEN').order('order_date'),
    { enabled: Boolean(customerId) },
  )
}

const FILTERS = ['ACTIVE', 'PENDING', 'PARTIAL', 'DELIVERED', 'CLOSED', 'CANCELLED', 'ALL'] as const
type Filter = (typeof FILTERS)[number]

export function OrdersPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('ACTIVE')
  const [search, setSearch] = useState('')
  const { data, isLoading } = useData<OrderRow[]>(['orders', 'all'], () =>
    supabase.from('v_sales_orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
  )
  const all = data ?? []
  const active = all.filter((o) => o.status === 'OPEN' && o.progress !== 'DELIVERED')
  const q = search.trim().toLowerCase()
  const rows = (filter === 'ACTIVE' ? active : filter === 'ALL' ? all : all.filter((o) => o.progress === filter)).filter(
    (o) => !q || `${o.order_no} ${o.po_number ?? ''} ${o.customer_name} ${o.customer_name_bn ?? ''}`.toLowerCase().includes(q),
  )
  const count = (f: Filter) => (f === 'ACTIVE' ? active.length : f === 'ALL' ? all.length : all.filter((o) => o.progress === f).length)

  return (
    <>
      <PageHeader
        title={t('nav.orders')}
        subtitle={t('orders.subtitle')}
        actions={
          can('sale') && (
            <ButtonLink to="/orders/new">
              <Plus className="size-4" />
              {t('orders.new')}
            </ButtonLink>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('orders.activeOrders')} value={active.length} />
        <Stat label={t('orders.toDeliver')} value={kg(active.reduce((a, o) => a + num(o.remaining_kg), 0))} />
        <Stat label={t('orders.overdueOrders')} value={active.filter((o) => o.overdue).length} tone={active.some((o) => o.overdue) ? 'down' : undefined} />
        <Stat label={t('orders.partlyDelivered')} value={active.filter((o) => o.progress === 'PARTIAL').length} />
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx('rounded-md px-3 py-1', filter === f ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}
              >
                {t(`orders.filter.${f}`)} <span className="text-xs text-slate-400">{count(f)}</span>
              </button>
            ))}
          </div>
          <Input placeholder={t('orders.searchHint')} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(o) => o.id}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          empty={t('orders.none')}
          columns={[
            { key: 'date', header: t('common.date'), cell: (o) => date(o.order_date), className: 'whitespace-nowrap' },
            { key: 'no', header: t('orders.orderNo'), cell: (o) => <span className="font-medium">{o.order_no}</span> },
            { key: 'po', header: t('orders.poNumber'), cell: (o) => o.po_number || <span className="text-slate-400">—</span> },
            { key: 'cus', header: t('trading.customer'), cell: (o) => nameOf({ name: o.customer_name, name_bn: o.customer_name_bn }) },
            {
              key: 'deliv',
              header: t('orders.deliveryDate'),
              cell: (o) => <span className={clsx(o.overdue && 'font-medium text-red-600')}>{o.delivery_date ? date(o.delivery_date) : '—'}</span>,
              className: 'whitespace-nowrap',
            },
            { key: 'ordered', header: t('orders.ordered'), align: 'right', cell: (o) => kg(o.ordered_kg) },
            {
              key: 'progress',
              header: t('orders.delivered'),
              cell: (o) => (
                <div className="w-28">
                  <div className="mb-1 text-xs text-slate-500 tabular-nums">
                    {kg(o.delivered_kg)} · {qty(o.delivered_pct, 0)}%
                  </div>
                  <ProgressBar pct={o.delivered_pct} />
                </div>
              ),
            },
            { key: 'rem', header: t('orders.remaining'), align: 'right', cell: (o) => (num(o.remaining_kg) > 0 ? kg(o.remaining_kg) : '—') },
            { key: 'status', header: t('common.status'), cell: (o) => <ProgressBadge o={o} /> },
          ]}
        />
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Order form
// ---------------------------------------------------------------------------------------------

type FormLine = { key: string; item_id: string; bags: string; bag_size_kg: string; qty_kg: string; rate: string; rate_unit: RateUnit }
const newFormLine = (): FormLine => ({ key: crypto.randomUUID(), item_id: '', bags: '', bag_size_kg: '', qty_kg: '', rate: '', rate_unit: 'KG' })
const formLineAmount = (l: FormLine) => Math.round(num(l.rate) * (l.rate_unit === 'BAG' ? num(l.bags) : num(l.qty_kg)) * 100) / 100
const blank = (v: unknown) => (v == null || num(v) === 0 ? '' : String(v))

export function OrderForm() {
  const { id } = useParams()
  const existing = useData<SalesOrder & { lines: OrderLine[] }>(
    ['order', id],
    () => supabase.from('sales_orders').select('*, lines:sales_order_lines(*)').eq('id', id!).single(),
    { enabled: Boolean(id) },
  )
  if (existing.error) return <ErrorBox error={existing.error} />
  if (id && !existing.data) return <Loading />
  return <OrderEditor key={id ?? 'new'} id={id} existing={id ? existing.data : undefined} />
}

function OrderEditor({ id, existing: o }: { id?: string; existing?: SalesOrder & { lines: OrderLine[] } }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: items } = useItems()
  const [addingParty, setAddingParty] = useState(false)
  const [h, setH] = useState(() => ({
    order_date: o?.order_date ?? today(),
    customer_id: o?.customer_id ?? '',
    po_number: o?.po_number ?? '',
    po_date: o?.po_date ?? '',
    delivery_date: o?.delivery_date ?? '',
    warehouse_id: o?.warehouse_id ?? '',
    delivery_address: o?.delivery_address ?? '',
    notes: o?.notes ?? '',
  }))
  const [lines, setLines] = useState<FormLine[]>(() =>
    o?.lines?.length
      ? [...o.lines]
          .sort((a, b) => a.line_no - b.line_no)
          .map((l) => ({
            key: l.id,
            item_id: l.item_id,
            bags: blank(l.bags),
            bag_size_kg: blank(l.bag_size_kg),
            qty_kg: String(l.qty_kg),
            rate: blank(l.rate),
            rate_unit: l.rate_unit,
          }))
      : [newFormLine()],
  )
  const set = (k: keyof typeof h) => (v: string) => setH((x) => ({ ...x, [k]: v }))
  const update = (key: string, patch: Partial<FormLine>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (patch.item_id !== undefined && !l.bag_size_kg) {
          const item = items?.find((i) => i.id === patch.item_id)
          if (item?.default_bag_kg) next.bag_size_kg = String(item.default_bag_kg)
        }
        if ((patch.bags !== undefined || patch.bag_size_kg !== undefined) && num(next.bags) && num(next.bag_size_kg)) {
          next.qty_kg = String(Math.round(num(next.bags) * num(next.bag_size_kg) * 1000) / 1000)
        }
        return next
      }),
    )

  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== key) : [newFormLine()]))

  // Line controls shared by the table (md and up) and the stacked cards (phones)
  const lineItem = (l: FormLine) => <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} />
  const lineBags = (l: FormLine) => <Input type="number" min="0" value={l.bags} onChange={(e) => update(l.key, { bags: e.target.value })} />
  const lineBagSize = (l: FormLine) => (
    <Input type="number" min="0" value={l.bag_size_kg} onChange={(e) => update(l.key, { bag_size_kg: e.target.value })} />
  )
  const lineWeight = (l: FormLine) => <Input type="number" min="0" value={l.qty_kg} onChange={(e) => update(l.key, { qty_kg: e.target.value })} />
  const lineRate = (l: FormLine) => (
    <Input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} placeholder={t('common.optional')} />
  )
  const lineRateUnit = (l: FormLine) => (
    <Select value={l.rate_unit} onChange={(e) => update(l.key, { rate_unit: e.target.value as RateUnit })}>
      <option value="KG">{t('unit.kg')}</option>
      <option value="BAG">{t('unit.bag')}</option>
    </Select>
  )

  const save = useSave(() =>
    rpc<string>('save_sales_order', {
      p: {
        id,
        ...h,
        lines: lines
          .filter((l) => l.item_id)
          .map((l) => ({ item_id: l.item_id, bags: num(l.bags), bag_size_kg: num(l.bag_size_kg), qty_kg: num(l.qty_kg), rate: num(l.rate), rate_unit: l.rate_unit })),
      },
    }),
  )
  const totalKg = lines.reduce((a, l) => a + num(l.qty_kg), 0)
  const totalBags = lines.reduce((a, l) => a + num(l.bags), 0)
  const value = lines.reduce((a, l) => a + formLineAmount(l), 0)

  return (
    <>
      <PageHeader title={id ? `${t('orders.edit')} ${o?.order_no ?? ''}` : t('orders.new')} subtitle={t('orders.formHelp')} />
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('trading.customer')} className="lg:col-span-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <PartyPicker value={h.customer_id} onChange={set('customer_id')} type="CUSTOMER" />
                </div>
                <Button variant="secondary" onClick={() => setAddingParty(true)} title={t('parties.new')}>
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label={t('orders.orderDate')}>
              <Input type="date" value={h.order_date} onChange={(e) => set('order_date')(e.target.value)} />
            </Field>
            <Field label={t('orders.deliveryDate')} hint={t('common.optional')}>
              <Input type="date" value={h.delivery_date} onChange={(e) => set('delivery_date')(e.target.value)} />
            </Field>
            <Field label={t('orders.poNumber')} hint={t('orders.poHint')}>
              <Input value={h.po_number} onChange={(e) => set('po_number')(e.target.value)} placeholder="PO-…" />
            </Field>
            <Field label={t('orders.poDate')}>
              <Input type="date" value={h.po_date} onChange={(e) => set('po_date')(e.target.value)} />
            </Field>
            <Field label={t('trading.deliverFrom')} hint={t('common.optional')}>
              <WarehouseSelect value={h.warehouse_id} onChange={set('warehouse_id')} />
            </Field>
            <Field label={t('orders.deliveryAddress')} hint={t('common.optional')}>
              <Input value={h.delivery_address} onChange={(e) => set('delivery_address')(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title={t('trading.items')}>
          <div className="space-y-3 md:hidden">
            {lines.map((l) => (
              <LineCard key={l.key} item={lineItem(l)} amount={money(formLineAmount(l))} onRemove={() => removeLine(l.key)}>
                <LineCardField label={t('unit.bags')}>{lineBags(l)}</LineCardField>
                <LineCardField label={t('trading.bagSize')}>{lineBagSize(l)}</LineCardField>
                <LineCardField label={t('trading.weightKg')} className="col-span-2">
                  {lineWeight(l)}
                </LineCardField>
                <LineCardField label={t('orders.agreedRate')}>{lineRate(l)}</LineCardField>
                <LineCardField label={t('orders.per')}>{lineRateUnit(l)}</LineCardField>
              </LineCard>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="w-[30%] pb-1 font-medium">{t('common.item')}</th>
                  <th className="pb-1 font-medium">{t('unit.bags')}</th>
                  <th className="pb-1 font-medium">{t('trading.bagSize')}</th>
                  <th className="pb-1 font-medium">{t('trading.weightKg')}</th>
                  <th className="pb-1 font-medium">{t('orders.agreedRate')}</th>
                  <th className="pb-1 font-medium">{t('orders.per')}</th>
                  <th className="pb-1 text-right font-medium">{t('common.amount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="align-top">
                    <td className="py-1 pr-2">{lineItem(l)}</td>
                    <td className="py-1 pr-2">{lineBags(l)}</td>
                    <td className="py-1 pr-2">{lineBagSize(l)}</td>
                    <td className="py-1 pr-2">{lineWeight(l)}</td>
                    <td className="py-1 pr-2">{lineRate(l)}</td>
                    <td className="py-1 pr-2">{lineRateUnit(l)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{money(formLineAmount(l))}</td>
                    <td className="py-1">
                      <Button variant="ghost" size="sm" onClick={() => removeLine(l.key)} title={t('common.remove')}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setLines((ls) => [...ls, newFormLine()])}>
            <Plus className="size-4" />
            {t('trading.addLine')}
          </Button>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <Field label={t('common.notes')}>
              <Textarea value={h.notes} onChange={(e) => set('notes')(e.target.value)} />
            </Field>
          </Card>
          <Card title={t('common.summary')}>
            <div className="space-y-2">
              <SumRow label={t('unit.bags')} value={qty(totalBags)} />
              <SumRow label={t('trading.totalWeight')} value={kg(totalKg)} />
              <SumRow label={t('orders.orderValue')} value={money(value)} strong />
            </div>
            <ErrorBox error={save.error} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={save.isPending}
                onClick={() =>
                  save.mutate(undefined, {
                    onSuccess: (newId) => {
                      toast(t('common.saved'))
                      navigate(`/orders/${newId}`, { replace: true })
                    },
                  })
                }
              >
                {t('common.save')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
      {addingParty && <PartyForm open defaultType="CUSTOMER" onClose={() => setAddingParty(false)} onSaved={set('customer_id')} />}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Order view: tracking and the order confirmation document
// ---------------------------------------------------------------------------------------------

type OrderDetailLine = OrderLine & { item: Item }
type Delivery = { id: string; sale_no: string; sale_date: string; vehicle_no: string | null; total_amount: number; due_amount: number; lines: { item_id: string; qty_kg: number; bags: number }[] }

export function OrderView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [confirm, setConfirm] = useState<null | 'delete' | OrderStatus>(null)
  const { data: o, isLoading } = useData<OrderRow & { customer: { name: string; name_bn: string | null; phone: string | null; address: string | null }; warehouse: { name: string } | null }>(
    ['order-view', id],
    () => supabase.from('v_sales_orders').select('*, customer:parties!sales_orders_customer_id_fkey(name, name_bn, phone, address), warehouse:warehouses(name)').eq('id', id!).single() as never,
  )
  const { data: lines } = useData<OrderDetailLine[]>(['order-lines', id], () =>
    supabase.from('v_sales_order_lines').select('*, item:items(*)').eq('order_id', id!).order('line_no') as never,
  )
  const { data: deliveries } = useData<Delivery[]>(['order-deliveries', id], () =>
    supabase.from('v_sale_dues').select('id, sale_no, sale_date, vehicle_no, total_amount, due_amount, lines:sale_lines(item_id, qty_kg, bags)').eq('order_id', id!).order('sale_date') as never,
  )
  const createdBy = useUserName(o?.created_by)
  const setStatus = useSave((s: OrderStatus) => rpc('set_sales_order_status', { p_id: id, p_status: s }))
  const del = useSave(() => rpc('delete_sales_order', { p_id: id }))
  if (isLoading || !o) return <Loading />
  const sorted = [...(lines ?? [])].sort((a, b) => a.line_no - b.line_no)
  const isOpen = o.status === 'OPEN'

  const run = () => {
    if (!confirm) return
    const done = { onError: (e: unknown) => toast(errorMessage(e), 'error'), onSettled: () => setConfirm(null) }
    if (confirm === 'delete')
      del.mutate(undefined, {
        ...done,
        onSuccess: () => {
          toast(t('common.deleted'))
          navigate('/orders')
        },
      })
    else setStatus.mutate(confirm, { ...done, onSuccess: () => toast(t('common.saved')) })
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <ButtonLink to="/orders" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {o.order_no}
            <ProgressBadge o={o} />
          </span>
        }
        subtitle={[nameOf({ name: o.customer_name, name_bn: o.customer_name_bn }), o.po_number && `${t('orders.poNumber')}: ${o.po_number}`].filter(Boolean).join(' · ')}
        actions={
          <>
            {can('sale') && isOpen && num(o.remaining_kg) > 0 && (
              <ButtonLink to={`/sales/new?order=${o.id}`}>
                <Truck className="size-4" />
                {t('orders.deliver')}
              </ButtonLink>
            )}
            {can('sale') && o.status !== 'CANCELLED' && (
              <ButtonLink to={`/orders/${o.id}/edit`} variant="secondary">
                <Pencil className="size-4" />
                {t('common.edit')}
              </ButtonLink>
            )}
            {can('sale') && isOpen && (
              <Button variant="secondary" onClick={() => setConfirm('CLOSED')}>
                <CheckCircle2 className="size-4" />
                {t('orders.close')}
              </Button>
            )}
            {can('sale') && !isOpen && (
              <Button variant="secondary" onClick={() => setConfirm('OPEN')}>
                <RotateCcw className="size-4" />
                {t('orders.reopen')}
              </Button>
            )}
            {can('sale') && isOpen && num(o.invoice_count) === 0 && (
              <Button variant="secondary" onClick={() => setConfirm('CANCELLED')}>
                <XCircle className="size-4" />
                {t('orders.cancel')}
              </Button>
            )}
            {can('deleteDoc') && num(o.invoice_count) === 0 && (
              <Button variant="secondary" onClick={() => setConfirm('delete')}>
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            )}
          </>
        }
      />

      <div className="no-print mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('orders.ordered')} value={kg(o.ordered_kg)} hint={num(o.ordered_bags) ? `${qty(o.ordered_bags)} ${t('unit.bags')}` : undefined} />
        <Stat label={t('orders.delivered')} value={kg(o.delivered_kg)} hint={`${qty(o.delivered_pct, 0)}% · ${t('orders.invoiceCount', { count: num(o.invoice_count) })}`} />
        <Stat label={t('orders.remaining')} value={kg(o.remaining_kg)} tone={o.overdue ? 'down' : undefined} hint={o.delivery_date ? `${t('orders.due')} ${date(o.delivery_date)}` : undefined} />
        <Stat label={t('orders.invoiced')} value={money(o.invoiced_amount)} hint={num(o.goods_amount) ? `${t('orders.orderValue')}: ${money(o.goods_amount)}` : undefined} />
      </div>

      <div className="no-print mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t('orders.tracking')} padded={false}>
          <Table
            rows={sorted}
            rowKey={(l) => l.id}
            columns={[
              { key: 'item', header: t('common.item'), cell: (l) => <span className="font-medium">{nameOf(l.item)}</span> },
              { key: 'ord', header: t('orders.ordered'), align: 'right', cell: (l) => kg(l.qty_kg) },
              { key: 'del', header: t('orders.delivered'), align: 'right', cell: (l) => kg(l.delivered_kg) },
              {
                key: 'rem',
                header: t('orders.remaining'),
                align: 'right',
                cell: (l) =>
                  num(l.remaining_kg) > 0 ? (
                    <span className="font-medium text-amber-700">
                      {kg(l.remaining_kg)}
                      {num(l.remaining_bags) > 0 && <span className="block text-xs font-normal text-slate-500">{qty(l.remaining_bags)} {t('unit.bags')}</span>}
                    </span>
                  ) : num(l.delivered_kg) > num(l.qty_kg) + 0.0005 ? (
                    <Badge tone="violet">+{kg(num(l.delivered_kg) - num(l.qty_kg))}</Badge>
                  ) : (
                    <Badge tone="green">{t('orders.progress.DELIVERED')}</Badge>
                  ),
              },
            ]}
          />
        </Card>
        <Card title={t('orders.deliveries')} padded={false}>
          <Table
            rows={deliveries}
            rowKey={(d) => d.id}
            onRowClick={(d) => navigate(`/sales/${d.id}`)}
            empty={t('orders.noDeliveries')}
            columns={[
              { key: 'date', header: t('common.date'), cell: (d) => date(d.sale_date), className: 'whitespace-nowrap' },
              { key: 'no', header: t('trading.invoiceNo'), cell: (d) => <span className="font-medium">{d.sale_no}</span> },
              { key: 'veh', header: t('trading.vehicleNo'), cell: (d) => d.vehicle_no || '—' },
              { key: 'kg', header: t('trading.weightKg'), align: 'right', cell: (d) => qty(d.lines.reduce((a, l) => a + num(l.qty_kg), 0)) },
              { key: 'amt', header: t('common.total'), align: 'right', cell: (d) => money(d.total_amount) },
              {
                key: 'due',
                header: t('common.due'),
                align: 'right',
                cell: (d) => (num(d.due_amount) > 0.005 ? <span className="text-red-600">{money(d.due_amount)}</span> : <Badge tone="green">{t('common.paid')}</Badge>),
              },
            ]}
          />
        </Card>
      </div>

      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">{t('orders.confirmationTitle')}</h2>
        <div className="flex gap-2">
          <PdfButton target={ref} filename={`${o.order_no}${o.po_number ? `-${o.po_number.replace(/[^\w-]+/g, '_')}` : ''}.pdf`} label={t('orders.pdf')} />
          <PrintButton />
        </div>
      </div>
      <div className="overflow-x-auto" ref={ref}>
        <DocPage
          title={t('orders.docTitle')}
          meta={
            <>
              <div>
                {t('orders.orderNo')}: <b>{o.order_no}</b>
              </div>
              <div>
                {t('orders.orderDate')}: {date(o.order_date)}
              </div>
              {o.po_number && (
                <div>
                  {t('orders.poNumber')}: <b>{o.po_number}</b>
                  {o.po_date && ` (${date(o.po_date)})`}
                </div>
              )}
              {o.delivery_date && (
                <div>
                  {t('orders.deliveryDate')}: {date(o.delivery_date)}
                </div>
              )}
            </>
          }
          footer={<SignatureFooter createdBy={createdBy} createdAt={o.created_at} signers={[t('print.customerSignature')]} />}
        >
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('orders.customerLabel')}</div>
              <div className="font-semibold">{nameOf(o.customer)}</div>
              <div className="text-xs text-slate-600">{o.customer.address}</div>
              <div className="text-xs text-slate-600">{o.customer.phone}</div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-xs">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.delivery')}</div>
              <div>
                {t('orders.deliveryAddress')}: {o.delivery_address || o.customer.address || '—'}
              </div>
              {o.warehouse && (
                <div>
                  {t('trading.deliverFrom')}: {o.warehouse.name}
                </div>
              )}
              <div>
                {t('common.status')}: {t(`orders.progress.${o.progress}`)}
              </div>
            </div>
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>{t('common.item')}</th>
                <th className={`${th} text-right`}>{t('unit.bags')}</th>
                <th className={`${th} text-right`}>{t('trading.weightKg')}</th>
                <th className={`${th} text-right`}>{t('trading.rate')}</th>
                <th className={`${th} text-right`}>{t('common.amount')}</th>
                <th className={`${th} text-right`}>{t('orders.delivered')}</th>
                <th className={`${th} text-right`}>{t('orders.remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l, i) => (
                <tr key={l.id}>
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} font-medium`}>{nameOf(l.item)}</td>
                  <td className={`${td} text-right`}>{num(l.bags) ? `${qty(l.bags)} × ${qty(l.bag_size_kg)} ${t('unit.kg')}` : ''}</td>
                  <td className={`${td} text-right`}>{qty(l.qty_kg)}</td>
                  <td className={`${td} text-right`}>{num(l.rate) ? `${money(l.rate)}/${l.rate_unit === 'BAG' ? t('unit.bag') : t('unit.kg')}` : '—'}</td>
                  <td className={`${td} text-right`}>{num(l.amount) ? money(l.amount) : '—'}</td>
                  <td className={`${td} text-right`}>{qty(l.delivered_kg)}</td>
                  <td className={`${td} text-right`}>{qty(l.remaining_kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 ml-auto w-72 space-y-1 text-[12px]">
            <DocRow label={t('trading.totalWeight')} value={kg(o.ordered_kg)} />
            <DocRow label={t('orders.delivered')} value={kg(o.delivered_kg)} />
            <DocRow label={t('orders.remaining')} value={kg(o.remaining_kg)} />
            {num(o.goods_amount) > 0 && <DocRow label={t('orders.orderValue')} value={money(o.goods_amount)} strong />}
          </div>
          {o.notes && <p className="mt-4 text-xs text-slate-600">{o.notes}</p>}
        </DocPage>
      </div>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('common.delete') : confirm ? t(`orders.confirm.${confirm}.title`) : ''}
        message={confirm === 'delete' ? t('orders.deleteConfirm', { no: o.order_no }) : confirm ? t(`orders.confirm.${confirm}.message`, { no: o.order_no }) : ''}
        danger={confirm === 'delete' || confirm === 'CANCELLED'}
        loading={del.isPending || setStatus.isPending}
        onConfirm={run}
      />
    </>
  )
}
