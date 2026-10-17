import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DateRange, Money, nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Input } from '@/components/ui/form'
import { Card, Loading, PageHeader } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useAccounts, useData } from '@/lib/data'
import { date, money, monthStart, num, today, yearStart } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { AccountType } from '@/lib/types'

// Report functions return the English account name; show the Bangla one when the app is in Bangla
function useAccountName() {
  const { data } = useAccounts()
  return (id: string | null, fallback: string) => {
    const a = id ? data?.find((x) => x.id === id) : undefined
    return a ? nameOf(a) : fallback
  }
}

type PLRow = { account_id: string; code: string; name: string; type: AccountType; subtype: string; amount: number }

export function ProfitLossPage() {
  const accountName = useAccountName()
  const { t } = useTranslation()
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const { data, isLoading } = useData<PLRow[]>(['pl', from, to], () => supabase.rpc('report_profit_loss', { p_from: from, p_to: to }))
  const rows = data ?? []
  const income = rows.filter((r) => r.type === 'INCOME')
  const cogs = rows.filter((r) => ['COGS', 'STOCK_ADJUSTMENT'].includes(r.subtype))
  const expenses = rows.filter((r) => r.type === 'EXPENSE' && !['COGS', 'STOCK_ADJUSTMENT'].includes(r.subtype))
  const sum = (rs: PLRow[]) => rs.reduce((s, r) => s + num(r.amount), 0)
  const gross = sum(income) - sum(cogs)
  const net = gross - sum(expenses)

  const section = (title: string, rs: PLRow[], total: number) => (
    <div className="mb-4">
      <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</div>
      {rs.map((r) => (
        <div key={r.account_id} className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
          <Link to={`/accounts/${r.account_id}`} className="hover:text-brand-800 hover:underline">
            {accountName(r.account_id, r.name)}
          </Link>
          <Money value={r.amount} colored />
        </div>
      ))}
      <div className="flex justify-between py-1.5 text-sm font-semibold">
        <span>{t('common.total')}</span>
        <Money value={total} />
      </div>
    </div>
  )

  return (
    <>
      <PrintHeader title={`${t('reports.profitLoss')} · ${date(from)} – ${date(to)}`} />
      <PageHeader
        title={t('reports.profitLoss')}
        subtitle={t('reports.profitLossHelp')}
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
            <PrintButton />
          </>
        }
      />
      {isLoading ? (
        <Loading />
      ) : (
        <Card className="print-area max-w-2xl">
          {section(t('reports.income'), income, sum(income))}
          {section(t('reports.costOfSales'), cogs, sum(cogs))}
          <div className="mb-4 flex justify-between rounded-lg bg-slate-50 px-3 py-2 font-semibold">
            <span>{t('reports.grossProfit')}</span>
            <Money value={gross} colored />
          </div>
          {section(t('reports.expenses'), expenses, sum(expenses))}
          <div className={`flex justify-between rounded-lg px-3 py-3 text-lg font-bold ${net >= 0 ? 'bg-brand-50 text-brand-900' : 'bg-red-50 text-red-700'}`}>
            <span>{net >= 0 ? t('reports.netProfit') : t('reports.netLoss')}</span>
            <span className="tabular-nums">{money(Math.abs(net))}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('reports.plNote')}</p>
        </Card>
      )}
    </>
  )
}

type BSRow = { section: 'ASSET' | 'LIABILITY' | 'EQUITY'; account_id: string | null; code: string; name: string; subtype: string; amount: number }

export function BalanceSheetPage() {
  const accountName = useAccountName()
  const { t } = useTranslation()
  const [asOf, setAsOf] = useState(today())
  const { data, isLoading } = useData<BSRow[]>(['bs', asOf], () => supabase.rpc('report_balance_sheet', { p_to: asOf }))
  const rows = data ?? []
  const part = (s: BSRow['section']) => rows.filter((r) => r.section === s)
  const sum = (rs: BSRow[]) => rs.reduce((a, r) => a + num(r.amount), 0)
  const assets = sum(part('ASSET'))
  const liabEq = sum(part('LIABILITY')) + sum(part('EQUITY'))

  const block = (title: string, rs: BSRow[]) => (
    <div className="mb-4">
      <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</div>
      {rs.map((r) => (
        <div key={r.code} className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
          {r.account_id ? (
            <Link to={`/accounts/${r.account_id}`} className="hover:text-brand-800 hover:underline">
              {accountName(r.account_id, r.name)}
            </Link>
          ) : (
            <span>{t('reports.profitToDate')}</span>
          )}
          <Money value={r.amount} colored />
        </div>
      ))}
      <div className="flex justify-between py-1.5 text-sm font-semibold">
        <span>{t('common.total')}</span>
        <Money value={sum(rs)} />
      </div>
    </div>
  )

  return (
    <>
      <PrintHeader title={`${t('reports.balanceSheet')} · ${date(asOf)}`} />
      <PageHeader
        title={t('reports.balanceSheet')}
        subtitle={t('reports.balanceSheetHelp')}
        actions={
          <>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            <PrintButton />
          </>
        }
      />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('reports.whatWeOwn')}>
            {block(t('accounts.types.ASSET'), part('ASSET'))}
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 font-bold">
              <span>{t('reports.totalAssets')}</span>
              <Money value={assets} />
            </div>
          </Card>
          <Card title={t('reports.whatWeOweAndCapital')}>
            {block(t('accounts.types.LIABILITY'), part('LIABILITY'))}
            {block(t('accounts.types.EQUITY'), part('EQUITY'))}
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 font-bold">
              <span>{t('reports.totalLiabEquity')}</span>
              <Money value={liabEq} />
            </div>
          </Card>
          {Math.abs(assets - liabEq) > 0.01 && <p className="text-sm text-red-600 lg:col-span-2">{t('reports.notBalanced')}</p>}
        </div>
      )}
    </>
  )
}

