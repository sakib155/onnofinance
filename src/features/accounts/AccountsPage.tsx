import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { Money, nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Button, ButtonLink } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/form'
import { Badge, Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { LedgerView } from '@/features/reports/Ledger'
import { StatementPdfButton } from '@/features/reports/StatementPdf'
import { unwrap, useAccounts, useSave } from '@/lib/data'
import { num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Account, AccountType } from '@/lib/types'

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']

// Kinds of account a user can add; system accounts (receivable, stock...) are fixed
const NEW_KINDS: { subtype: string; type: AccountType; prefix: string }[] = [
  { subtype: 'BANK', type: 'ASSET', prefix: '101' },
  { subtype: 'CASH', type: 'ASSET', prefix: '100' },
  { subtype: 'EXPENSE', type: 'EXPENSE', prefix: '6' },
  { subtype: 'OTHER_INCOME', type: 'INCOME', prefix: '41' },
]

// Show balances with their natural sign: liabilities, equity and income are credit balances
export const naturalBalance = (a: Pick<Account, 'type' | 'balance'>) => (['ASSET', 'EXPENSE'].includes(a.type) ? num(a.balance) : -num(a.balance))

function AccountForm({ account, open, onClose }: { account: Account | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: all } = useAccounts()
  const [v, setV] = useState(() => ({
    subtype: account?.subtype ?? 'BANK',
    code: account?.code ?? '',
    name: account?.name ?? '',
    name_bn: account?.name_bn ?? '',
    bank_name: account?.bank_name ?? '',
    branch: account?.branch ?? '',
    account_no: account?.account_no ?? '',
    opening_balance: account ? String(account.opening_balance) : '0',
    opening_date: account?.opening_date ?? today(),
    is_active: account?.is_active ?? true,
  }))
  const set = (k: keyof typeof v) => (val: string | boolean) => setV((s) => ({ ...s, [k]: val }))
  const kind = NEW_KINDS.find((k) => k.subtype === v.subtype)
  const isSystem = account?.is_system

  // next free code for the chosen kind
  const suggestCode = (subtype: string) => {
    const k = NEW_KINDS.find((x) => x.subtype === subtype)!
    const used = new Set((all ?? []).map((a) => a.code))
    for (let i = 1; i < 999; i++) {
      const code = k.prefix.length === 1 ? `${k.prefix}${String(100 + i).padStart(3, '0')}` : `${k.prefix}${i}`
      if (!used.has(code)) return code
    }
    return ''
  }

  const save = useSave(async () => {
    const row = {
      code: v.code || suggestCode(v.subtype),
      name: v.name,
      name_bn: v.name_bn || null,
      bank_name: v.bank_name || null,
      branch: v.branch || null,
      account_no: v.account_no || null,
      opening_balance: num(v.opening_balance),
      opening_date: v.opening_date,
      is_active: v.is_active,
    }
    return account
      ? unwrap(supabase.from('accounts').update(row).eq('id', account.id))
      : unwrap(supabase.from('accounts').insert({ ...row, type: kind!.type, subtype: v.subtype }))
  })

  const showOpening = ['ASSET', 'LIABILITY', 'EQUITY'].includes(account?.type ?? kind?.type ?? '') && account?.subtype !== 'OPENING_EQUITY'
  const sys = ['RECEIVABLE', 'PAYABLE', 'INVENTORY', 'WIP', 'LOAN_PAYABLE', 'LOAN_RECEIVABLE'].includes(account?.subtype ?? '')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? t('accounts.edit') : t('accounts.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast(t('common.saved'))
                  onClose()
                },
              })
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!account && (
          <Field label={t('accounts.kind')} className="sm:col-span-2">
            <Select value={v.subtype} onChange={(e) => set('subtype')(e.target.value)}>
              {NEW_KINDS.map((k) => (
                <option key={k.subtype} value={k.subtype}>
                  {t(`accounts.kinds.${k.subtype}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('common.name')}>
          <Input value={v.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label={t('common.nameBn')}>
          <Input value={v.name_bn} onChange={(e) => set('name_bn')(e.target.value)} />
        </Field>
        <Field label={t('common.code')} hint={!account ? t('accounts.codeHint') : undefined}>
          <Input value={v.code} onChange={(e) => set('code')(e.target.value)} placeholder={!account ? suggestCode(v.subtype) : ''} />
        </Field>
        {(v.subtype === 'BANK' || account?.subtype === 'BANK') && (
          <>
            <Field label={t('accounts.bankName')}>
              <Input value={v.bank_name} onChange={(e) => set('bank_name')(e.target.value)} />
            </Field>
            <Field label={t('accounts.branch')}>
              <Input value={v.branch} onChange={(e) => set('branch')(e.target.value)} />
            </Field>
            <Field label={t('accounts.accountNo')}>
              <Input value={v.account_no} onChange={(e) => set('account_no')(e.target.value)} />
            </Field>
          </>
        )}
        {showOpening && !sys && (
          <>
            <Field label={t('accounts.openingBalance')}>
              <Input type="number" step="0.01" value={v.opening_balance} onChange={(e) => set('opening_balance')(e.target.value)} />
            </Field>
            <Field label={t('parties.openingDate')}>
              <Input type="date" value={v.opening_date} onChange={(e) => set('opening_date')(e.target.value)} />
            </Field>
          </>
        )}
        {!isSystem && (
          <div className="pt-2">
            <Checkbox label={t('common.active')} checked={v.is_active} onChange={(e) => set('is_active')(e.target.checked)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

export function AccountsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const { data, isLoading } = useAccounts()
  const [editing, setEditing] = useState<Account | null | undefined>(undefined)

  return (
    <>
      <PageHeader
        title={t('nav.accounts')}
        subtitle={t('accounts.subtitle')}
        actions={
          can('setup') && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              {t('accounts.new')}
            </Button>
          )
        }
      />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {TYPES.map((type) => {
            const rows = (data ?? []).filter((a) => a.type === type)
            return (
              <Card key={type} title={t(`accounts.types.${type}`)} padded={false}>
                <Table
                  rows={rows}
                  rowKey={(a) => a.id}
                  onRowClick={can('books') ? (a) => navigate(`/accounts/${a.id}`) : undefined}
                  rowClassName={(a) => (a.is_active ? undefined : 'opacity-50')}
                  columns={[
                    { key: 'code', phone: 'sub', header: t('common.code'), cell: (a) => <span className="text-slate-500">{a.code}</span>, className: 'w-20' },
                    {
                      key: 'name',
                      phone: 'title',
                      header: t('common.name'),
                      cell: (a) => (
                        <div>
                          <span className="font-medium">{nameOf(a)}</span>
                          {a.subtype === 'BANK' && a.account_no && <span className="ml-2 text-xs text-slate-500">{[a.bank_name, a.account_no].filter(Boolean).join(' · ')}</span>}
                        </div>
                      ),
                    },
                    { key: 'kind', header: '', cell: (a) => (a.is_system ? <Badge>{t('accounts.system')}</Badge> : null) },
                    { key: 'bal', phone: 'value', header: t('common.balance'), align: 'right', cell: (a) => (can('books') ? <Money value={naturalBalance(a)} colored /> : '') },
                    {
                      key: 'edit',
                      header: '',
                      align: 'right',
                      cell: (a) =>
                        can('setup') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditing(a)
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                        ),
                    },
                  ]}
                />
              </Card>
            )
          })}
        </div>
      )}
      {editing !== undefined && <AccountForm open account={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}

export function AccountLedgerPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { data } = useAccounts()
  const a = data?.find((x) => x.id === id)
  if (!a) return <Loading />
  const money_ = a.subtype === 'CASH' || a.subtype === 'BANK'
  return (
    <>
      <PrintHeader title={`${money_ ? (a.subtype === 'CASH' ? t('reports.cashBook') : t('reports.bankBook')) : t('ledger.title')}: ${nameOf(a)}`} />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/accounts" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {nameOf(a)}
          </span>
        }
        subtitle={t(`accounts.types.${a.type}`)}
        actions={
          <>
            <StatementPdfButton
              subject={{
                title: money_ ? (a.subtype === 'CASH' ? t('reports.cashBook') : t('reports.bankBook')) : t('ledger.title'),
                name: nameOf(a),
                lines: [a.bank_name, a.account_no],
              }}
              account={a.id}
              debitLabel={money_ ? t('money.in') : t('ledger.debit')}
              creditLabel={money_ ? t('money.out') : t('ledger.credit')}
              filename={`${a.code}_${a.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`}
            />
            <PrintButton />
          </>
        }
      />
      <LedgerView
        account={a.id}
        title={money_ ? (a.subtype === 'CASH' ? t('reports.cashBook') : t('reports.bankBook')) : undefined}
        debitLabel={money_ ? t('money.in') : t('ledger.debit')}
        creditLabel={money_ ? t('money.out') : t('ledger.credit')}
      />
    </>
  )
}
