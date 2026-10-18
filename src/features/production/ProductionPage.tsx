import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { date, dateTime, duration, kg, minutesBetween, money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useNow } from '@/lib/useNow'
import { statusTone, type Batch, type BatchKind } from './types'

export function useBatches(status?: string, kind?: BatchKind) {
  return useData<Batch[]>(['batches', status, kind], () => {
    let q = supabase.from('v_production_batches').select('*').order('start_date', { ascending: false }).order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    if (kind) q = q.eq('kind', kind)
    return q
  })
}

export function ProductionPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const kind = (params.get('section') === 'SORTER' ? 'SORTER' : 'DRYER') as BatchKind
  const [status, setStatus] = useState('')
  const { data, isLoading } = useBatches(status, kind)
  const rows = data ?? []
  const running = rows.filter((b) => b.status === 'RUNNING')
  const done = rows.filter((b) => b.status === 'COMPLETED')
  const avg = (f: (b: Batch) => number | null) => {
    const vals = done.map(f).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((s, v) => s + num(v), 0) / vals.length : null
  }
  const avgYield = avg((b) => b.main_yield_pct)
  const avgCost = avg((b) => b.main_cost_per_kg)
  const showCost = can('books')
  const avgMinutes = avg((b) => b.minutes_taken)
  const now = useNow()

  return (
    <>
      <PageHeader
        title={t('nav.production')}
        subtitle={t(`production.sectionHelp.${kind}`)}
        actions={
          can('production') && (
            <ButtonLink to={`/production/new?section=${kind}`}>
              <Plus className="size-4" />
              {t(`production.newBatchOf.${kind}`)}
            </ButtonLink>
          )
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(['DRYER', 'SORTER'] as BatchKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setParams({ section: k }, { replace: true })}
            className={clsx('flex-1 rounded-md px-5 py-1.5', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}
          >
            {t(`production.section.${k}`)}
          </button>
        ))}
      </div>
      <div className={clsx('mb-4 grid gap-3 sm:grid-cols-2', showCost ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <Stat label={t('production.running')} value={running.length} hint={kg(running.reduce((s, b) => s + num(b.input_kg), 0))} />
        <Stat label={t('production.completed')} value={done.length} hint={kg(done.reduce((s, b) => s + num(b.main_kg), 0))} />
        <Stat label={t('production.avgTime')} value={avgMinutes != null ? duration(avgMinutes) : '—'} hint={t(`production.avgTimeHint.${kind}`)} />
        <Stat label={t('production.avgYield')} value={avgYield != null ? `${qty(avgYield)}%` : '—'} hint={t(`production.yieldMeans.${kind}`)} />
        {showCost && <Stat label={t(`production.mainCostPerKg.${kind}`)} value={avgCost != null ? money(avgCost) : '—'} hint={t('production.average')} />}
      </div>
      <Card padded={false}>
        <div className="border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">{t('common.all')}</option>
            <option value="RUNNING">{t('production.status.RUNNING')}</option>
            <option value="COMPLETED">{t('production.status.COMPLETED')}</option>
          </Select>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(b) => b.id}
          onRowClick={(b) => navigate(`/production/${b.id}`)}
          empty={t(`production.noneYet.${kind}`)}
          columns={[
            { key: 'no', header: t('production.batch'), cell: (b) => <span className="font-medium">{b.batch_no}</span> },
            { key: 'start', header: t('production.inputAt'), cell: (b) => (b.started_at ? dateTime(b.started_at) : date(b.start_date)), className: 'whitespace-nowrap' },
            {
              key: 'time',
              header: t('production.timeTaken'),
              align: 'right',
              cell: (b) =>
                b.status === 'RUNNING' ? (
                  <span className="text-sky-700">{t('production.runningFor', { time: duration(minutesBetween(b.started_at, now)) })}</span>
                ) : b.minutes_taken != null ? (
                  duration(b.minutes_taken)
                ) : (
                  ''
                ),
            },
            { key: 'status', header: t('common.status'), cell: (b) => <Badge tone={statusTone(b.status)}>{t(`production.status.${b.status}`)}</Badge> },
            { key: 'in', header: t(`production.materialIn.${kind}`), align: 'right', cell: (b) => qty(b.input_kg) },
            { key: 'out', header: t(`production.mainOut.${kind}`), align: 'right', cell: (b) => (num(b.main_kg) ? qty(b.main_kg) : '') },
            { key: 'by', header: t('production.byproducts'), align: 'right', cell: (b) => (num(b.byproduct_kg) ? qty(b.byproduct_kg) : '') },
            { key: 'yield', header: t('production.yield'), align: 'right', cell: (b) => (b.main_yield_pct != null ? `${qty(b.main_yield_pct)}%` : '') },
            ...(showCost
              ? [
                  { key: 'cost', header: t('production.totalCost'), align: 'right' as const, cell: (b: Batch) => money(b.total_cost) },
                  { key: 'perkg', header: t(`production.mainCostPerKg.${kind}`), align: 'right' as const, cell: (b: Batch) => (b.main_cost_per_kg ? money(b.main_cost_per_kg) : '') },
                ]
              : []),
          ]}
        />
      </Card>
    </>
  )
}
