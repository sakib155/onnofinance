import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { DateRange, nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge, Card, Loading, PageHeader } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/types'
import { SumRow } from './LinesEditor'
import type { Purchase, PurchaseLine } from './PurchaseForm'

type PurchaseRow = Purchase & { supplier_name: string; supplier_name_bn: string | null; total_paid: number; due_amount: number }

export function PurchasesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [search, setSearch] = useState('')
  const { data, isLoading } = useData<PurchaseRow[]>(['purchases', from, to], () =>
    supabase
      .from('v_purchase_dues')
      .select('*')
      .gte('purchase_date', from)
      .lte('purchase_date', to)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false }) as never,
  )
  const q = search.trim().toLowerCase()
  const rows = (data ?? []).filter((p) => !q || `${p.purchase_no} ${p.supplier_name} ${p.vehicle_no ?? ''} ${p.reference ?? ''}`.toLowerCase().includes(q))

  return (
    <>
      <PageHeader
        title={t('nav.purchases')}
        subtitle={t('trading.purchasesSubtitle')}
        actions={
          can('trade') && (
            <ButtonLink to="/purchases/new">
              <Plus className="size-4" />
              {t('trading.newPurchase')}
            </ButtonLink>
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
          <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/purchases/${p.id}`)}
          columns={[
            { key: 'date', header: t('common.date'), cell: (p) => date(p.purchase_date), className: 'whitespace-nowrap' },
            { key: 'no', header: t('common.billNo'), cell: (p) => <span className="font-medium">{p.purchase_no}</span> },
            { key: 'sup', header: t('trading.supplier'), cell: (p) => nameOf({ name: p.supplier_name, name_bn: p.supplier_name_bn }) },
            { key: 'bill', header: t('trading.supplierBill'), align: 'right', cell: (p) => money(p.supplier_total), footer: money(rows.reduce((s, p) => s + num(p.supplier_total), 0)) },
            {
              key: 'due',
              header: t('common.due'),
              align: 'right',
              cell: (p) =>
                num(p.due_amount) > 0.005 ? <span className="text-red-600">{money(p.due_amount)}</span> : <Badge tone="green">{t('common.paid')}</Badge>,
              footer: money(rows.reduce((s, p) => s + Math.max(num(p.due_amount), 0), 0)),
            },
            { key: 'cost', header: t('trading.landedCost'), align: 'right', cell: (p) => money(p.total_cost), footer: money(rows.reduce((s, p) => s + num(p.total_cost), 0)) },
          ]}
        />
      </Card>
    </>
  )
}

type PurchaseDetail = Purchase & {
  lines: (PurchaseLine & { item: Item; lot: { lot_no: string; remaining_kg: number } | null })[]
  supplier: { id: string; name: string; name_bn: string | null; phone: string | null; address: string | null }
  broker: { name: string } | null
  warehouse: { name: string; name_bn: string | null }
}

export function PurchaseView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const { data: p, isLoading } = useData<PurchaseDetail>(['purchase-view', id], () =>
    supabase
      .from('purchases')
      .select(
        '*, lines:purchase_lines(*, item:items(*), lot:lots(lot_no, remaining_kg)), supplier:parties!purchases_supplier_id_fkey(id, name, name_bn, phone, address), broker:parties!purchases_broker_id_fkey(name), warehouse:warehouses(name, name_bn)',
      )
      .eq('id', id!)
      .single() as never,
  )
  const { data: dues } = useData<{ total_paid: number; due_amount: number }>(['purchase-dues', id], () =>
    supabase.from('v_purchase_dues').select('total_paid, due_amount').eq('id', id!).single(),
  )
  const del = useSave(() => rpc('delete_purchase', { p_id: id }))
  if (isLoading || !p) return <Loading />
  const lines = [...p.lines].sort((a, b) => a.line_no - b.line_no)
  const extras = num(p.transport_cost) + num(p.labour_cost) + num(p.other_cost)

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/purchases" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {p.purchase_no}
          </span>
        }
        subtitle={date(p.purchase_date)}
        actions={
          <>
            {can('trade') && (
              <ButtonLink to={`/purchases/${p.id}/edit`} variant="secondary">
                <Pencil className="size-4" />
                {t('common.edit')}
              </ButtonLink>
            )}
            {can('deleteDocs') && (
              <Button variant="secondary" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            )}
            <PrintButton />
          </>
        }
      />
      <Card className="print-area">
        <PrintHeader title={`${t('trading.purchaseBill')} · ${p.purchase_no}`} />
        <div className="mb-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-500">{t('trading.supplier')}</div>
            <Link to={`/parties/${p.supplier.id}`} className="font-medium text-brand-800 hover:underline">
              {nameOf(p.supplier)}
            </Link>
            <div className="text-xs text-slate-500">{[p.supplier.phone, p.supplier.address].filter(Boolean).join(' · ')}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t('trading.receiveInto')}</div>
            <div>{nameOf(p.warehouse)}</div>
            {p.broker && <div className="text-xs text-slate-500">{t('trading.broker')}: {p.broker.name}</div>}
          </div>
          <div>
            {p.vehicle_no && <div>{t('trading.vehicleNo')}: {p.vehicle_no}</div>}
            {p.reference && <div>{t('common.reference')}: {p.reference}</div>}
            <div>{t('common.date')}: {date(p.purchase_date)}</div>
          </div>
        </div>
        <Table
          rows={lines}
          rowKey={(l) => l.id}
          columns={[
            {
              key: 'item',
              header: t('common.item'),
              cell: (l) => (
                <div>
                  <div className="font-medium">{nameOf(l.item)}</div>
                  {l.lot && <div className="text-xs text-slate-500">{l.lot.lot_no}</div>}
                </div>
              ),
            },
            { key: 'bags', header: t('unit.bags'), align: 'right', cell: (l) => (num(l.bags) ? `${qty(l.bags)} × ${qty(l.bag_size_kg)}` : '') },
            { key: 'gross', header: t('trading.grossKg'), align: 'right', cell: (l) => qty(l.gross_kg) },
            { key: 'ded', header: t('trading.deductionKg'), align: 'right', cell: (l) => (num(l.deduction_kg) ? qty(l.deduction_kg) : '') },
            { key: 'net', header: t('trading.netKg'), align: 'right', cell: (l) => qty(l.net_kg) },
            { key: 'rate', header: t('trading.rate'), align: 'right', cell: (l) => `${money(l.rate)}/${l.rate_unit === 'BAG' ? t('unit.bag') : t('unit.kg')}` },
            { key: 'amt', header: t('common.amount'), align: 'right', cell: (l) => money(l.amount) },
            { key: 'cost', header: t('trading.costPerKg'), align: 'right', className: 'no-print', cell: (l) => <span className="text-slate-500">{money(l.unit_cost)}</span> },
          ]}
        />
        <div className="mt-4 ml-auto max-w-sm space-y-1.5">
          <SumRow label={t('trading.goodsValue')} value={money(p.goods_amount)} />
          {num(p.discount) > 0 && <SumRow label={t('trading.discount')} value={`- ${money(p.discount)}`} />}
          {!p.costs_account_id && extras > 0 && <SumRow label={t('trading.transportLabour')} value={money(extras)} />}
          <SumRow label={t('trading.supplierBill')} value={money(p.supplier_total)} strong />
          <SumRow label={t('common.paid')} value={money(dues?.total_paid)} />
          <SumRow label={t('common.due')} value={money(dues?.due_amount)} />
          <div className="no-print pt-2 text-xs text-slate-500">
            {t('trading.landedCost')}: {money(p.total_cost)}
            {(p.costs_account_id && extras > 0) || num(p.commission_amount) > 0
              ? ` (${[p.costs_account_id && extras > 0 ? `${t('trading.transportLabour')} ${money(extras)}` : '', num(p.commission_amount) > 0 ? `${t('trading.commission')} ${money(p.commission_amount)}` : ''].filter(Boolean).join(', ')})`
              : ''}
          </div>
        </div>
        {p.notes && <p className="mt-4 text-sm text-slate-600">{p.notes}</p>}
      </Card>
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('common.delete')}
        message={t('trading.deletePurchaseConfirm', { no: p.purchase_no })}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast(t('common.deleted'))
              navigate('/purchases')
            },
            onError: (e) => {
              setDeleting(false)
              toast(errorMessage(e), 'error')
            },
          })
        }
      />
    </>
  )
}
