import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { DateRange, nameOf, PrintButton } from '@/components/common'
import { DocPage, DocRow, SignatureFooter, td, th, useUserName } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge, Card, PageHeader, Pending } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/types'
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
          can('purchase') && (
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
            { key: 'date', phone: 'sub', header: t('common.date'), cell: (p) => date(p.purchase_date), className: 'whitespace-nowrap' },
            { key: 'no', phone: 'sub', header: t('common.billNo'), cell: (p) => <span className="font-medium whitespace-nowrap">{p.purchase_no}</span> },
            { key: 'sup', phone: 'title', header: t('trading.supplier'), cell: (p) => nameOf({ name: p.supplier_name, name_bn: p.supplier_name_bn }) },
            { key: 'bill', phone: 'value', header: t('trading.supplierBill'), align: 'right', cell: (p) => money(p.supplier_total), footer: money(rows.reduce((s, p) => s + num(p.supplier_total), 0)) },
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
  const { data: p, error } = useData<PurchaseDetail>(['purchase-view', id], () =>
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
  const createdBy = useUserName(p?.created_by)
  const ref = useRef<HTMLDivElement>(null)
  const del = useSave(() => rpc('delete_purchase', { p_id: id }))
  if (!p) return <Pending error={error} />
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
            {can('purchase') && (
              <ButtonLink to={`/purchases/${p.id}/edit`} variant="secondary">
                <Pencil className="size-4" />
                {t('common.edit')}
              </ButtonLink>
            )}
            {can('deleteDoc') && (
              <Button variant="secondary" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            )}
            <PdfButton target={ref} filename={`${p.purchase_no}.pdf`} />
            <PrintButton />
          </>
        }
      />
      <div className="overflow-x-auto" ref={ref}>
        <DocPage
          title={t('trading.purchaseBill')}
          meta={
            <>
              <div>
                {t('common.billNo')}: <b>{p.purchase_no}</b>
              </div>
              <div>
                {t('common.date')}: {date(p.purchase_date)}
              </div>
              {p.reference && (
                <div>
                  {t('common.reference')}: {p.reference}
                </div>
              )}
            </>
          }
          footer={<SignatureFooter createdBy={createdBy} createdAt={p.created_at} signers={[t('print.supplierSignature')]} />}
        >
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.supplier')}</div>
              <Link to={`/parties/${p.supplier.id}`} className="font-semibold">
                {nameOf(p.supplier)}
              </Link>
              <div className="text-xs text-slate-600">{p.supplier.address}</div>
              <div className="text-xs text-slate-600">{p.supplier.phone}</div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-xs">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.delivery')}</div>
              <div>
                {t('trading.receiveInto')}: {nameOf(p.warehouse)}
              </div>
              <div>
                {t('trading.vehicleNo')}: {p.vehicle_no || '—'}
              </div>
              {p.broker && (
                <div>
                  {t('trading.broker')}: {p.broker.name}
                </div>
              )}
            </div>
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>{t('common.item')}</th>
                <th className={`${th} text-right`}>{t('unit.bags')}</th>
                <th className={`${th} text-right`}>{t('trading.grossKg')}</th>
                <th className={`${th} text-right`}>{t('trading.deductionKg')}</th>
                <th className={`${th} text-right`}>{t('trading.netKg')}</th>
                <th className={`${th} text-right`}>{t('trading.rate')}</th>
                <th className={`${th} text-right`}>{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} font-medium`}>{nameOf(l.item)}</td>
                  <td className={`${td} text-right`}>{num(l.bags) ? `${qty(l.bags)} × ${qty(l.bag_size_kg)}` : ''}</td>
                  <td className={`${td} text-right`}>{qty(l.gross_kg)}</td>
                  <td className={`${td} text-right`}>{num(l.deduction_kg) ? qty(l.deduction_kg) : ''}</td>
                  <td className={`${td} text-right`}>{qty(l.net_kg)}</td>
                  <td className={`${td} text-right`}>
                    {money(l.rate)}/{l.rate_unit === 'BAG' ? t('unit.bag') : t('unit.kg')}
                  </td>
                  <td className={`${td} text-right`}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 ml-auto w-72 space-y-1 text-[12px]">
            <DocRow label={t('trading.goodsValue')} value={money(p.goods_amount)} />
            {num(p.discount) > 0 && <DocRow label={t('trading.discount')} value={`- ${money(p.discount)}`} />}
            {!p.costs_account_id && extras > 0 && <DocRow label={t('trading.transportLabour')} value={money(extras)} />}
            <DocRow label={t('trading.supplierBill')} value={money(p.supplier_total)} strong />
            <DocRow label={t('common.paid')} value={money(dues?.total_paid)} />
            <DocRow label={t('common.due')} value={money(dues?.due_amount)} strong />
          </div>
          {p.notes && <p className="mt-4 text-xs text-slate-600">{p.notes}</p>}
        </DocPage>
      </div>
      {can('books') && (
        <Card className="no-print mx-auto mt-4 max-w-[794px]">
          <div className="text-sm text-slate-600">
            {t('trading.landedCost')}: <b>{money(p.total_cost)}</b>
            {(p.costs_account_id && extras > 0) || num(p.commission_amount) > 0
              ? ` (${[p.costs_account_id && extras > 0 ? `${t('trading.transportLabour')} ${money(extras)}` : '', num(p.commission_amount) > 0 ? `${t('trading.commission')} ${money(p.commission_amount)}` : ''].filter(Boolean).join(', ')})`
              : ''}
            <div className="mt-1 text-xs">
              {lines.map((l) => `${nameOf(l.item)}${l.lot ? ` (${l.lot.lot_no})` : ''}: ${money(l.unit_cost)}/${t('unit.kg')}`).join(' · ')}
            </div>
          </div>
        </Card>
      )}
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
