import clsx from 'clsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData, useParties } from '@/lib/data'
import { money, num } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Bill = { id: string; party_id: string; due_amount: number; age_days: number }

const BUCKETS = [
  { key: 'b0', max: 30 },
  { key: 'b30', max: 60 },
  { key: 'b60', max: 90 },
  { key: 'b90', max: Infinity },
] as const

// Receivables / payables per party, with unpaid bills split by age
export function DuesPage() {
  const { t } = useTranslation()
  const [side, setSide] = useState<'receivable' | 'payable'>('receivable')
  const { data: parties, isLoading } = useParties()
  const { data: bills } = useData<Bill[]>(['dues-bills', side], () =>
    (side === 'receivable'
      ? supabase.from('v_sale_dues').select('id, party_id:customer_id, due_amount, age_days').gt('due_amount', 0.005)
      : supabase.from('v_purchase_dues').select('id, party_id:supplier_id, due_amount, age_days').gt('due_amount', 0.005)) as never,
  )

  const rows = (parties ?? [])
    .filter((p) => (side === 'receivable' ? num(p.balance) > 0.005 : num(p.balance) < -0.005))
    .map((p) => {
      const own = (bills ?? []).filter((b) => b.party_id === p.id)
      const ageing = Object.fromEntries(
        BUCKETS.map((b, i) => [b.key, own.filter((x) => x.age_days >= (i ? BUCKETS[i - 1].max : 0) && x.age_days < b.max).reduce((s, x) => s + num(x.due_amount), 0)]),
      ) as Record<(typeof BUCKETS)[number]['key'], number>
      return { ...p, amount: Math.abs(num(p.balance)), ageing, oldest: own.reduce((m, b) => Math.max(m, b.age_days), 0) }
    })
    .sort((a, b) => b.amount - a.amount)

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const bucketTotal = (k: (typeof BUCKETS)[number]['key']) => rows.reduce((s, r) => s + r.ageing[k], 0)

  return (
    <>
      <PrintHeader title={side === 'receivable' ? t('dues.receivableTitle') : t('dues.payableTitle')} />
      <PageHeader title={t('nav.dues')} subtitle={t('dues.subtitle')} actions={<PrintButton />} />
      <div className="no-print mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(['receivable', 'payable'] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className={clsx('flex-1 rounded-md px-4 py-1.5', side === s ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}>
            {s === 'receivable' ? t('parties.theyOwe') : t('parties.weOwe')}
          </button>
        ))}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t('common.total')} value={money(total)} hint={t('dues.parties', { count: rows.length })} />
        {BUCKETS.map((b) => (
          <Stat key={b.key} label={t(`dues.${b.key}`)} value={money(bucketTotal(b.key))} />
        ))}
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'name',
              header: t('common.party'),
              cell: (r) => (
                <Link to={`/parties/${r.id}`} className="font-medium text-brand-800 hover:underline">
                  {nameOf(r)}
                </Link>
              ),
            },
            { key: 'phone', header: t('common.phone'), cell: (r) => <span className="text-slate-500">{r.phone}</span> },
            ...BUCKETS.map((b) => ({
              key: b.key,
              header: t(`dues.${b.key}`),
              align: 'right' as const,
              cell: (r: (typeof rows)[number]) => (r.ageing[b.key] ? money(r.ageing[b.key]) : ''),
              footer: money(bucketTotal(b.key)),
            })),
            {
              key: 'total',
              header: t('dues.balance'),
              align: 'right',
              cell: (r) => (
                <span className={clsx('font-semibold', r.credit_limit && r.amount > num(r.credit_limit) && 'text-red-600')} title={r.credit_limit ? `${t('parties.creditLimit')}: ${money(r.credit_limit)}` : undefined}>
                  {money(r.amount)}
                </span>
              ),
              footer: money(total),
            },
          ]}
        />
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('dues.note')}</p>
      </Card>
    </>
  )
}
