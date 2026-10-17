import clsx from 'clsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Card, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { money, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type AgeRow = {
  party_id: string
  name: string
  name_bn: string | null
  phone: string | null
  credit_limit: number | null
  balance: number
  b0: number
  b30: number
  b60: number
  b90: number
}

const BUCKETS = ['b0', 'b30', 'b60', 'b90'] as const

// Receivables / payables per party. The amount still owed is made up of the party's most recent
// bills and charges, so it is aged by those dates (opening balances and commissions included).
export function DuesPage() {
  const { t } = useTranslation()
  const [side, setSide] = useState<'receivable' | 'payable'>('receivable')
  const { data, isLoading } = useData<AgeRow[]>(['ageing', today()], () => supabase.rpc('report_ageing', { p_as_of: today() }))

  const rows = (data ?? []).filter((r) => (side === 'receivable' ? num(r.balance) > 0 : num(r.balance) < 0))
  const total = rows.reduce((s, r) => s + Math.abs(num(r.balance)), 0)
  const bucketTotal = (k: (typeof BUCKETS)[number]) => rows.reduce((s, r) => s + num(r[k]), 0)

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
          <Stat key={b} label={t(`dues.${b}`)} value={money(bucketTotal(b))} tone={b === 'b90' && bucketTotal(b) > 0 ? 'down' : undefined} />
        ))}
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.party_id}
          columns={[
            {
              key: 'name',
              header: t('common.party'),
              cell: (r) => (
                <Link to={`/parties/${r.party_id}`} className="font-medium text-brand-800 hover:underline">
                  {nameOf(r)}
                </Link>
              ),
            },
            { key: 'phone', header: t('common.phone'), cell: (r) => <span className="text-slate-500">{r.phone}</span> },
            ...BUCKETS.map((b) => ({
              key: b,
              header: t(`dues.${b}`),
              align: 'right' as const,
              cell: (r: AgeRow) => (num(r[b]) ? money(r[b]) : ''),
              footer: money(bucketTotal(b)),
            })),
            {
              key: 'total',
              header: t('dues.balance'),
              align: 'right',
              cell: (r) => {
                const amount = Math.abs(num(r.balance))
                const over = side === 'receivable' && r.credit_limit != null && amount > num(r.credit_limit)
                return (
                  <span className={clsx('font-semibold', over && 'text-red-600')} title={over ? `${t('parties.creditLimit')}: ${money(r.credit_limit)}` : undefined}>
                    {money(amount)}
                  </span>
                )
              },
              footer: money(total),
            },
          ]}
        />
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('dues.note')}</p>
      </Card>
    </>
  )
}
