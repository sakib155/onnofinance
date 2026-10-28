import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/app/auth'
import { ItemPicker, LotPicker, nameOf, PartyPicker, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, PageHeader } from '@/components/ui/layout'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { date, money, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Kind = 'sale' | 'purchase'

type ReturnRow = {
  id: string
  return_no: string
  return_date: string
  qty_kg: number
  bags: number
  amount: number
  reason: string | null
  party: { name: string; name_bn: string | null }
  item: { name: string; name_bn: string | null }
  doc: { no: string } | null
}

function ReturnForm({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({
    return_date: today(),
    party_id: '',
    doc_id: '',
    warehouse_id: '',
    item_id: '',
    lot_id: '',
    bags: '',
    qty_kg: '',
    amount: '',
    reason: '',
  })
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }))
  // the party's bills, to link the return to one
  const { data: docs } = useData<{ id: string; no: string; date: string }[]>(
    ['return-docs', kind, v.party_id],
    () =>
      (kind === 'sale'
        ? supabase.from('sales').select('id, no:sale_no, date:sale_date').eq('customer_id', v.party_id).order('sale_date', { ascending: false }).limit(50)
        : supabase.from('purchases').select('id, no:purchase_no, date:purchase_date').eq('supplier_id', v.party_id).order('purchase_date', { ascending: false }).limit(50)) as never,
    { enabled: Boolean(v.party_id) },
  )
  const save = useSave(() =>
    rpc(kind === 'sale' ? 'save_sale_return' : 'save_purchase_return', {
      p: {
        return_date: v.return_date,
        [kind === 'sale' ? 'customer_id' : 'supplier_id']: v.party_id,
        [kind === 'sale' ? 'sale_id' : 'purchase_id']: v.doc_id,
        warehouse_id: v.warehouse_id,
        item_id: v.item_id,
        lot_id: v.lot_id,
        bags: num(v.bags),
        qty_kg: num(v.qty_kg),
        amount: num(v.amount),
        reason: v.reason,
      },
    }),
  )
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'sale' ? t('returns.newSaleReturn') : t('returns.newPurchaseReturn')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast(t('common.saved')), onClose()) })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">{kind === 'sale' ? t('returns.saleHelp') : t('returns.purchaseHelp')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === 'sale' ? t('trading.customer') : t('trading.supplier')}>
          <PartyPicker value={v.party_id} onChange={(x) => setV((s) => ({ ...s, party_id: x, doc_id: '' }))} type={kind === 'sale' ? 'CUSTOMER' : 'SUPPLIER'} />
        </Field>
        <Field label={kind === 'sale' ? t('returns.originalSale') : t('returns.originalPurchase')}>
          <Combobox
            value={v.doc_id}
            onChange={set('doc_id')}
            clearable
            disabled={!v.party_id}
            placeholder={t('common.optional')}
            options={(docs ?? []).map((d) => ({ value: d.id, label: d.no, hint: date(d.date) }))}
          />
        </Field>
        <Field label={t('common.date')}>
          <Input type="date" value={v.return_date} onChange={(e) => set('return_date')(e.target.value)} />
        </Field>
        <Field label={kind === 'sale' ? t('returns.receiveInto') : t('returns.takeFrom')}>
          <WarehouseSelect value={v.warehouse_id} onChange={set('warehouse_id')} />
        </Field>
        <Field label={t('common.item')}>
          <ItemPicker value={v.item_id} onChange={set('item_id')} />
        </Field>
        {kind === 'purchase' && (
          <Field label={t('stock.lot')}>
            <LotPicker itemId={v.item_id} warehouseId={v.warehouse_id} value={v.lot_id} onChange={set('lot_id')} />
          </Field>
        )}
        <Field label={t('unit.bags')}>
          <Input type="number" min="0" value={v.bags} onChange={(e) => set('bags')(e.target.value)} />
        </Field>
        <Field label={t('trading.weightKg')}>
          <Input type="number" min="0" step="0.001" value={v.qty_kg} onChange={(e) => set('qty_kg')(e.target.value)} />
        </Field>
        <Field label={kind === 'sale' ? t('returns.creditCustomer') : t('returns.debitSupplier')}>
          <Input type="number" min="0" step="0.01" value={v.amount} onChange={(e) => set('amount')(e.target.value)} />
        </Field>
        <Field label={t('returns.reason')} className="sm:col-span-2">
          <Textarea value={v.reason} onChange={(e) => set('reason')(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

export function ReturnsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(() => (can('saleReturn', 'books') ? 'sale' : 'purchase'))
  const canKind = can(kind === 'sale' ? 'saleReturn' : 'purchaseReturn')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<ReturnRow | null>(null)
  const { data, isLoading } = useData<ReturnRow[]>(['returns', kind], () =>
    (kind === 'sale'
      ? supabase
          .from('sale_returns')
          .select('*, party:parties(name, name_bn), item:items(name, name_bn), doc:sales(no:sale_no)')
          .order('return_date', { ascending: false })
      : supabase
          .from('purchase_returns')
          .select('*, party:parties(name, name_bn), item:items(name, name_bn), doc:purchases(no:purchase_no)')
          .order('return_date', { ascending: false })) as never,
  )
  const del = useSave((id: string) => rpc(kind === 'sale' ? 'delete_sale_return' : 'delete_purchase_return', { p_id: id }))

  return (
    <>
      <PageHeader
        title={t('nav.returns')}
        subtitle={t('returns.subtitle')}
        actions={
          canKind && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {kind === 'sale' ? t('returns.newSaleReturn') : t('returns.newPurchaseReturn')}
            </Button>
          )
        }
      />
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(['sale', 'purchase'] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={clsx('flex-1 rounded-md px-4 py-1.5', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}
          >
            {k === 'sale' ? t('returns.fromCustomers') : t('returns.toSuppliers')}
          </button>
        ))}
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'date', phone: 'sub', header: t('common.date'), cell: (r) => date(r.return_date) },
            { key: 'no', phone: 'sub', header: t('common.voucherNo'), cell: (r) => <span className="font-medium whitespace-nowrap">{r.return_no}</span> },
            { key: 'party', phone: 'title', header: t('common.party'), cell: (r) => nameOf(r.party) },
            { key: 'doc', header: t('returns.against'), cell: (r) => r.doc?.no ?? '—' },
            { key: 'item', header: t('common.item'), cell: (r) => nameOf(r.item) },
            { key: 'qty', header: t('trading.weightKg'), align: 'right', cell: (r) => qty(r.qty_kg) },
            { key: 'amt', phone: 'value', header: t('common.amount'), align: 'right', cell: (r) => money(r.amount) },
            { key: 'why', header: t('returns.reason'), cell: (r) => <span className="text-xs text-slate-500">{r.reason}</span> },
            {
              key: 'del',
              header: '',
              align: 'right',
              cell: (r) =>
                canKind && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} aria-label={t('common.delete')}>
                    <Trash2 className="size-4" />
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      {creating && <ReturnForm kind={kind} onClose={() => setCreating(false)} />}
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('common.delete')}
        message={t('common.deleteConfirm', { name: deleting?.return_no })}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(deleting!.id, {
            onSuccess: () => {
              toast(t('common.deleted'))
              setDeleting(null)
            },
            onError: (e) => {
              setDeleting(null)
              toast(errorMessage(e), 'error')
            },
          })
        }
      />
    </>
  )
}
