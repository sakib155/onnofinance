import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountSelect, isExpenseHead, isMoneyAccount, PartyPicker } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form'
import { ErrorBox } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { usePartyDues, type Due } from '@/features/parties/PartyLedgerPage'
import { rpc, useMethodFor, useSave } from '@/lib/data'
import { date, money, num, today } from '@/lib/format'
import type { MoneyTxnType } from '@/lib/types'

export const MONEY_TYPES: MoneyTxnType[] = [
  'RECEIPT',
  'PAYMENT',
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'CAPITAL_IN',
  'DRAWING',
  'LOAN_TAKEN',
  'LOAN_REPAY',
  'LOAN_GIVEN',
  'LOAN_RECOVER',
]

// Money coming in to the business for these types
export const isInflow = (t: MoneyTxnType) => ['RECEIPT', 'INCOME', 'CAPITAL_IN', 'LOAN_TAKEN', 'LOAN_RECOVER'].includes(t)
const needsParty = (t: MoneyTxnType) => ['RECEIPT', 'PAYMENT', 'LOAN_TAKEN', 'LOAN_REPAY', 'LOAN_GIVEN', 'LOAN_RECOVER'].includes(t)

export type MoneyTxn = {
  id: string
  txn_no: string
  txn_date: string
  txn_type: MoneyTxnType
  party_id: string | null
  money_account_id: string
  counter_account_id: string | null
  amount: number
  method: 'CASH' | 'BANK' | 'CHEQUE'
  cheque_no: string | null
  cheque_date: string | null
  cheque_status: 'PENDING' | 'CLEARED' | 'BOUNCED' | null
  reference: string | null
  notes: string | null
  interest_amount: number
  linked_sale_id: string | null
  linked_purchase_id: string | null
  linked_sale_no?: string | null
  linked_purchase_no?: string | null
  created_by?: string | null
  created_at?: string
  money_account_name?: string
  counter_account_name?: string | null
  party_name?: string | null
}

