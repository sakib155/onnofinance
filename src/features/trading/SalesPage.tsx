import clsx from 'clsx'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { DateRange, nameOf, PrintButton } from '@/components/common'
import { DocPage, DocRow, SignatureFooter, td, th, useUserName } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge, Card, Loading, PageHeader } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { useCompany } from '@/features/setup/company'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/types'
import type { Sale, SaleLine } from './SaleForm'

type SaleRow = Sale & { customer_name: string; customer_name_bn: string | null; total_paid: number; due_amount: number }

export function SalesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [search, setSearch] = useState('')
  const { data, isLoading } = useData<SaleRow[]>(['sales', from, to], () =>
    supabase.from('v_sale_dues').select('*').gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }).order('created_at', { ascending: false }),
  )
  const q = search.trim().toLowerCase()
  const rows = (data ?? []).filter((s) => !q || `${s.sale_no} ${s.customer_name} ${s.vehicle_no ?? ''}`.toLowerCase().includes(q))
  const showProfit = can('books')

  return (
    <>
      <PageHeader
        title={t('nav.sales')}
        subtitle={t('trading.salesSubtitle')}
        actions={
          can('sale') && (
            <ButtonLink to="/sales/new">
              <Plus className="size-4" />
              {t('trading.newSale')}
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
          rowKey={(s) => s.id}
          onRowClick={(s) => navigate(`/sales/${s.id}`)}
          columns={[
            { key: 'date', header: t('common.date'), cell: (s) => date(s.sale_date), className: 'whitespace-nowrap' },
            { key: 'no', header: t('trading.invoiceNo'), cell: (s) => <span className="font-medium">{s.sale_no}</span> },
            { key: 'cus', header: t('trading.customer'), cell: (s) => nameOf({ name: s.customer_name, name_bn: s.customer_name_bn }) },
            { key: 'total', header: t('common.total'), align: 'right', cell: (s) => money(s.total_amount), footer: money(rows.reduce((a, s) => a + num(s.total_amount), 0)) },
            {
              key: 'due',
              header: t('common.due'),
              align: 'right',
              cell: (s) => (num(s.due_amount) > 0.005 ? <span className="text-red-600">{money(s.due_amount)}</span> : <Badge tone="green">{t('common.paid')}</Badge>),
              footer: money(rows.reduce((a, s) => a + Math.max(num(s.due_amount), 0), 0)),
            },
            ...(showProfit
              ? [
                  {
                    key: 'profit',
                    header: t('trading.grossProfit'),
                    align: 'right' as const,
                    cell: (s: SaleRow) => money(num(s.goods_amount) - num(s.discount) - num(s.cost_amount)),
                    footer: money(rows.reduce((a, s) => a + num(s.goods_amount) - num(s.discount) - num(s.cost_amount), 0)),
                  },
                ]
              : []),
          ]}
        />
      </Card>
    </>
  )
}

type SaleDetail = Sale & {
  lines: (SaleLine & { item: Item; warehouse: { name: string } | null })[]
  customer: { id: string; name: string; name_bn: string | null; phone: string | null; address: string | null }
  broker: { name: string } | null
  warehouse: { name: string }
}

type DocKind = 'invoice' | 'challan'

function InvoiceDoc({ s, dues, balance, createdBy }: { s: SaleDetail; dues?: { total_paid: number; due_amount: number }; balance?: number; createdBy: string }) {
  const { t } = useTranslation()
  const { data: company } = useCompany()
  const lines = [...s.lines].sort((a, b) => a.line_no - b.line_no)
  return (
    <DocPage
      title={t('trading.invoiceTitle')}
      meta={
        <>
          <div>
            {t('trading.invoiceNo')}: <b>{s.sale_no}</b>
          </div>
          <div>
            {t('common.date')}: {date(s.sale_date)}
          </div>
          {s.reference && (
            <div>
              {t('common.reference')}: {s.reference}
            </div>
          )}
        </>
      }
      footer={<SignatureFooter createdBy={createdBy} createdAt={s.created_at} signers={[t('print.customerSignature')]} />}
    >
      <PartyAndDelivery s={s} />
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t('common.item')}</th>
            <th className={`${th} text-right`}>{t('unit.bags')}</th>
            <th className={`${th} text-right`}>{t('trading.weightKg')}</th>
            <th className={`${th} text-right`}>{t('trading.rate')}</th>
            <th className={`${th} text-right`}>{t('common.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-medium`}>
                {nameOf(l.item)}
                {l.warehouse && l.warehouse_id !== s.warehouse_id && (
                  <div className="text-[11px] font-normal text-slate-500">{t('trading.fromGodown', { name: l.warehouse.name })}</div>
                )}
              </td>
              <td className={`${td} text-right`}>{num(l.bags) ? `${qty(l.bags)} × ${qty(l.bag_size_kg)} ${t('unit.kg')}` : ''}</td>
              <td className={`${td} text-right`}>{qty(l.qty_kg)}</td>
              <td className={`${td} text-right`}>
                {money(l.rate)}/{l.rate_unit === 'BAG' ? t('unit.bag') : t('unit.kg')}
              </td>
              <td className={`${td} text-right`}>{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 ml-auto w-72 space-y-1 text-[12px]">
        <DocRow label={t('trading.goodsValue')} value={money(s.goods_amount)} />
        {num(s.transport_charge) > 0 && <DocRow label={t('trading.transportCharge')} value={money(s.transport_charge)} />}
        {num(s.labour_charge) > 0 && <DocRow label={t('trading.labourCharge')} value={money(s.labour_charge)} />}
        {num(s.discount) > 0 && <DocRow label={t('trading.discount')} value={`- ${money(s.discount)}`} />}
        <DocRow label={t('trading.invoiceTotal')} value={money(s.total_amount)} strong />
        <DocRow label={t('common.paid')} value={money(dues?.total_paid)} />
        <DocRow label={t('trading.dueOnInvoice')} value={money(dues?.due_amount)} strong />
        {balance != null && Math.abs(num(balance) - num(dues?.due_amount)) > 0.005 && <DocRow label={t('trading.customerTotalDue')} value={money(balance)} />}
      </div>
      {s.notes && <p className="mt-4 text-xs text-slate-600">{s.notes}</p>}
      {company?.invoice_footer && <p className="mt-4 text-xs text-slate-500">{company.invoice_footer}</p>}
    </DocPage>
  )
}

// Delivery challan for the driver/transport: goods, bags and weights, no prices
function ChallanDoc({ s, createdBy }: { s: SaleDetail; createdBy: string }) {
  const { t } = useTranslation()
  const lines = [...s.lines].sort((a, b) => a.line_no - b.line_no)
  const totalBags = lines.reduce((a, l) => a + num(l.bags), 0)
  const totalKg = lines.reduce((a, l) => a + num(l.qty_kg), 0)
  return (
    <DocPage
      title={t('trading.challanTitle')}
      meta={
        <>
          <div>
            {t('trading.challanNo')}: <b>{s.sale_no}</b>
          </div>
          <div>
            {t('common.date')}: {date(s.sale_date)}
          </div>
        </>
      }
      footer={<SignatureFooter createdBy={createdBy} createdAt={s.created_at} signers={[t('print.driverSignature'), t('print.receivedBy')]} />}
    >
      <PartyAndDelivery s={s} big />
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t('common.item')}</th>
            <th className={th}>{t('stock.warehouse')}</th>
            <th className={`${th} text-right`}>{t('unit.bags')}</th>
            <th className={`${th} text-right`}>{t('trading.bagSize')}</th>
            <th className={`${th} text-right`}>{t('trading.weightKg')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className={td}>{i + 1}</td>
              <td className={`${td} font-medium`}>{nameOf(l.item)}</td>
              <td className={td}>{l.warehouse?.name ?? s.warehouse.name}</td>
              <td className={`${td} text-right`}>{num(l.bags) ? qty(l.bags) : '—'}</td>
              <td className={`${td} text-right`}>{num(l.bag_size_kg) ? qty(l.bag_size_kg) : '—'}</td>
              <td className={`${td} text-right`}>{qty(l.qty_kg)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={3}>
              {t('common.total')}
            </td>
            <td className={`${td} text-right`}>{qty(totalBags)}</td>
            <td className={td} />
            <td className={`${td} text-right`}>{qty(totalKg)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-xs text-slate-600">{t('trading.challanNote')}</p>
      {s.notes && <p className="mt-2 text-xs text-slate-600">{s.notes}</p>}
    </DocPage>
  )
}

// Who the goods go to, and how they travel
function PartyAndDelivery({ s, big }: { s: SaleDetail; big?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div className="rounded border border-slate-200 p-3">
        <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.billTo')}</div>
        <div className={big ? 'text-base font-semibold' : 'font-semibold'}>{nameOf(s.customer)}</div>
        <div className="text-xs text-slate-600">{s.customer.address}</div>
        <div className="text-xs text-slate-600">{s.customer.phone}</div>
      </div>
      <div className="rounded border border-slate-200 p-3 text-xs">
        <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.delivery')}</div>
        <div>
          {t('trading.vehicleNo')}: <b className={big ? 'text-sm' : ''}>{s.vehicle_no || '—'}</b>
        </div>
        <div>
          {t('trading.driver')}: {s.driver_name || '—'} {s.driver_phone && `(${s.driver_phone})`}
        </div>
        {s.broker && (
          <div>
            {t('trading.broker')}: {s.broker.name}
          </div>
        )}
        <div>
          {t('trading.deliverFrom')}: {s.warehouse.name}
        </div>
      </div>
    </div>
  )
}

export function SaleView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [kind, setKind] = useState<DocKind>('invoice')
  const { data: s, isLoading } = useData<SaleDetail>(['sale-view', id], () =>
    supabase
      .from('sales')
      .select(
        '*, lines:sale_lines(*, item:items(*), warehouse:warehouses(name)), customer:parties!sales_customer_id_fkey(id, name, name_bn, phone, address), broker:parties!sales_broker_id_fkey(name), warehouse:warehouses(name)',
      )
      .eq('id', id!)
      .single() as never,
  )
  const { data: dues } = useData<{ total_paid: number; due_amount: number }>(['sale-dues', id], () =>
    supabase.from('v_sale_dues').select('total_paid, due_amount').eq('id', id!).single(),
  )
  const { data: party } = useData<{ balance: number }>(
    ['party-bal', s?.customer_id],
    () => supabase.from('v_party_balances').select('balance').eq('id', s!.customer_id).single(),
    { enabled: Boolean(s?.customer_id) },
  )
  const createdBy = useUserName(s?.created_by)
  const del = useSave(() => rpc('delete_sale', { p_id: id }))
  if (isLoading || !s) return <Loading />
  const profit = num(s.goods_amount) - num(s.discount) - num(s.cost_amount)

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/sales" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {s.sale_no}
          </span>
        }
        subtitle={can('books') ? `${t('trading.grossProfit')}: ${money(profit)} · ${t('trading.costOfGoods')}: ${money(s.cost_amount)}` : undefined}
        actions={
          <>
            {can('sale') && (
              <ButtonLink to={`/sales/${s.id}/edit`} variant="secondary">
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
            <PdfButton target={ref} filename={`${s.sale_no}${kind === 'challan' ? '-challan' : ''}.pdf`} label={kind === 'challan' ? t('trading.challanPdf') : t('trading.invoicePdf')} />
            <PrintButton />
          </>
        }
      />
      <div className="no-print mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(['invoice', 'challan'] as DocKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={clsx('flex-1 rounded-md px-5 py-1.5', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}
          >
            {k === 'invoice' ? t('trading.invoiceTab') : t('trading.challanTab')}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto" ref={ref}>
        {kind === 'invoice' ? <InvoiceDoc s={s} dues={dues} balance={party?.balance} createdBy={createdBy} /> : <ChallanDoc s={s} createdBy={createdBy} />}
      </div>
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('common.delete')}
        message={t('trading.deleteSaleConfirm', { no: s.sale_no })}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast(t('common.deleted'))
              navigate('/sales')
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
