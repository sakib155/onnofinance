import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DateRange, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { sourceTone } from '@/features/stock/LotsPage'
import { useData } from '@/lib/data'
import { date, money, num, qty, today, yearStart } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type LotProfit = {
  id: string
  lot_no: string
  source_type: string
  source_id: string
  received_date: string
  item_name: string
  category: string
  warehouse_name: string
  source_label: string | null
  qty_kg: number
  unit_cost: number
  total_cost: number
  sold_kg: number
  revenue: number
  cost_of_sold: number
  profit: number
  margin_pct: number | null
  milled_kg: number
  other_out_kg: number
  remaining_kg: number
  remaining_value: number
}

// Profit per purchased or produced lot: what it cost, what it sold for, what's left
export function LotProfitPage() {
  const { t } = useTranslation()
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const [source, setSource] = useState('')
  const { data, isLoading } = useData<LotProfit[]>(['lot-profit', from, to, source], () => {
    let q = supabase.from('v_lot_profit').select('*').gte('received_date', from).lte('received_date', to).order('received_date', { ascending: false })
    if (source) q = q.eq('source_type', source)
    return q
  })
  const rows = data ?? []
  const sum = (k: keyof LotProfit) => rows.reduce((s, r) => s + num(r[k]), 0)
  const link = (r: LotProfit) => (r.source_type === 'PURCHASE' ? `/purchases/${r.source_id}` : r.source_type === 'PRODUCTION' ? `/production/${r.source_id}` : null)

  return (
    <>
      <PrintHeader title={`${t('reports.lotProfit')} · ${date(from)} – ${date(to)}`} />
      <PageHeader
        title={t('reports.lotProfit')}
        subtitle={t('reports.lotProfitHelp')}
        actions={
          <>
            <DateRange
              from={from}
              to={to}
              onChange={(f, tt) => {
                setFrom(f)
                setTo(tt)
              }}
            />
            <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
              <option value="">{t('common.all')}</option>
              <option value="PURCHASE">{t('source.PURCHASE')}</option>
              <option value="PRODUCTION">{t('source.PRODUCTION')}</option>
              <option value="ADJUSTMENT">{t('source.ADJUSTMENT')}</option>
            </Select>
            <PrintButton />
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label={t('reports.salesValue')} value={money(sum('revenue'))} />
        <Stat label={t('trading.costOfGoods')} value={money(sum('cost_of_sold'))} />
        <Stat label={t('reports.grossProfit')} value={money(sum('profit'))} tone={sum('profit') < 0 ? 'down' : undefined} />
        <Stat label={t('reports.stockLeft')} value={money(sum('remaining_value'))} />
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'lot',
              header: t('stock.lot'),
              cell: (r) => {
                const l = link(r)
                return (
                  <div>
                    {l ? (
                      <Link to={l} className="font-medium text-brand-800 hover:underline">
                        {r.lot_no}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.lot_no}</span>
                    )}
                    <div className="text-xs text-slate-500">{date(r.received_date)}</div>
                  </div>
                )
              },
            },
            {
              key: 'item',
              header: t('common.item'),
              cell: (r) => (
                <div>
                  {r.item_name}
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Badge tone={sourceTone(r.source_type)}>{t(`source.${r.source_type}`)}</Badge>
                    {r.source_label}
                  </div>
                </div>
              ),
            },
            { key: 'in', header: t('stock.received'), align: 'right', cell: (r) => qty(r.qty_kg) },
            { key: 'cost', header: t('trading.costPerKg'), align: 'right', cell: (r) => money(r.unit_cost) },
            { key: 'sold', header: t('reports.soldKg'), align: 'right', cell: (r) => (num(r.sold_kg) ? qty(r.sold_kg) : '') },
            { key: 'milled', header: t('reports.milledKg'), align: 'right', cell: (r) => (num(r.milled_kg) ? qty(r.milled_kg) : '') },
            { key: 'left', header: t('stock.remaining'), align: 'right', cell: (r) => (num(r.remaining_kg) ? qty(r.remaining_kg) : '') },
            { key: 'rev', header: t('reports.salesValue'), align: 'right', cell: (r) => (num(r.revenue) ? money(r.revenue) : ''), footer: money(sum('revenue')) },
            {
              key: 'profit',
              header: t('reports.grossProfit'),
              align: 'right',
              cell: (r) =>
                num(r.revenue) ? (
                  <span className={num(r.profit) < 0 ? 'text-red-600' : 'text-brand-800'}>
                    {money(r.profit)}
                    {r.margin_pct != null && <span className="ml-1 text-xs text-slate-500">({qty(r.margin_pct)}%)</span>}
                  </span>
                ) : (
                  ''
                ),
              footer: money(sum('profit')),
            },
          ]}
        />
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('reports.lotProfitNote')}</p>
      </Card>
    </>
  )
}
