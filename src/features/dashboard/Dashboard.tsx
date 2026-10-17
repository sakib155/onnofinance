import clsx from 'clsx'
import {
  ArrowDownToLine,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  Factory,
  Landmark,
  PackageMinus,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth, useCan } from '@/app/auth'
import { VIEW } from '@/app/Layout'
import { nameOf } from '@/components/common'
import { Badge, Card, Loading, type Tone } from '@/components/ui/layout'
import { useBatches } from '@/features/production/ProductionPage'
import type { BatchKind } from '@/features/production/types'
import { useStockSummary } from '@/features/stock/StockPage'
import type { OrderRow } from '@/features/trading/OrdersPage'
import { ProgressBadge } from '@/features/trading/OrdersPage'
import { useData, useParties } from '@/lib/data'
import { ageDays, date, kg, money, monthStart, num, qty, today, yearStart } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Section = {
  running: number
  running_kg: number
  completed: number
  material_kg: number
  main_kg: number
  byproduct_kg: number
  yield_pct: number | null
  cost_per_kg: number | null
}

type Recent = { kind: string; id: string; doc_no: string; doc_date: string; party: string | null; amount: number; created_at: string }

type Stats = {
  cash: number
  bank: number
  receivable: number
  payable: number
  stock_value: number
  sales: number
  sales_count: number
  sales_kg: number
  gross_profit: number
  purchases: number
  purchases_count: number
  expenses: number
  received: number
  paid: number
  profit: number
  cheques: { in_count: number; in_amount: number; out_count: number; out_amount: number; due_week: number; overdue: number }
  stock: { category: 'PADDY' | 'UNSORTED' | 'RICE' | 'BYPRODUCT'; kg: number; value: number }[]
  sections: Record<BatchKind, Section>
  trend: { month: string; sales: number; purchases: number; gross_profit: number }[]
  recent: Recent[]
}

type Period = 'today' | 'month' | 'year'
const PERIODS: Period[] = ['today', 'month', 'year']
const range = (p: Period) => ({ from: p === 'today' ? today() : p === 'month' ? monthStart() : yearStart(), to: today() })

