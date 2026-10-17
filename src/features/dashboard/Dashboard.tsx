import { ArrowDownToLine, Banknote, Factory, ShoppingCart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth, useCan } from '@/app/auth'
import { nameOf } from '@/components/common'
import { ButtonLink } from '@/components/ui/button'
import { Badge, Card, Loading, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useBatches } from '@/features/production/ProductionPage'
import { kindTone } from '@/features/production/types'
import { useStockSummary } from '@/features/stock/StockPage'
import { useData, useParties } from '@/lib/data'
import { date, kg, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Stats = {
  cash: number
  bank: number
  receivable: number
  payable: number
  stock_value: number
  paddy_kg: number
  unsorted_kg: number
  rice_kg: number
  byproduct_kg: number
  open_batches: number
  sales: number
  purchases: number
  expenses: number
  profit: number
  pending_cheques: number
  trend: { month: string; sales: number; purchases: number }[]
}

const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const can = useCan()
  const { profile } = useAuth()
  const books = can('books')
  const { data: s, isLoading } = useData<Stats>(['dashboard', monthStart(), today()], () =>
    supabase.rpc('dashboard_stats', { p_from: monthStart(), p_to: today() }),
  )
  const { data: batches } = useBatches('RUNNING')
  const { data: parties } = useParties()
  const { data: stock } = useStockSummary()

  if (isLoading || !s) return <Loading />
  const topDues = [...(parties ?? [])].filter((p) => num(p.balance) > 0.005).sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 6)
  const low = (stock ?? []).filter((r) => r.reorder_level_kg != null && num(r.qty_kg) < num(r.reorder_level_kg))
  const monthName = new Intl.DateTimeFormat(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long' }).format(new Date())

  return (
    <>
      <PageHeader
        title={t('dashboard.greeting', { name: profile?.full_name?.split(' ')[0] || '' })}
        subtitle={date(today())}
        actions={
          <>
            {can('purchase') && (
              <ButtonLink to="/purchases/new" variant="secondary">
                <ArrowDownToLine className="size-4" />
                {t('trading.newPurchase')}
              </ButtonLink>
            )}
            {can('sale') && (
              <ButtonLink to="/sales/new" variant="secondary">
                <ShoppingCart className="size-4" />
                {t('trading.newSale')}
              </ButtonLink>
            )}
            {can('production') && (
              <>
                <ButtonLink to="/production/new?section=DRYER" variant="secondary">
                  <Factory className="size-4" />
                  {t('production.newBatchOf.DRYER')}
                </ButtonLink>
                <ButtonLink to="/production/new?section=SORTER" variant="secondary">
                  <Factory className="size-4" />
                  {t('production.newBatchOf.SORTER')}
                </ButtonLink>
              </>
            )}
            {can('money') && (
              <ButtonLink to="/money" variant="secondary">
                <Banknote className="size-4" />
                {t('nav.transactions')}
              </ButtonLink>
            )}
          </>
        }
      />
      {books && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('dashboard.cash')} value={money(s.cash)} hint={`${t('dashboard.bank')}: ${money(s.bank)}`} />
          <Stat label={t('dashboard.receivable')} value={money(s.receivable)} hint={t('dashboard.receivableHint')} />
          <Stat label={t('dashboard.payable')} value={money(s.payable)} hint={t('dashboard.payableHint')} />
          <Stat label={t('dashboard.stockValue')} value={money(s.stock_value)} hint={`${t('category.PADDY')} ${kg(s.paddy_kg)} · ${t('category.UNSORTED')} ${kg(s.unsorted_kg)} · ${t('category.RICE')} ${kg(s.rice_kg)}`} />
        </div>
      )}
      {!books && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('category.PADDY')} value={kg((stock ?? []).filter((r) => r.category === 'PADDY').reduce((a, r) => a + num(r.qty_kg), 0))} />
          <Stat label={t('category.UNSORTED')} value={kg((stock ?? []).filter((r) => r.category === 'UNSORTED').reduce((a, r) => a + num(r.qty_kg), 0))} />
          <Stat label={t('category.RICE')} value={kg((stock ?? []).filter((r) => r.category === 'RICE').reduce((a, r) => a + num(r.qty_kg), 0))} />
          <Stat label={t('production.running')} value={batches?.length ?? 0} />
        </div>
      )}
      {books && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Card title={t('dashboard.thisMonth', { month: monthName })}>
            <dl className="space-y-2 text-sm">
              <Row k={t('nav.sales')} v={money(s.sales)} />
              <Row k={t('nav.purchases')} v={money(s.purchases)} />
              <Row k={t('dashboard.expenses')} v={money(s.expenses)} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <dt>{t('dashboard.profit')}</dt>
                <dd className={s.profit < 0 ? 'text-red-600' : 'text-brand-800'}>{money(s.profit)}</dd>
              </div>
              {s.pending_cheques > 0 && (
                <Link to="/money/cheques" className="block pt-1 text-xs text-amber-700 hover:underline">
                  {t('dashboard.pendingCheques', { count: s.pending_cheques })}
                </Link>
              )}
            </dl>
          </Card>
          <Card title={t('dashboard.trend')} className="lg:col-span-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.trend} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} width={48} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sales" name={t('nav.sales')} fill="#15803d" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="purchases" name={t('nav.purchases')} fill="#d97706" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('production.running')} padded={false} actions={<Link to="/production" className="text-xs text-brand-700 hover:underline">{t('common.viewAll')}</Link>}>
          <Table
            rows={batches}
            rowKey={(b) => b.id}
            empty={t('dashboard.noBatches')}
            columns={[
              {
                key: 'no',
                header: t('production.batch'),
                cell: (b) => (
                  <Link to={`/production/${b.id}`} className="font-medium text-brand-800 hover:underline">
                    {b.batch_no}
                  </Link>
                ),
              },
              { key: 'start', header: t('production.started'), cell: (b) => date(b.start_date) },
              { key: 'section', header: t('production.sectionLabel'), cell: (b) => <Badge tone={kindTone(b.kind)}>{t(`production.section.${b.kind}`)}</Badge> },
              { key: 'kg', header: t('production.kgIn'), align: 'right', cell: (b) => qty(b.input_kg) },
            ]}
          />
        </Card>
        {books ? (
          <Card title={t('dashboard.topDues')} padded={false} actions={<Link to="/reports/dues" className="text-xs text-brand-700 hover:underline">{t('common.viewAll')}</Link>}>
            <Table
              rows={topDues}
              rowKey={(p) => p.id}
              empty={t('dashboard.noDues')}
              columns={[
                {
                  key: 'name',
                  header: t('common.party'),
                  cell: (p) => (
                    <Link to={`/parties/${p.id}`} className="text-brand-800 hover:underline">
                      {nameOf(p)}
                    </Link>
                  ),
                },
                { key: 'phone', header: t('common.phone'), cell: (p) => <span className="text-slate-500">{p.phone}</span> },
                { key: 'bal', header: t('common.due'), align: 'right', cell: (p) => money(p.balance) },
              ]}
            />
          </Card>
        ) : null}
        {low.length > 0 && (
          <Card title={t('dashboard.lowStock')} padded={false}>
            <Table
              rows={low}
              rowKey={(r) => `${r.item_id}-${r.warehouse_id}`}
              columns={[
                { key: 'item', header: t('common.item'), cell: (r) => nameOf({ name: r.item_name, name_bn: r.item_name_bn }) },
                { key: 'wh', header: t('stock.warehouse'), cell: (r) => r.warehouse_name },
                { key: 'kg', header: t('unit.kg'), align: 'right', cell: (r) => qty(r.qty_kg) },
                { key: 'min', header: t('items.reorderLevel'), align: 'right', cell: (r) => qty(r.reorder_level_kg) },
              ]}
            />
          </Card>
        )}
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  )
}