export function MoneyForm({ open, onClose, type: initialType, partyId, txn }: {
  open: boolean
  onClose: () => void
  type?: MoneyTxnType
  partyId?: string
  txn?: MoneyTxn | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [type, setType] = useState<MoneyTxnType>(txn?.txn_type ?? initialType ?? 'RECEIPT')
  const [v, setV] = useState({
    txn_date: txn?.txn_date ?? today(),
    party_id: txn?.party_id ?? partyId ?? '',
    money_account_id: txn?.money_account_id ?? '',
    counter_account_id: txn?.counter_account_id ?? '',
    amount: txn ? String(txn.amount) : '',
    interest_amount: txn && num(txn.interest_amount) ? String(txn.interest_amount) : '',
    method: txn?.method ?? 'CASH',
    cheque_no: txn?.cheque_no ?? '',
    cheque_date: txn?.cheque_date ?? '',
    reference: txn?.reference ?? '',
    notes: txn?.notes ?? '',
  })
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }))
  const methodFor = useMethodFor()
  const [auto, setAuto] = useState(true)
  const [alloc, setAlloc] = useState<Record<string, string>>({})

  const dues = usePartyDues(needsParty(type) ? v.party_id || undefined : undefined)
  const bills: Due[] = type === 'RECEIPT' ? dues.sales : type === 'PAYMENT' ? dues.purchases : []

  const save = useSave(() => {
    if (!v.money_account_id) throw new Error(t('errors.required', { field: t('errors.moneyAccount') }))
    if (num(v.amount) <= 0) throw new Error(t('errors.positiveAmount'))
    return rpc<string>('save_money_txn', {
      p: {
        id: txn?.id,
        txn_type: type,
        ...v,
        amount: num(v.amount),
        interest_amount: num(v.interest_amount),
        allocations:
          !auto && bills.length
            ? Object.entries(alloc)
                .filter(([, a]) => num(a) > 0)
                .map(([id, a]) => ({ [type === 'RECEIPT' ? 'sale_id' : 'purchase_id']: id, amount: num(a) }))
            : undefined,
      },
    })
  })

  const submit = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        toast(t('common.saved'))
        onClose()
      },
    })

  const inflow = isInflow(type)
  const allocated = Object.values(alloc).reduce((s, a) => s + num(a), 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={txn ? `${t('common.edit')} ${txn.txn_no}` : t(`money.type.${type}`)}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!initialType && !txn && (
          <Field label={t('money.kind')} className="sm:col-span-2">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as MoneyTxnType)
                setAlloc({})
              }}
            >
              {MONEY_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`money.type.${x}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('common.date')}>
          <Input type="date" value={v.txn_date} onChange={(e) => set('txn_date')(e.target.value)} />
        </Field>
        <Field label={t('common.amount')}>
          <Input type="number" step="0.01" min="0" value={v.amount} onChange={(e) => set('amount')(e.target.value)} autoFocus />
        </Field>
        {needsParty(type) && (
          <Field label={t('common.party')} className="sm:col-span-2">
            <PartyPicker
              value={v.party_id}
              onChange={(id) => {
                set('party_id')(id)
                setAlloc({})
              }}
            />
          </Field>
        )}
        <Field label={type === 'TRANSFER' ? t('money.fromAccount') : inflow ? t('money.receivedInto') : t('money.paidFrom')}>
          <AccountSelect
            value={v.money_account_id}
            onChange={(id) => setV((s) => ({ ...s, money_account_id: id, method: methodFor(id, s.method) as typeof s.method }))}
            filter={isMoneyAccount}
          />
        </Field>
        {type === 'TRANSFER' && (
          <Field label={t('money.toAccount')}>
            <AccountSelect value={v.counter_account_id} onChange={set('counter_account_id')} filter={(a) => isMoneyAccount(a) && a.id !== v.money_account_id} />
          </Field>
        )}
        {type === 'EXPENSE' && (
          <Field label={t('money.expenseHead')}>
            <AccountSelect value={v.counter_account_id} onChange={set('counter_account_id')} filter={isExpenseHead} />
          </Field>
        )}
        {type === 'INCOME' && (
          <Field label={t('money.incomeHead')}>
            <AccountSelect
              value={v.counter_account_id}
              onChange={set('counter_account_id')}
              filter={(a) => a.type === 'INCOME' && a.subtype === 'OTHER_INCOME'}
            />
          </Field>
        )}
        {(type === 'LOAN_REPAY' || type === 'LOAN_RECOVER') && (
          <Field label={t('money.ofWhichInterest')} hint={t('money.interestHint')}>
            <Input type="number" step="0.01" min="0" value={v.interest_amount} onChange={(e) => set('interest_amount')(e.target.value)} />
          </Field>
        )}
        <Field label={t('money.method')}>
          <Select value={v.method} onChange={(e) => set('method')(e.target.value)}>
            <option value="CASH">{t('money.methods.CASH')}</option>
            <option value="BANK">{t('money.methods.BANK')}</option>
            <option value="CHEQUE">{t('money.methods.CHEQUE')}</option>
          </Select>
        </Field>
        {v.method === 'CHEQUE' && (
          <>
            <Field label={t('money.chequeNo')}>
              <Input value={v.cheque_no} onChange={(e) => set('cheque_no')(e.target.value)} />
            </Field>
            <Field label={t('money.chequeDate')}>
              <Input type="date" value={v.cheque_date} onChange={(e) => set('cheque_date')(e.target.value)} />
            </Field>
          </>
        )}
        <Field label={t('common.reference')}>
          <Input value={v.reference} onChange={(e) => set('reference')(e.target.value)} />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>

        {bills.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{t('money.settleBills')}</div>
              <Checkbox label={t('money.autoSettle')} checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            </div>
            {!auto && (
              <div className="space-y-1.5">
                {bills.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      {b.no} · {date(b.date)}
                      <span className="ml-2 text-slate-500">
                        {t('common.due')}: {money(b.due_amount)}
                      </span>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-32"
                      value={alloc[b.id] ?? ''}
                      onChange={(e) => setAlloc((a) => ({ ...a, [b.id]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className={allocated > num(v.amount) + 0.005 ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>
                  {t('money.allocated', { amount: money(allocated), total: money(v.amount) })}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}