const compact = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const pct = (v: number) => `${qty(v, 1)}%`
// A batch running longer than this is worth a look
const LONG_BATCH_DAYS = 3

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const can = useCan()
  const { profile } = useAuth()
  const books = can('books')
  const [period, setPeriod] = useState<Period>('month')
  const { from, to } = range(period)
  const { data: raw, isLoading } = useData<Partial<Stats>>(['dashboard', from, to], () => supabase.rpc('dashboard_stats', { p_from: from, p_to: to }))
  const { data: running } = useBatches('RUNNING')
  const { data: parties } = useParties()
  const { data: stock } = useStockSummary()
  const { data: orders } = useData<OrderRow[]>(['orders', 'open', 'dashboard'], () =>
    supabase.from('v_sales_orders').select('*').eq('status', 'OPEN').order('delivery_date', { ascending: true, nullsFirst: false }),
  )

  if (isLoading || !raw) return <Loading />
  const s = withDefaults(raw)

  const toDeliver = (orders ?? []).filter((o) => o.progress !== 'DELIVERED')
  const overdueOrders = toDeliver.filter((o) => o.overdue)
  const overLimit = (parties ?? []).filter((p) => p.credit_limit != null && num(p.balance) > num(p.credit_limit) + 0.005)
  const low = (stock ?? []).filter((r) => r.reorder_level_kg != null && num(r.qty_kg) < num(r.reorder_level_kg))
  const longBatches = (running ?? []).filter((b) => ageDays(b.start_date) > LONG_BATCH_DAYS)
  const topDues = [...(parties ?? [])].filter((p) => num(p.balance) > 0.005).sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 5)
  const stockOf = (c: Stats['stock'][number]['category']) => s.stock.find((x) => x.category === c) ?? { kg: 0, value: 0 }
  const margin = num(s.sales) > 0 ? (100 * num(s.gross_profit)) / num(s.sales) : 0
  const periodLabel = t(`dashboard.period.${period}`)
  const hour = new Date().getHours()
  const greeting = t(hour < 12 ? 'dashboard.morning' : hour < 17 ? 'dashboard.afternoon' : 'dashboard.evening', { name: profile?.full_name?.split(' ')[0] || '' })

  const attention: { icon: LucideIcon; tone: Tone; text: string; to: string }[] = []
  if (can(...VIEW.sales) && overdueOrders.length)
    attention.push({ icon: ClipboardList, tone: 'red', text: t('dashboard.attn.overdueOrders', { count: overdueOrders.length }), to: '/orders' })
  if (books && s.cheques.overdue)
    attention.push({ icon: Clock, tone: 'red', text: t('dashboard.attn.chequesOverdue', { count: s.cheques.overdue }), to: '/money/cheques' })
  else if (books && s.cheques.due_week)
    attention.push({ icon: Clock, tone: 'amber', text: t('dashboard.attn.chequesWeek', { count: s.cheques.due_week }), to: '/money/cheques' })
  if (books && overLimit.length)
    attention.push({ icon: UserX, tone: 'red', text: t('dashboard.attn.overLimit', { count: overLimit.length }), to: '/reports/dues' })
  if (low.length) attention.push({ icon: PackageMinus, tone: 'amber', text: t('dashboard.attn.lowStock', { count: low.length }), to: '/stock' })
  if (can(...VIEW.production) && longBatches.length)
    attention.push({ icon: Factory, tone: 'amber', text: t('dashboard.attn.longBatches', { count: longBatches.length, days: LONG_BATCH_DAYS }), to: '/production' })
  if (can(...VIEW.sales) && toDeliver.length)
    attention.push({
      icon: ClipboardList,
      tone: 'blue',
      text: t('dashboard.attn.toDeliver', { count: toDeliver.length, kg: kg(toDeliver.reduce((a, o) => a + num(o.remaining_kg), 0)) }),
      to: '/orders',
    })

  const recentLink = (r: Recent): { to: string; label: string; ok: boolean } => {
    const [kind, sub] = r.kind.split(':')
    if (kind === 'SALE') return { to: `/sales/${r.id}`, label: t('dashboard.kind.SALE'), ok: can(...VIEW.sales) }
    if (kind === 'ORDER') return { to: `/orders/${r.id}`, label: t('dashboard.kind.ORDER'), ok: can(...VIEW.sales) }
    if (kind === 'PURCHASE') return { to: `/purchases/${r.id}`, label: t('dashboard.kind.PURCHASE'), ok: can(...VIEW.purchases) }
    if (kind === 'MONEY') return { to: `/money/${r.id}`, label: t(`money.type.${sub}`), ok: can(...VIEW.money) }
    return { to: `/production/${r.id}`, label: t(`production.section.${sub}`), ok: can(...VIEW.production) }
  }
  const recent = s.recent.map((r) => ({ ...r, link: recentLink(r) })).filter((r) => r.link.ok).slice(0, 8)

  return (
    <div className="space-y-4">
      {/* Greeting, period and quick actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{greeting}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {new Intl.DateTimeFormat(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-auto">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={clsx('rounded-md px-2 py-1 whitespace-nowrap sm:px-3', period === p ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}>
              {t(`dashboard.period.${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {can('sale') && <Action to="/orders/new" icon={ClipboardList} label={t('orders.new')} />}
        {can('sale') && <Action to="/sales/new" icon={ShoppingCart} label={t('trading.newSale')} />}
        {can('purchase') && <Action to="/purchases/new" icon={ArrowDownToLine} label={t('trading.newPurchase')} />}
        {can('production') && <Action to="/production/new?section=DRYER" icon={Factory} label={t('production.newBatchOf.DRYER')} />}
        {can('production') && <Action to="/production/new?section=SORTER" icon={Factory} label={t('production.newBatchOf.SORTER')} />}
        {can('money') && <Action to="/money" icon={Banknote} label={t('dashboard.moneyInOut')} />}
      </div>

      {/* Money position */}
      {books && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
          <Kpi icon={Wallet} accent="brand" label={t('dashboard.cash')} value={money(s.cash)} hint={`${t('dashboard.bank')}: ${money(s.bank)}`} to="/accounts" />
          <Kpi icon={TrendingUp} accent="sky" label={t('dashboard.receivable')} value={money(s.receivable)} hint={t('dashboard.receivableHint')} to="/reports/dues" />
          <Kpi icon={TrendingDown} accent="amber" label={t('dashboard.payable')} value={money(s.payable)} hint={t('dashboard.payableHint')} to="/reports/dues" />
          <Kpi
            icon={Landmark}
            accent="violet"
            label={t('dashboard.netPosition')}
            value={money(num(s.cash) + num(s.bank) + num(s.receivable) - num(s.payable) + num(s.stock_value))}
            hint={t('dashboard.netPositionHint')}
            to="/reports/balance-sheet"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Needs attention */}
        <Card title={t('dashboard.attention')}>
          {attention.length ? (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link to={a.to} className="group flex items-center gap-3 rounded-lg border border-slate-100 p-2.5 hover:border-slate-200 hover:bg-slate-50">
                    <span
                      className={clsx(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        a.tone === 'red' ? 'bg-red-50 text-red-600' : a.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600',
                      )}
                    >
                      <a.icon className="size-4" />
                    </span>
                    <span className="flex-1 text-sm text-slate-700">{a.text}</span>
                    <ArrowRight className="size-4 text-slate-300 group-hover:text-slate-500" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500">
              <CheckCircle2 className="size-8 text-brand-600" />
              {t('dashboard.allClear')}
            </div>
          )}
        </Card>

        {/* Performance for the chosen period */}
        <Card title={t('dashboard.performance', { period: periodLabel })} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Figure label={t('nav.sales')} value={money(s.sales)} hint={t('dashboard.salesHint', { count: num(s.sales_count), kg: kg(s.sales_kg) })} />
            {books ? (
              <Figure label={t('dashboard.grossProfit')} value={money(s.gross_profit)} hint={t('dashboard.margin', { pct: pct(margin) })} tone={num(s.gross_profit) < 0 ? 'down' : 'up'} />
            ) : (
              <Figure label={t('nav.purchases')} value={money(s.purchases)} hint={t('dashboard.billsCount', { count: num(s.purchases_count) })} />
            )}
            {books && <Figure label={t('dashboard.collected')} value={money(s.received)} hint={`${t('dashboard.paidOut')}: ${money(s.paid)}`} />}
            {books && <Figure label={t('dashboard.netProfit')} value={money(s.profit)} hint={`${t('dashboard.expenses')}: ${money(s.expenses)}`} tone={num(s.profit) < 0 ? 'down' : 'up'} />}
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={s.trend} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => new Intl.DateTimeFormat(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short' }).format(new Date(`${m}-01`))}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} width={48} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name={t('nav.sales')} fill="#15803d" radius={[3, 3, 0, 0]} />
                <Bar dataKey="purchases" name={t('nav.purchases')} fill="#d97706" radius={[3, 3, 0, 0]} />
                {books && <Line dataKey="gross_profit" name={t('dashboard.grossProfit')} stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} type="monotone" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* The mill: paddy -> dryer -> unsorted -> sorter -> sorted rice, by-products from both */}
      <Card
        title={t('dashboard.millFlow')}
        actions={
          <Link to="/stock" className="text-xs text-brand-700 hover:underline">
            {t('nav.stockSummary')}
          </Link>
        }
      >
        <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1.4fr_auto_1fr_auto_1.4fr_auto_1fr]">
          <StockNode label={t('category.PADDY')} kg={stockOf('PADDY').kg} value={books ? stockOf('PADDY').value : undefined} tone="amber" />
          <Arrow />
          <SectionNode kind="DRYER" s={s.sections.DRYER} period={periodLabel} books={books} />
          <Arrow />
          <StockNode label={t('category.UNSORTED')} kg={stockOf('UNSORTED').kg} value={books ? stockOf('UNSORTED').value : undefined} tone="sky" />
          <Arrow />
          <SectionNode kind="SORTER" s={s.sections.SORTER} period={periodLabel} books={books} />
          <Arrow />
          <StockNode label={t('category.RICE')} kg={stockOf('RICE').kg} value={books ? stockOf('RICE').value : undefined} tone="brand" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">
            {t('dashboard.byproductsStock')}: <b className="text-slate-800">{kg(stockOf('BYPRODUCT').kg)}</b>
            {books && <span className="text-slate-500"> · {money(stockOf('BYPRODUCT').value)}</span>}
          </span>
          <span className="text-xs text-slate-500">
            {t('dashboard.byproductsMade', { period: periodLabel, kg: kg(num(s.sections.DRYER.byproduct_kg) + num(s.sections.SORTER.byproduct_kg)) })}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Orders to deliver */}
        {can(...VIEW.sales) && (
          <Card title={t('dashboard.ordersToDeliver')} padded={false} actions={<ViewAll to="/orders" />}>
            {toDeliver.length ? (
              <ul className="divide-y divide-slate-100">
                {toDeliver.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Link to={`/orders/${o.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{nameOf({ name: o.customer_name, name_bn: o.customer_name_bn })}</span>
                        <ProgressBadge o={o} />
                      </div>
                      <div className="mt-0.5 flex justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {o.order_no}
                          {o.po_number && ` · PO ${o.po_number}`}
                        </span>
                        <span className={clsx(o.overdue && 'font-medium text-red-600')}>
                          {kg(o.remaining_kg)}
                          {o.delivery_date && ` · ${date(o.delivery_date)}`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, num(o.delivered_pct))}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t('dashboard.noOrders')}</p>
            )}
          </Card>
        )}

        {/* Biggest dues */}
        {books && (
          <Card title={t('dashboard.topDues')} padded={false} actions={<ViewAll to="/reports/dues" />}>
            {topDues.length ? (
              <ul className="divide-y divide-slate-100">
                {topDues.map((p) => {
                  const over = p.credit_limit != null && num(p.balance) > num(p.credit_limit)
                  return (
                    <li key={p.id}>
                      <Link to={`/parties/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-800">{nameOf(p)}</span>
                          <span className="text-xs text-slate-500">{p.phone}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-medium tabular-nums text-slate-900">{money(p.balance)}</span>
                          {over && <Badge tone="red">{t('dashboard.overLimit')}</Badge>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t('dashboard.noDues')}</p>
            )}
          </Card>
        )}

        {/* Recent activity */}
        <Card title={t('dashboard.recent')} padded={false}>
          {recent.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <Link to={r.link.to} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-800">
                        <span className="font-medium">{r.doc_no}</span>
                        {r.party && <span className="text-slate-500"> · {r.party}</span>}
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.link.label} · {date(r.doc_date)}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums whitespace-nowrap text-slate-700">{r.kind.startsWith('BATCH') ? kg(r.amount) : money(r.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('common.nothing')}</p>
          )}
        </Card>
      </div>
    </div>
  )
}

