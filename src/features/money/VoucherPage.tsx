import { ArrowLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { PrintButton } from '@/components/common'
import { DocPage, SignatureFooter, useUserName } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button, ButtonLink } from '@/components/ui/button'
import { Badge, Loading, PageHeader } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, num } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { isInflow, MoneyForm, type MoneyTxn } from './MoneyForm'

type Settlement = { id: number; amount: number; sale: { id: string; sale_no: string } | null; purchase: { id: string; purchase_no: string } | null }

export function VoucherPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { data: v, isLoading } = useData<MoneyTxn>(['voucher', id], () => supabase.from('v_money_txns').select('*').eq('id', id!).single())
  const { data: settled } = useData<Settlement[]>(['settlements', id], () =>
    supabase.from('bill_settlements').select('id, amount, sale:sales(id, sale_no), purchase:purchases(id, purchase_no)').eq('money_txn_id', id!) as never,
  )
  const del = useSave(() => rpc('delete_money_txn', { p_id: id }))
  const status = useSave((s: string) => rpc('set_cheque_status', { p_id: id, p_status: s }))
  const createdBy = useUserName(v?.created_by)
  const ref = useRef<HTMLDivElement>(null)

  if (isLoading || !v) return <Loading />
  // recorded together with a sale or purchase: changed from there, not here
  const linkTo = v.linked_sale_id ? `/sales/${v.linked_sale_id}` : v.linked_purchase_id ? `/purchases/${v.linked_purchase_id}` : null
  const linkNo = v.linked_sale_no ?? v.linked_purchase_no

  const rows: [string, React.ReactNode][] = [
    [t('common.date'), date(v.txn_date)],
    [t('money.kind'), t(`money.type.${v.txn_type}`)],
    ...(v.party_name ? [[t('common.party'), <Link to={`/parties/${v.party_id}`} className="text-brand-800 hover:underline">{v.party_name}</Link>] as [string, React.ReactNode]] : []),
    [v.txn_type === 'TRANSFER' ? t('money.fromAccount') : isInflow(v.txn_type) ? t('money.receivedInto') : t('money.paidFrom'), v.money_account_name],
    ...(v.counter_account_name ? [[v.txn_type === 'TRANSFER' ? t('money.toAccount') : t('common.account'), v.counter_account_name] as [string, React.ReactNode]] : []),
    ...(linkTo ? [[t('money.recordedWith'), <Link to={linkTo} className="text-brand-800 hover:underline">{linkNo}</Link>] as [string, React.ReactNode]] : []),
    ...(num(v.interest_amount) > 0 ? [[t('money.ofWhichInterest'), money(v.interest_amount)] as [string, React.ReactNode]] : []),
    [t('money.method'), t(`money.methods.${v.method}`)],
    ...(v.method === 'CHEQUE'
      ? [[t('money.cheque'), `${v.cheque_no ?? ''} · ${date(v.cheque_date)} · ${t(`money.chequeStatus.${v.cheque_status}`)}`] as [string, React.ReactNode]]
      : []),
    ...(v.reference ? [[t('common.reference'), v.reference] as [string, React.ReactNode]] : []),
    ...(v.notes ? [[t('common.notes'), v.notes] as [string, React.ReactNode]] : []),
  ]

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/money" variant="ghost" size="sm" className="no-print">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {v.txn_no}
            {v.cheque_status === 'BOUNCED' && <Badge tone="red">{t('money.chequeStatus.BOUNCED')}</Badge>}
          </span>
        }
        actions={
          <>
            {can('money') && v.method === 'CHEQUE' && v.cheque_status !== 'CLEARED' && (
              <Button variant="secondary" onClick={() => status.mutate('CLEARED', { onError: (e) => toast(errorMessage(e), 'error') })}>
                {t('money.markCleared')}
              </Button>
            )}
            {can('money') && v.method === 'CHEQUE' && v.cheque_status !== 'BOUNCED' && (
              <Button variant="secondary" onClick={() => status.mutate('BOUNCED', { onError: (e) => toast(errorMessage(e), 'error') })}>
                {t('money.markBounced')}
              </Button>
            )}
            {can('money') && !linkTo && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
                <Button variant="secondary" onClick={() => setDeleting(true)}>
                  {t('common.delete')}
                </Button>
              </>
            )}
            <PdfButton target={ref} filename={`${v.txn_no}.pdf`} />
            <PrintButton />
          </>
        }
      />
      <div className="overflow-x-auto" ref={ref}>
        <DocPage
          title={`${t(`money.type.${v.txn_type}`)} ${t('money.voucher')}`}
          meta={
            <>
              <div>
                {t('common.voucherNo')}: <b>{v.txn_no}</b>
              </div>
              <div>
                {t('common.date')}: {date(v.txn_date)}
              </div>
            </>
          }
          footer={
            <SignatureFooter
              createdBy={createdBy}
              createdAt={v.created_at}
              signers={v.party_id ? [isInflow(v.txn_type) ? t('print.paidBy') : t('print.receivedBy')] : []}
            />
          }
        >
          <dl className="divide-y divide-slate-200 rounded border border-slate-200 text-sm">
            {rows.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{val}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 bg-slate-50 px-3 py-3 text-base">
              <dt className="font-semibold">{t('common.amount')}</dt>
              <dd className="font-semibold tabular-nums">৳ {money(v.amount)}</dd>
            </div>
          </dl>
          {!!settled?.length && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">{t('money.settledBills')}</div>
              {settled.map((st) => (
                <div key={st.id} className="flex justify-between border-b border-slate-100 py-1 text-sm">
                  <Link to={st.sale ? `/sales/${st.sale.id}` : `/purchases/${st.purchase?.id}`} className="text-brand-800">
                    {st.sale?.sale_no ?? st.purchase?.purchase_no}
                  </Link>
                  <span className="tabular-nums">{money(st.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </DocPage>
      </div>
      {editing && <MoneyForm open txn={v} onClose={() => setEditing(false)} />}
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('common.delete')}
        message={t('common.deleteConfirm', { name: v.txn_no })}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast(t('common.deleted'))
              navigate('/money')
            },
            onError: (e) => toast(errorMessage(e), 'error'),
          })
        }
      />
    </>
  )
}
