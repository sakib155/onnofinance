import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { AccountSelect, DateRange, isMoneyAccount } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat, statGrid } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { date, money, monthStart, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { MoneyTxnType } from '@/lib/types'
import { isInflow, MONEY_TYPES, MoneyForm, type MoneyTxn } from './MoneyForm'

const QUICK: MoneyTxnType[] = ['RECEIPT', 'PAYMENT', 'EXPENSE', 'TRANSFER']

export function MoneyPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [type, setType] = useState('')
  const [account, setAccount] = useState('')
  const [creating, setCreating] = useState<MoneyTxnType | 'ANY' | null>(null)

  const { data, isLoading } = useData<MoneyTxn[]>(['money', from, to, type, account], () => {
    let q = supabase.from('v_money_txns').select('*').gte('txn_date', from).lte('txn_date', to).order('txn_date', { ascending: false }).order('created_at', { ascending: false })
    if (type) q = q.eq('txn_type', type)
    if (account) q = q.or(`money_account_id.eq.${account},counter_account_id.eq.${account}`)
    return q
  })
  const rows = data ?? []
  // A transfer moves money between our own accounts: with one account selected it is in or out
  // of that account; across all accounts it is both, and cancels out.
  const side = (r: MoneyTxn) =>
    r.txn_type === 'TRANSFER' ? (!account ? 'both' : r.counter_account_id === account ? 'in' : 'out') : isInflow(r.txn_type) ? 'in' : 'out'
  const live = rows.filter((r) => r.cheque_status !== 'BOUNCED')
  const totalIn = live.filter((r) => side(r) !== 'out').reduce((s, r) => s + num(r.amount), 0)
  const totalOut = live.filter((r) => side(r) !== 'in').reduce((s, r) => s + num(r.amount), 0)

  return (
    <>
      <PageHeader
        title={t('nav.transactions')}
        subtitle={t('money.subtitle')}
        actions={
          can('money') && (
            <>
              {QUICK.map((q) => (
                <Button key={q} variant={q === 'RECEIPT' ? 'primary' : 'secondary'} onClick={() => setCreating(q)}>
                  {q === 'RECEIPT' && <Plus className="size-4" />}
                  {t(`money.type.${q}`)}
                </Button>
              ))}
              <Button variant="secondary" onClick={() => setCreating('ANY')}>
                {t('money.other')}
              </Button>
            </>
          )
        }
      />
      <div className={clsx(statGrid, 'mb-4 sm:grid-cols-3')}>
        <Stat label={t('money.totalIn')} value={money(totalIn)} />
        <Stat label={t('money.totalOut')} value={money(totalOut)} />
        <Stat label={t('money.net')} value={money(totalIn - totalOut)} tone={totalIn - totalOut < 0 ? 'down' : undefined} />
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <DateRange
            from={from}
            to={to}
            onChange={(f, tt) => {
              setFrom(f)
              setTo(tt)
            }}
          />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-48">
            <option value="">{t('money.allTypes')}</option>
            {MONEY_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`money.type.${x}`)}
              </option>
            ))}
          </Select>
          <div className="w-48">
            <AccountSelect value={account} onChange={setAccount} filter={isMoneyAccount} placeholder={t('money.allAccounts')} />
          </div>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/money/${r.id}`)}
          rowClassName={(r) => (r.cheque_status === 'BOUNCED' ? 'opacity-50 line-through' : undefined)}
          columns={[
            { key: 'date', phone: 'sub', header: t('common.date'), cell: (r) => date(r.txn_date), className: 'whitespace-nowrap' },
            { key: 'no', phone: 'sub', header: t('common.voucherNo'), cell: (r) => <span className="text-xs text-slate-500">{r.txn_no}</span> },
            {
              key: 'type',
              phone: 'sub',
              header: t('money.kind'),
              cell: (r) => <Badge tone={isInflow(r.txn_type) ? 'green' : r.txn_type === 'TRANSFER' ? 'blue' : 'amber'}>{t(`money.type.${r.txn_type}`)}</Badge>,
            },
            {
              key: 'who',
              phone: 'title',
              header: t('money.details'),
              cell: (r) => (
                <div>
                  <div>
                    {r.party_name ?? r.counter_account_name ?? ''}
                    {(r.linked_sale_no || r.linked_purchase_no) && <span className="ml-1 text-xs text-slate-500">({r.linked_sale_no ?? r.linked_purchase_no})</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {[r.money_account_name, r.method === 'CHEQUE' ? `${t('money.methods.CHEQUE')} ${r.cheque_no ?? ''} · ${t(`money.chequeStatus.${r.cheque_status}`)}` : null, r.notes]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              ),
            },
            {
              key: 'in',
              phone: 'value',
              header: t('money.in'),
              align: 'right',
              cell: (r) => (side(r) === 'in' ? money(r.amount) : side(r) === 'both' ? <span className="text-slate-400">{money(r.amount)}</span> : ''),
              // one amount on the phone: green coming in, red going out
              phoneCell: (r) => (
                <span className={side(r) === 'in' ? 'text-brand-700' : side(r) === 'out' ? 'text-red-600' : 'text-slate-500'}>
                  {side(r) === 'in' ? '+' : side(r) === 'out' ? '−' : ''}
                  {money(r.amount)}
                </span>
              ),
              footer: money(totalIn),
            },
            {
              key: 'out',
              phone: 'hide',
              header: t('money.out'),
              align: 'right',
              cell: (r) => (side(r) === 'out' ? money(r.amount) : side(r) === 'both' ? <span className="text-slate-400">{money(r.amount)}</span> : ''),
              footer: money(totalOut),
            },
          ]}
        />
      </Card>
      {creating && <MoneyForm open type={creating === 'ANY' ? undefined : creating} onClose={() => setCreating(null)} />}
    </>
  )
}
