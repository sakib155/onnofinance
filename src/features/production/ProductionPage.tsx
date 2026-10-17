import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { date, kg, money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { statusTone, type Batch } from './types'

export function useBatches(status?: string) {
  return useData<Batch[]>(['batches', status], () => {
    let q = supabase.from('v_production_batches').select('*').order('start_date', { ascending: false }).order('created_at', { ascending: false })
    if (status === 'RUNNING') q = q.in('status', ['SOAKING', 'DRYING', 'MILLING'])
    else if (status) q = q.eq('status', status)
    return q
  })
}

export function ProductionPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const { data, isLoading } = useBatches(status)
  const rows = data ?? []
  const running = rows.filter((b) => ['SOAKING', 'DRYING', 'MILLING'].includes(b.status))
  const done = rows.filter((b) => b.status === 'COMPLETED')
  const avgYield = done.length ? done.reduce((s, b) => s + num(b.rice_yield_pct), 0) / done.length : 0
  const showCost = can('books')

  return (
    <>
      <PageHeader
        title={t('nav.production')}
        subtitle={t('production.subtitle')}
        actions={
          can('production') && (
            <ButtonLink to="/production/new">
              <Plus className="size-4" />
              {t('production.newBatch')}
            </ButtonLink>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t('production.running')} value={running.length} hint={kg(running.reduce((s, b) => s + num(b.input_kg), 0))} />
        <Stat label={t('production.completed')} value={done.length} hint={kg(done.reduce((s, b) => s + num(b.rice_kg), 0))} />
        <Stat label={t('production.avgYield')} value={done.length ? `${qty(avgYield)}%` : '—'} hint={t('production.riceFromPaddy')} />
      </div>
      <Card padded={false}>
        <div className="border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">{t('common.all')}</option>
            <option value="RUNNING">{t('production.running')}</option>
            {['SOAKING', 'DRYING', 'MILLING', 'COMPLETED'].map((s) => (
              <option key={s} value={s}>
                {t(`production.status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(b) => b.id}
          onRowClick={(b) => navigate(`/production/${b.id}`)}
          columns={[
            { key: 'no', header: t('production.batch'), cell: (b) => <span className="font-medium">{b.batch_no}</span> },
            { key: 'start', header: t('production.started'), cell: (b) => date(b.start_date) },
            { key: 'status', header: t('common.status'), cell: (b) => <Badge tone={statusTone(b.status)}>{t(`production.status.${b.status}`)}</Badge> },
            { key: 'paddy', header: t('production.paddyIn'), align: 'right', cell: (b) => qty(b.input_kg) },
            { key: 'rice', header: t('production.riceOut'), align: 'right', cell: (b) => (num(b.rice_kg) ? qty(b.rice_kg) : '') },
            { key: 'yield', header: t('production.yield'), align: 'right', cell: (b) => (b.rice_yield_pct != null && num(b.rice_kg) ? `${qty(b.rice_yield_pct)}%` : '') },
            ...(showCost
              ? [
                  { key: 'cost', header: t('production.totalCost'), align: 'right' as const, cell: (b: Batch) => money(b.total_cost) },
                  { key: 'perkg', header: t('production.riceCostPerKg'), align: 'right' as const, cell: (b: Batch) => (b.rice_cost_per_kg ? money(b.rice_cost_per_kg) : '') },
                ]
              : []),
          ]}
        />
      </Card>
    </>
  )
}
