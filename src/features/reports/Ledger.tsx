import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DateRange, Money } from '@/components/common'
import { Card } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { date, money, monthStart, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export type LedgerRow = {
  row_no: number
  entry_date: string
  entry_id: string | null
  source_type: string
  source_id: string | null
  narration: string | null
  memo: string | null
  account_name: string | null
  party_name: string | null
  debit: number | null
  credit: number | null
  balance: number
}

// Where a journal entry came from, for linking back to the document
export function sourceLink(type: string, id: string | null) {
  if (!id) return null
  switch (type) {
    case 'PURCHASE':
      return `/purchases/${id}`
    case 'SALE':
      return `/sales/${id}`
    case 'MONEY':
      return `/money/${id}`
    case 'PRODUCTION':
    case 'PRODUCTION_INPUT':
      return `/production/${id}`
    case 'SALE_RETURN':
    case 'PURCHASE_RETURN':
      return '/returns'
    case 'ADJUSTMENT':
      return '/stock/moves'
    case 'OPENING_PARTY':
      return `/parties/${id}`
    default:
      return null
  }
}

export function useLedger(account: string | null, party: string | null, from: string, to: string) {
  return useData<LedgerRow[]>(['ledger', account, party, from, to], () =>
    supabase.rpc('report_ledger', { p_account: account, p_party: party, p_from: from, p_to: to }),
  )
}

// Debit/credit headings depend on whose book it is: for a party, debit = they owe more
export function LedgerView({ account, party, debitLabel, creditLabel, title }: {
  account?: string
  party?: string
  debitLabel: string
  creditLabel: string
  title?: string
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const { data, isLoading } = useLedger(account ?? null, party ?? null, from, to)
  const rows = data ?? []
  const totalDr = rows.reduce((s, r) => s + num(r.debit), 0)
  const totalCr = rows.reduce((s, r) => s + num(r.credit), 0)
  const closing = rows.length ? rows[rows.length - 1].balance : 0

  return (
    <Card
      title={title ?? t('ledger.title')}
      padded={false}
      actions={
        <DateRange
          from={from}
          to={to}
          onChange={(f, tt) => {
            setFrom(f)
            setTo(tt)
          }}
        />
      }
    >
      <div className="hidden px-4 pt-3 text-sm text-slate-600 print:block">
        {date(from)} – {date(to)}
      </div>
      <Table
        loading={isLoading}
        rows={rows}
        rowKey={(r) => `${r.row_no}-${r.entry_id}`}
        columns={[
          { key: 'date', header: t('common.date'), cell: (r) => (r.row_no === 0 ? '' : date(r.entry_date)), className: 'whitespace-nowrap' },
          {
            key: 'detail',
            header: t('ledger.details'),
            cell: (r) => {
              if (r.row_no === 0) return <span className="font-medium">{t('ledger.opening')}</span>
              const link = sourceLink(r.source_type, r.source_id)
              const text = r.narration ?? ''
              return (
                <div>
                  {link ? (
                    <Link to={link} className="text-brand-800 hover:underline">
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                  {(r.memo || (party ? null : r.party_name)) && (
                    <div className="text-xs text-slate-500">{[r.memo, party ? null : r.party_name].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'dr',
            header: debitLabel,
            align: 'right',
            cell: (r) => (r.debit ? money(r.debit) : ''),
            footer: money(totalDr),
          },
          {
            key: 'cr',
            header: creditLabel,
            align: 'right',
            cell: (r) => (r.credit ? money(r.credit) : ''),
            footer: money(totalCr),
          },
          {
            key: 'bal',
            header: t('common.balance'),
            align: 'right',
            cell: (r) => <Money value={r.balance} colored />,
            footer: <Money value={closing} colored />,
          },
        ]}
      />
    </Card>
  )
}