type TBRow = { account_id: string; code: string; name: string; type: AccountType; debit: number; credit: number }

export function TrialBalancePage() {
  const accountName = useAccountName()
  const { t } = useTranslation()
  const [asOf, setAsOf] = useState(today())
  const { data, isLoading } = useData<TBRow[]>(['tb', asOf], () => supabase.rpc('report_trial_balance', { p_to: asOf }))
  const rows = data ?? []
  return (
    <>
      <PrintHeader title={`${t('reports.trialBalance')} · ${date(asOf)}`} />
      <PageHeader
        title={t('reports.trialBalance')}
        subtitle={t('reports.trialBalanceHelp')}
        actions={
          <>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            <PrintButton />
          </>
        }
      />
      <Card padded={false} className="max-w-3xl">
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.account_id}
          columns={[
            { key: 'code', header: t('common.code'), cell: (r) => <span className="text-slate-500">{r.code}</span> },
            {
              key: 'name',
              header: t('common.account'),
              cell: (r) => (
                <Link to={`/accounts/${r.account_id}`} className="hover:text-brand-800 hover:underline">
                  {accountName(r.account_id, r.name)}
                </Link>
              ),
            },
            { key: 'dr', header: t('ledger.debit'), align: 'right', cell: (r) => (num(r.debit) ? money(r.debit) : ''), footer: money(rows.reduce((s, r) => s + num(r.debit), 0)) },
            { key: 'cr', header: t('ledger.credit'), align: 'right', cell: (r) => (num(r.credit) ? money(r.credit) : ''), footer: money(rows.reduce((s, r) => s + num(r.credit), 0)) },
          ]}
        />
      </Card>
    </>
  )
}

type CashRow = { account_id: string; name: string; subtype: string; opening: number; money_in: number; money_out: number; closing: number }

export function CashSummaryPage() {
  const accountName = useAccountName()
  const { t } = useTranslation()
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const { data, isLoading } = useData<CashRow[]>(['cash-summary', from, to], () => supabase.rpc('report_cash_summary', { p_from: from, p_to: to }))
  const rows = data ?? []
  const total = (k: keyof CashRow) => money(rows.reduce((s, r) => s + num(r[k]), 0))
  return (
    <>
      <PrintHeader title={`${t('reports.cashSummary')} · ${date(from)} – ${date(to)}`} />
      <PageHeader
        title={t('reports.cashSummary')}
        subtitle={t('reports.cashSummaryHelp')}
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
            <button className="text-sm text-brand-700 hover:underline" onClick={() => (setFrom(monthStart()), setTo(today()))}>
              {t('reports.thisMonth')}
            </button>
            <PrintButton />
          </>
        }
      />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.account_id}
          columns={[
            {
              key: 'name',
              header: t('common.account'),
              cell: (r) => (
                <Link to={`/accounts/${r.account_id}`} className="font-medium text-brand-800 hover:underline">
                  {accountName(r.account_id, r.name)}
                </Link>
              ),
            },
            { key: 'open', header: t('reports.opening'), align: 'right', cell: (r) => money(r.opening), footer: total('opening') },
            { key: 'in', header: t('money.in'), align: 'right', cell: (r) => money(r.money_in), footer: total('money_in') },
            { key: 'out', header: t('money.out'), align: 'right', cell: (r) => money(r.money_out), footer: total('money_out') },
            { key: 'close', header: t('reports.closing'), align: 'right', cell: (r) => <span className="font-semibold">{money(r.closing)}</span>, footer: total('closing') },
          ]}
        />
      </Card>
    </>
  )
}