const NO_SECTION: Section = { running: 0, running_kg: 0, completed: 0, material_kg: 0, main_kg: 0, byproduct_kg: 0, yield_pct: null, cost_per_kg: null }

// Figures missing from an older dashboard_stats (before migration 0016) show as zero instead of breaking the page
function withDefaults(r: Partial<Stats>): Stats {
  return {
    cash: 0, bank: 0, receivable: 0, payable: 0, stock_value: 0, sales: 0, sales_count: 0, sales_kg: 0, gross_profit: 0,
    purchases: 0, purchases_count: 0, expenses: 0, received: 0, paid: 0, profit: 0, trend: [], recent: [], stock: [],
    ...r,
    cheques: { in_count: 0, in_amount: 0, out_count: 0, out_amount: 0, due_week: 0, overdue: 0, ...r.cheques },
    sections: { DRYER: { ...NO_SECTION, ...r.sections?.DRYER }, SORTER: { ...NO_SECTION, ...r.sections?.SORTER } },
  }
}

function Action({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800">
      <Icon className="size-4 shrink-0 text-brand-700" />
      <span className="leading-tight">{label}</span>
    </Link>
  )
}

const ACCENTS = {
  brand: 'bg-brand-50 text-brand-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
}

function Kpi({ icon: Icon, accent, label, value, hint, to }: { icon: LucideIcon; accent: keyof typeof ACCENTS; label: string; value: string; hint?: string; to: string }) {
  return (
    <Link to={to} className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
      <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-lg', ACCENTS[accent])}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className="block truncate text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
      </span>
    </Link>
  )
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={clsx('text-lg font-semibold tabular-nums', tone === 'down' ? 'text-red-600' : tone === 'up' ? 'text-brand-800' : 'text-slate-900')}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

const NODE_TONES = {
  amber: 'border-amber-200 bg-amber-50/60',
  sky: 'border-sky-200 bg-sky-50/60',
  brand: 'border-brand-200 bg-brand-50/60',
}

function StockNode({ label, kg: kgValue, value, tone }: { label: string; kg: number; value?: number; tone: keyof typeof NODE_TONES }) {
  const { t } = useTranslation()
  return (
    <div className={clsx('flex flex-col justify-center rounded-xl border p-3', NODE_TONES[tone])}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-900">{kg(kgValue)}</div>
      <div className="text-xs text-slate-500">
        {t('dashboard.inStock')}
        {value != null && ` · ${money(value)}`}
      </div>
    </div>
  )
}

function SectionNode({ kind, s, period, books }: { kind: BatchKind; s: Section; period: string; books: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to={`/production?section=${kind}`} className="flex flex-col justify-center rounded-xl border border-dashed border-slate-300 bg-white p-3 hover:border-slate-400">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Factory className="size-3.5" />
          {t(`production.section.${kind}`)}
        </span>
        {num(s.running) > 0 ? <Badge tone="blue">{t('dashboard.runningCount', { count: num(s.running) })}</Badge> : <Badge>{t('dashboard.idle')}</Badge>}
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <SmallRow k={t('dashboard.processed', { period })} v={kg(s.material_kg)} />
        <SmallRow k={t('production.avgYield')} v={s.yield_pct != null ? pct(num(s.yield_pct)) : '—'} />
        {books && <SmallRow k={t('dashboard.costPerKg')} v={s.cost_per_kg != null ? money(s.cost_per_kg) : '—'} />}
      </dl>
    </Link>
  )
}

function SmallRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium whitespace-nowrap tabular-nums text-slate-800">{v}</dd>
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-slate-300">
      <ArrowRight className="size-5 rotate-90 md:rotate-0" />
    </div>
  )
}

function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation()
  return (
    <Link to={to} className="text-xs text-brand-700 hover:underline">
      {t('common.viewAll')}
    </Link>
  )
}
