import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { isInflow, type MoneyTxn } from './MoneyForm'

export function ChequesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const [status, setStatus] = useState('PENDING')
  const { data, isLoading } = useData<MoneyTxn[]>(['cheques', status], () => {
    let q = supabase.from('v_money_txns').select('*').eq('method', 'CHEQUE').order('cheque_date', { ascending: true })
    if (status) q = q.eq('cheque_status', status)
    return q
  })
  const update = useSave(({ id, s }: { id: string; s: string }) => rpc('set_cheque_status', { p_id: id, p_status: s }))
  const act = (id: string, s: string) => update.mutate({ id, s }, { onSuccess: () => toast(t('common.saved')), onError: (e) => toast(errorMessage(e), 'error') })
  const rows = data ?? []

  return (
    <>
      <PageHeader title={t('nav.cheques')} subtitle={t('money.chequesSubtitle')} />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="">{t('common.all')}</option>
            {['PENDING', 'CLEARED', 'BOUNCED'].map((s) => (
              <option key={s} value={s}>
                {t(`money.chequeStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'cdate',
              phone: 'sub',
              header: t('money.chequeDate'),
              cell: (r) => (
                <span className={r.cheque_status === 'PENDING' && r.cheque_date && r.cheque_date <= today() ? 'font-medium text-amber-700' : ''}>
                  {date(r.cheque_date)}
                </span>
              ),
            },
            { key: 'no', phone: 'sub', header: t('money.chequeNo'), cell: (r) => r.cheque_no },
            {
              key: 'dir',
              header: t('money.kind'),
              cell: (r) => <Badge tone={isInflow(r.txn_type) ? 'green' : 'amber'}>{isInflow(r.txn_type) ? t('money.chequeIn') : t('money.chequeOut')}</Badge>,
            },
            {
              key: 'party',
              phone: 'title',
              header: t('common.party'),
              cell: (r) => (
                <Link to={`/money/${r.id}`} className="text-brand-800 hover:underline">
                  {r.party_name ?? r.counter_account_name}
                </Link>
              ),
            },
            { key: 'acct', header: t('common.account'), cell: (r) => r.money_account_name },
            {
              key: 'amt',
              phone: 'value',
              header: t('common.amount'),
              align: 'right',
              cell: (r) => money(r.amount),
              footer: money(rows.reduce((s, r) => s + num(r.amount), 0)),
            },
            {
              key: 'status',
              header: t('common.status'),
              cell: (r) => (
                <Badge tone={r.cheque_status === 'CLEARED' ? 'green' : r.cheque_status === 'BOUNCED' ? 'red' : 'amber'}>
                  {t(`money.chequeStatus.${r.cheque_status}`)}
                </Badge>
              ),
            },
            {
              key: 'act',
              header: '',
              align: 'right',
              cell: (r) =>
                can('money') &&
                r.cheque_status === 'PENDING' && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="secondary" onClick={() => act(r.id, 'CLEARED')}>
                      {t('money.markCleared')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, 'BOUNCED')}>
                      {t('money.markBounced')}
                    </Button>
                  </div>
                ),
            },
          ]}
        />
      </Card>
    </>
  )
}
