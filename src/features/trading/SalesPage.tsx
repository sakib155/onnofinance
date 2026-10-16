import { ArrowLeft, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { DateRange, nameOf, PrintButton } from '@/components/common'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Badge, Card, Loading, PageHeader } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { useCompany } from '@/features/setup/company'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, monthStart, num, qty, today } from '@/lib/format'
import { downloadPdf } from '@/lib/pdf'
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
          can('trade') && (
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
  lines: (SaleLine & { item: Item })[]
  customer: { id: string; name: string; name_bn: string | null; phone: string | null; address: string | null }
  broker: { name: string } | null
  warehouse: { name: string }
}

export function SaleView() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const { data: company } = useCompany()
  const { data: s, isLoading } = useData<SaleDetail>(['sale-view', id], () =>
    supabase
      .from('sales')
      .select(
        '*, lines:sale_lines(*, item:items(*)), customer:parties!sales_customer_id_fkey(id, name, name_bn, phone, address), broker:parties!sales_broker_id_fkey(name), warehouse:warehouses(name)',
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
  const del = useSave(() => rpc('delete_sale', { p_id: id }))
  if (isLoading || !s) return <Loading />
  const lines = [...s.lines].sort((a, b) => a.line_no - b.line_no)
  const profit = num(s.goods_amount) - num(s.discount) - num(s.cost_amount)
  const companyName = i18n.language === 'bn' && company?.name_bn ? company.name_bn : company?.name

  const pdf = async () => {
    if (!ref.current) return
    setPdfBusy(true)
    try {
      await downloadPdf(ref.current, `${s.sale_no}.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

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
            {can('trade') && (
              <ButtonLink to={`/sales/${s.id}/edit`} variant="secondary">
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
            <Button variant="secondary" onClick={pdf} loading={pdfBusy}>
              <Download className="size-4" />
              PDF
            </Button>
            <PrintButton />
          </>
        }
      />
      <div className="overflow-x-auto">
        <div ref={ref} className="print-area mx-auto w-[794px] bg-white p-10 text-[13px] text-slate-800 shadow-sm">
          {company?.header_image_url ? (
            <img src={company.header_image_url} alt="" className="mb-4 w-full" crossOrigin="anonymous" />
          ) : (
            <div className="mb-4 border-b-2 border-brand-800 pb-3">
              <div className="text-2xl font-bold text-brand-900">{companyName}</div>
              <div className="text-xs text-slate-600">{[company?.address, company?.phone, company?.email].filter(Boolean).join(' · ')}</div>
            </div>
          )}
          <div className="mb-4 flex items-start justify-between">
            <div className="text-lg font-bold tracking-wide">{t('trading.invoiceTitle')}</div>
            <div className="text-right text-xs">
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
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.billTo')}</div>
              <Link to={`/parties/${s.customer.id}`} className="font-semibold">
                {nameOf(s.customer)}
              </Link>
              <div className="text-xs text-slate-600">{s.customer.address}</div>
              <div className="text-xs text-slate-600">{s.customer.phone}</div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-xs">
              <div className="mb-1 text-[11px] font-semibold text-slate-500 uppercase">{t('trading.delivery')}</div>
              {s.vehicle_no && (
                <div>
                  {t('trading.vehicleNo')}: <b>{s.vehicle_no}</b>
                </div>
              )}
              {s.driver_name && (
                <div>
                  {t('trading.driver')}: {s.driver_name} {s.driver_phone && `(${s.driver_phone})`}
                </div>
              )}
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
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-200 px-2 py-1.5">#</th>
                <th className="border border-slate-200 px-2 py-1.5">{t('common.item')}</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">{t('unit.bags')}</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">{t('trading.weightKg')}</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">{t('trading.rate')}</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-slate-200 px-2 py-1.5">{i + 1}</td>
                  <td className="border border-slate-200 px-2 py-1.5 font-medium">{nameOf(l.item)}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{num(l.bags) ? `${qty(l.bags)} × ${qty(l.bag_size_kg)} ${t('unit.kg')}` : ''}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{qty(l.qty_kg)}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">
                    {money(l.rate)}/{l.rate_unit === 'BAG' ? t('unit.bag') : t('unit.kg')}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 ml-auto w-72 space-y-1 text-[12px]">
            <Row label={t('trading.goodsValue')} value={money(s.goods_amount)} />
            {num(s.transport_charge) > 0 && <Row label={t('trading.transportCharge')} value={money(s.transport_charge)} />}
            {num(s.labour_charge) > 0 && <Row label={t('trading.labourCharge')} value={money(s.labour_charge)} />}
            {num(s.discount) > 0 && <Row label={t('trading.discount')} value={`- ${money(s.discount)}`} />}
            <Row label={t('trading.invoiceTotal')} value={money(s.total_amount)} strong />
            <Row label={t('common.paid')} value={money(dues?.total_paid)} />
            <Row label={t('trading.dueOnInvoice')} value={money(dues?.due_amount)} strong />
            {party && Math.abs(num(party.balance) - num(dues?.due_amount)) > 0.005 && (
              <Row label={t('trading.customerTotalDue')} value={money(party.balance)} />
            )}
          </div>
          {s.notes && <p className="mt-4 text-xs text-slate-600">{s.notes}</p>}
          {company?.invoice_footer && <p className="mt-4 text-xs text-slate-500">{company.invoice_footer}</p>}
          <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[11px]">
            <div className="border-t border-slate-400 pt-1">{t('print.customerSignature')}</div>
            <div className="border-t border-slate-400 pt-1">{t('print.preparedBy')}</div>
            <div className="border-t border-slate-400 pt-1">{t('print.authorisedBy')}</div>
          </div>
        </div>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-slate-300 pt-1 font-semibold' : 'flex justify-between'}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
