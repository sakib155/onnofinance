import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Factory, PlayCircle, Plus, TrendingDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { nameOf } from '@/components/common'
import { ButtonLink } from '@/components/ui/button'
import { Badge, Card, Loading } from '@/components/ui/layout'
import { useStockSummary } from '@/features/stock/StockPage'
import { useData } from '@/lib/data'
import { dateTime, duration, iso, kg, minutesBetween, money, monthStart, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { lotOrigin, type ItemCategory } from '@/lib/types'
import { useNow } from '@/lib/useNow'
import { kindTone, SECTION, type Batch, type BatchInputLot, type BatchKind } from './types'

type Period = 'today' | 'week' | 'month'
const PERIODS: Period[] = ['today', 'week', 'month']
const fromDate = (p: Period) => (p === 'today' ? today() : p === 'week' ? iso(new Date(Date.now() - 6 * 86_400_000)) : monthStart())
const KINDS: BatchKind[] = ['DRYER', 'SORTER']
const REFRESH = 60_000
// A running batch past this many times its section's usual time is flagged
const SLOW = 1.5
// A finished batch this many points under its section's usual yield is flagged
const LOW_YIELD_POINTS = 3

type Output = {
  qty_kg: number
  unit_cost: number
  item: { id: string; name: string; name_bn: string | null; category: ItemCategory }
  batch: { kind: BatchKind; completed_date: string }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function MillPage() {
  const { t, i18n } = useTranslation()
  const can = useCan()
  const books = can('books')
  const bn = i18n.language === 'bn'
  const now = useNow()
  const [period, setPeriod] = useState<Period>('today')
  const from = fromDate(period)
  const live = { refetchInterval: REFRESH }

  const { data: running, isLoading, dataUpdatedAt } = useData<Batch[]>(
    ['mill', 'running'],
    () => supabase.from('v_production_batches').select('*').eq('status', 'RUNNING').order('started_at'),
    live,
  )
  const { data: done } = useData<Batch[]>(
    ['mill', 'done'],
    () => supabase.from('v_production_batches').select('*').eq('status', 'COMPLETED').order('completed_date', { ascending: false }).order('completed_at', { ascending: false }).limit(60),
    live,
  )
  const ids = (running ?? []).map((b) => b.id)
  const { data: lots } = useData<(BatchInputLot & { batch_id: string })[]>(
    ['mill', 'lots', ids],
    () => supabase.from('v_batch_input_lots').select('*').in('batch_id', ids).eq('purpose', 'MATERIAL'),
    { enabled: ids.length > 0 },
  )
  const { data: costs } = useData<{ batch_id: string; amount: number }[]>(
    ['mill', 'costs', ids],
    () => supabase.from('production_costs').select('batch_id, amount').in('batch_id', ids),
    { enabled: ids.length > 0 },
  )
  const { data: outputs } = useData<Output[]>(
    ['mill', 'outputs', from],
    () =>
      supabase
        .from('production_outputs')
        .select('qty_kg, unit_cost, item:items(id, name, name_bn, category), batch:production_batches!inner(kind, completed_date, status)')
        .eq('batch.status', 'COMPLETED')
        .gte('batch.completed_date', from)
        .lte('batch.completed_date', today()) as never,
    live,
  )
  const { data: stock } = useStockSummary()

  if (isLoading) return <Loading />

  const finished = (done ?? []).filter((b) => b.completed_date && b.completed_date >= from && b.completed_date <= today())
  const stockKg = (c: ItemCategory) => (stock ?? []).filter((r) => r.category === c).reduce((a, r) => a + num(r.qty_kg), 0)

  // the section's usual time and yield, from its recent finished batches
  const usual = (k: BatchKind) => {
    const recent = (done ?? []).filter((b) => b.kind === k).slice(0, 15)
    return {
      minutes: avg(recent.map((b) => b.minutes_taken).filter((m): m is number => m != null && num(m) > 0).map(num)),
      yieldPct: avg(recent.map((b) => b.main_yield_pct).filter((y): y is number => y != null).map(num)),
    }
  }

  const byproducts = Object.values(
    (outputs ?? [])
      .filter((o) => o.item.category === 'BYPRODUCT')
      .reduce<Record<string, { item: Output['item']; kg: number; value: number; kinds: Set<BatchKind> }>>((acc, o) => {
        const r = (acc[o.item.id] ??= { item: o.item, kg: 0, value: 0, kinds: new Set() })
        r.kg += num(o.qty_kg)
        r.value += num(o.qty_kg) * num(o.unit_cost)
        r.kinds.add(o.batch.kind)
        return acc
      }, {}),
  ).sort((a, b) => b.kg - a.kg)
  const maxBy = Math.max(1, ...byproducts.map((b) => b.kg))

  // today's events, newest first
  const events = [
    ...[...(running ?? []), ...(done ?? [])]
      .filter((b) => b.started_at && new Date(b.started_at).toDateString() === now.toDateString())
      .map((b) => ({ at: b.started_at!, b, kind: 'start' as const })),
    ...(done ?? [])
      .filter((b) => b.completed_at && new Date(b.completed_at).toDateString() === now.toDateString())
      .map((b) => ({ at: b.completed_at!, b, kind: 'finish' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const periodLabel = t(`mill.period.${period}`)
  const updated = dataUpdatedAt ? new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(dataUpdatedAt)) : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Factory className="size-5 text-brand-700" />
            {t('mill.title')}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
            </span>
            {t('mill.live', { time: updated })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('production') &&
            KINDS.map((k) => (
              <ButtonLink key={k} to={`/production/new?section=${k}`} variant="secondary" size="sm">
                <Plus className="size-4" />
                {t(`production.newBatchOf.${k}`)}
              </ButtonLink>
            ))}
        </div>
      </div>

      {/* The two sections, live */}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {KINDS.map((k) => {
          const batches = (running ?? []).filter((b) => b.kind === k)
          const u = usual(k)
          const waitingCat = SECTION[k].material
          return (
            <Card
              key={k}
              title={
                <span className="flex items-center gap-2">
                  {t(`production.section.${k}`)}
                  {batches.length ? (
                    <Badge tone="blue">{t('dashboard.runningCount', { count: batches.length })}</Badge>
                  ) : (
                    <Badge>{t('dashboard.idle')}</Badge>
                  )}
                </span>
              }
              actions={
                <Link to={`/production?section=${k}`} className="text-xs text-brand-700 hover:underline">
                  {t('common.viewAll')}
                </Link>
              }
            >
              {batches.length ? (
                <div className="space-y-3">
                  {batches.map((b) => {
                    const elapsed = minutesBetween(b.started_at, now)
                    const pct = u.minutes ? Math.min(100, (100 * elapsed) / u.minutes) : null
                    const slow = u.minutes != null && elapsed > u.minutes * SLOW
                    const eta = u.minutes && b.started_at ? new Date(new Date(b.started_at).getTime() + u.minutes * 60_000) : null
                    const used = (lots ?? []).filter((l) => l.batch_id === b.id)
                    const costSoFar = num(b.input_cost) + (costs ?? []).filter((c) => c.batch_id === b.id).reduce((a, c) => a + num(c.amount), 0)
                    return (
                      <Link key={b.id} to={`/production/${b.id}`} className="block rounded-xl border border-slate-200 p-3 hover:border-slate-300 hover:bg-slate-50">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{b.batch_no}</div>
                            <div className="text-xs text-slate-500">
                              {kg(b.input_kg)} {t(`category.${waitingCat}`).toLowerCase()} · {t('production.inputAt')} {dateTime(b.started_at)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={clsx('flex items-center justify-end gap-1 text-lg font-semibold tabular-nums', slow ? 'text-red-600' : 'text-sky-700')}>
                              <Clock className="size-4" />
                              {duration(elapsed)}
                            </div>
                            {slow ? (
                              <div className="text-xs font-medium text-red-600">{t('mill.slow')}</div>
                            ) : eta ? (
                              <div className="text-xs text-slate-500">{t('mill.expected', { time: dateTime(eta.toISOString()) })}</div>
                            ) : null}
                          </div>
                        </div>
                        {pct != null && (
                          <div className="mt-2">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className={clsx('h-full rounded-full', slow ? 'bg-red-500' : pct >= 100 ? 'bg-amber-500' : 'bg-sky-500')} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{t('mill.usual', { time: duration(u.minutes) })}</div>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 text-slate-600">
                            {used.length
                              ? used.map((l) => [l.lot_no, lotOrigin(l, bn)].filter(Boolean).join(' · ')).join(', ')
                              : t('stock.fifo')}
                          </span>
                          {books && <span className="font-medium text-slate-700 tabular-nums">{t('mill.costSoFar', { amount: money(costSoFar) })}</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500">
                  <PlayCircle className="size-8 text-slate-300" />
                  {t('mill.idle', { section: t(`production.section.${k}`) })}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">
                  {t('mill.waiting', { what: t(`category.${waitingCat}`) })}: <b className="text-slate-900">{kg(stockKg(waitingCat))}</b>
                </span>
                <span className="text-xs text-slate-500">
                  {u.minutes != null && t('mill.usualShort', { time: duration(u.minutes) })}
                  {u.minutes != null && u.yieldPct != null && ' · '}
                  {u.yieldPct != null && t('mill.usualYield', { pct: qty(u.yieldPct, 1) })}
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* What the mill made in the period */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{t('mill.made', { period: periodLabel })}</h2>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={clsx('rounded-md px-3 py-1 whitespace-nowrap', period === p ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}>
              {t(`mill.period.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        {KINDS.map((k) => {
          const fs = finished.filter((b) => b.kind === k)
          const inKg = fs.reduce((a, b) => a + num(b.input_kg), 0)
          const outKg = fs.reduce((a, b) => a + num(b.main_kg), 0)
          const mins = avg(fs.map((b) => b.minutes_taken).filter((m): m is number => m != null).map(num))
          return (
            <Tile
              key={k}
              tone={kindTone(k)}
              label={t(`mill.processed.${k}`)}
              value={kg(inKg)}
              lines={[
                t(`mill.gave.${k}`, { kg: kg(outKg), pct: inKg ? qty((100 * outKg) / inKg, 1) : '—' }),
                t('mill.batchesDone', { count: fs.length }) + (mins != null ? ` · ${t('mill.avgTook', { time: duration(mins) })}` : ''),
              ]}
            />
          )
        })}
        <Tile
          tone="violet"
          label={t('mill.byproductsMade')}
          value={kg(byproducts.reduce((a, b) => a + b.kg, 0))}
          lines={[books ? t('mill.worth', { amount: money(byproducts.reduce((a, b) => a + b.value, 0)) }) : '', t('mill.kinds', { count: byproducts.length })].filter(Boolean)}
        />
        <Tile
          tone="green"
          label={t('mill.inStock')}
          value={kg(stockKg('RICE'))}
          lines={[`${t('category.UNSORTED')}: ${kg(stockKg('UNSORTED'))}`, `${t('category.BYPRODUCT')}: ${kg(stockKg('BYPRODUCT'))}`]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* By-products made, by item */}
        <Card title={t('mill.byproductsBreakdown', { period: periodLabel })}>
          {byproducts.length ? (
            <ul className="space-y-2.5">
              {byproducts.map((r) => (
                <li key={r.item.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-slate-800">
                      {nameOf(r.item)}
                      <span className="ml-1 text-xs text-slate-400">{[...r.kinds].map((k) => t(`mill.short.${k}`)).join(' + ')}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      <b>{kg(r.kg)}</b>
                      {books && <span className="ml-1 text-xs text-slate-500">{money(r.value)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * r.kg) / maxBy}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{t('mill.noneMade', { period: periodLabel.toLowerCase() })}</p>
          )}
        </Card>

        {/* Today, as it happened */}
        <Card title={t('mill.todayTimeline')}>
          {events.length ? (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={`${e.kind}-${e.b.id}`} className="relative">
                  <span
                    className={clsx(
                      'absolute top-1 -left-[21px] flex size-2.5 rounded-full ring-4 ring-white',
                      e.kind === 'start' ? 'bg-sky-500' : 'bg-brand-600',
                    )}
                  />
                  <div className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(e.at))}
                  </div>
                  <Link to={`/production/${e.b.id}`} className="text-sm text-slate-800 hover:text-brand-800">
                    {e.kind === 'start'
                      ? t('mill.eventStart', { no: e.b.batch_no, kg: kg(e.b.input_kg), what: t(`category.${SECTION[e.b.kind].material}`).toLowerCase() })
                      : t('mill.eventFinish', { no: e.b.batch_no, kg: kg(e.b.main_kg), what: t(`category.${SECTION[e.b.kind].main}`).toLowerCase() })}
                  </Link>
                  {e.kind === 'finish' && e.b.minutes_taken != null && <div className="text-xs text-slate-500">{t('production.took', { time: duration(e.b.minutes_taken) })}</div>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{t('mill.quietToday')}</p>
          )}
        </Card>

        {/* Recent batches with warnings */}
        <Card title={t('mill.recent')} padded={false}>
          {(done ?? []).length ? (
            <ul className="divide-y divide-slate-100">
              {(done ?? []).slice(0, 8).map((b) => {
                const u = usual(b.kind)
                const lowYield = u.yieldPct != null && b.main_yield_pct != null && num(b.main_yield_pct) < u.yieldPct - LOW_YIELD_POINTS
                const long = u.minutes != null && b.minutes_taken != null && num(b.minutes_taken) > u.minutes * SLOW
                return (
                  <li key={b.id}>
                    <Link to={`/production/${b.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                          {b.batch_no}
                          <Badge tone={kindTone(b.kind)}>{t(`mill.short.${b.kind}`)}</Badge>
                        </span>
                        <span className="text-xs text-slate-500">
                          {kg(b.input_kg)} → {kg(b.main_kg)}
                          {b.minutes_taken != null && ` · ${duration(b.minutes_taken)}`}
                        </span>
                      </span>
                      <span className="text-right text-xs">
                        <span className={clsx('block font-semibold tabular-nums', lowYield ? 'text-red-600' : 'text-slate-800')}>
                          {b.main_yield_pct != null ? `${qty(b.main_yield_pct, 1)}%` : '—'}
                        </span>
                        {books && b.main_cost_per_kg != null && <span className="block text-slate-500 tabular-nums">{money(b.main_cost_per_kg)}/{t('unit.kg')}</span>}
                        {(lowYield || long) && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-amber-700">
                            {lowYield ? <TrendingDown className="size-3" /> : <AlertTriangle className="size-3" />}
                            {lowYield ? t('mill.lowYield') : t('mill.tookLong')}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{t('common.nothing')}</p>
          )}
          <Link to="/production" className="flex items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-brand-700 hover:bg-slate-50">
            {t('mill.allBatches')}
            <ArrowRight className="size-3" />
          </Link>
        </Card>
      </div>
    </div>
  )
}

const TILE_TONES: Record<string, string> = {
  amber: 'border-l-amber-400',
  violet: 'border-l-violet-400',
  green: 'border-l-brand-500',
  blue: 'border-l-sky-400',
  slate: 'border-l-slate-300',
}

function Tile({ label, value, lines, tone }: { label: ReactNode; value: ReactNode; lines: string[]; tone: string }) {
  return (
    <div className={clsx('rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm', TILE_TONES[tone] ?? TILE_TONES.slate)}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {lines.map((l) => (
        <div key={l} className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
          <CheckCircle2 className="size-3 shrink-0 text-slate-300" />
          {l}
        </div>
      ))}
    </div>
  )
}
