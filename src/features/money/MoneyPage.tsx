import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { AccountSelect, DateRange, isMoneyAccount } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/layout'
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
  const live = rows.filter((r) => r.cheque_status !== 'BOUNCED')
  const totalIn = live.filter((r) => isInflow(r.txn_type)).reduce((s, r) => s + num(r.amount), 0)
  const totalOut = live.filter((r) => !isInflow(r.txn_type) && r.txn_type !== 'TRANSFER').reduce((s, r) => s + num(r.amount), 0)

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
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
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
            { key: 'date', header: t('common.date'), cell: (r) => date(r.txn_date), className: 'whitespace-nowrap' },
            { key: 'no', header: t('common.voucherNo'), cell: (r) => <span className="text-xs text-slate-500">{r.txn_no}</span> },
            {
              key: 'type',
              header: t('money.kind'),
              cell: (r) => <Badge tone={isInflow(r.txn_type) ? 'green' : r.txn_type === 'TRANSFER' ? 'blue' : 'amber'}>{t(`money.type.${r.txn_type}`)}</Badge>,
            },
            {
              key: 'who',
              header: t('money.details'),
              cell: (r) => (
                <div>
                  <div>{r.party_name ?? r.counter_account_name ?? ''}</div>
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
              header: t('money.in'),
              align: 'right',
              cell: (r) => (isInflow(r.txn_type) ? money(r.amount) : ''),
              footer: money(totalIn),
            },
            {
              key: 'out',
              header: t('money.out'),
              align: 'right',
              cell: (r) => (!isInflow(r.txn_type) ? money(r.amount) : ''),
              footer: money(totalOut),
            },
          ]}
        />
      </Card>
      {creating && <MoneyForm open type={creating === 'ANY' ? undefined : creating} onClose={() => setCreating(null)} />}
    </>
  )
}
