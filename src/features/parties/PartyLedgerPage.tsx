import { ArrowLeft, Banknote } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { Balance, nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Card, Loading, PageHeader, Stat } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { MoneyForm } from '@/features/money/MoneyForm'
import { LedgerView } from '@/features/reports/Ledger'
import { useData } from '@/lib/data'
import { ageDays, date, money, num } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { MoneyTxnType, Party } from '@/lib/types'
import { PartyForm } from './PartyForm'

export type Due = { id: string; no: string; date: string; total_amount: number; paid_amount: number; due_amount: number; age_days: number }

export function usePartyDues(partyId?: string) {
  const sales = useData<Due[]>(
    ['dues', 'sales', partyId],
    () =>
      supabase
        .from('v_sale_dues')
        .select('id, no:sale_no, date:sale_date, total_amount, paid_amount:total_paid, due_amount, age_days')
        .eq('customer_id', partyId!)
        .gt('due_amount', 0.005)
        .order('sale_date') as never,
    { enabled: Boolean(partyId) },
  )
  const purchases = useData<Due[]>(
    ['dues', 'purchases', partyId],
    () =>
      supabase
        .from('v_purchase_dues')
        .select('id, no:purchase_no, date:purchase_date, total_amount, paid_amount:total_paid, due_amount, age_days')
        .eq('supplier_id', partyId!)
        .gt('due_amount', 0.005)
        .order('purchase_date') as never,
    { enabled: Boolean(partyId) },
  )
  return { sales: sales.data ?? [], purchases: purchases.data ?? [] }
}

export function PartyLedgerPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const [editing, setEditing] = useState(false)
  const [money_, setMoney] = useState<MoneyTxnType | null>(null)
  const { data: party, isLoading } = useData<Party>(['party', id], () => supabase.from('v_party_balances').select('*').eq('id', id!).single())
  const dues = usePartyDues(id)

  if (isLoading || !party) return <Loading />
  const bal = num(party.balance)

  const billColumns = (kind: 'sales' | 'purchases') => [
    {
      key: 'no',
      header: t('common.billNo'),
      cell: (d: Due) => (
        <Link to={`/${kind}/${d.id}`} className="text-brand-800 hover:underline">
          {d.no}
        </Link>
      ),
    },
    { key: 'date', header: t('common.date'), cell: (d: Due) => date(d.date) },
    { key: 'total', header: t('common.total'), align: 'right' as const, cell: (d: Due) => money(d.total_amount) },
    { key: 'paid', header: t('common.paid'), align: 'right' as const, cell: (d: Due) => money(d.paid_amount) },
    { key: 'due', header: t('common.due'), align: 'right' as const, cell: (d: Due) => <span className="font-medium">{money(d.due_amount)}</span> },
    { key: 'age', header: t('dues.age'), align: 'right' as const, cell: (d: Due) => t('dues.days', { count: ageDays(d.date) }) },
  ]

  return (
    <>
      <PrintHeader title={`${t('parties.statement')}: ${nameOf(party)}`}>
        <div className="text-xs">{[party.phone, party.address].filter(Boolean).join(' · ')}</div>
      </PrintHeader>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/parties" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {nameOf(party)}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-1">
            {party.types.map((x) => (
              <Badge key={x}>{t(`partyType.${x}`)}</Badge>
            ))}
            <span className="ml-1">{[party.phone, party.address].filter(Boolean).join(' · ')}</span>
          </span>
        }
        actions={
          <>
            {can('money') && (
              <>
                <Button variant="secondary" onClick={() => setMoney('RECEIPT')}>
                  <Banknote className="size-4" />
                  {t('money.type.RECEIPT')}
                </Button>
                <Button variant="secondary" onClick={() => setMoney('PAYMENT')}>
                  <Banknote className="size-4" />
                  {t('money.type.PAYMENT')}
                </Button>
              </>
            )}
            {can('editParties') && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('common.edit')}
              </Button>
            )}
            <PrintButton />
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('common.balance')}
          value={<Balance value={bal} />}
          hint={bal > 0.005 ? t('parties.theyOweUs') : bal < -0.005 ? t('parties.weOweThem') : t('balance.settled')}
        />
        <Stat label={t('parties.openSales')} value={money(dues.sales.reduce((s, d) => s + num(d.due_amount), 0))} hint={t('dues.bills', { count: dues.sales.length })} />
        <Stat
          label={t('parties.openPurchases')}
          value={money(dues.purchases.reduce((s, d) => s + num(d.due_amount), 0))}
          hint={t('dues.bills', { count: dues.purchases.length })}
        />
      </div>
      {dues.sales.length > 0 && (
        <Card title={t('parties.unpaidSales')} padded={false} className="mb-4">
          <Table rows={dues.sales} rowKey={(d) => d.id} columns={billColumns('sales')} />
        </Card>
      )}
      {dues.purchases.length > 0 && (
        <Card title={t('parties.unpaidPurchases')} padded={false} className="mb-4">
          <Table rows={dues.purchases} rowKey={(d) => d.id} columns={billColumns('purchases')} />
        </Card>
      )}
      {can('books') ? (
        <LedgerView party={party.id} debitLabel={t('ledger.partyDebit')} creditLabel={t('ledger.partyCredit')} />
      ) : null}
      {editing && <PartyForm open party={party} onClose={() => setEditing(false)} />}
      {money_ && <MoneyForm open type={money_} partyId={party.id} onClose={() => setMoney(null)} />}
    </>
  )
}
