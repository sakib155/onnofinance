import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { AccountSelect, isMoneyAccount, PartyPicker, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { useToast } from '@/components/ui/toast'
import { PartyForm } from '@/features/parties/PartyForm'
import { rpc, useData, useMethodFor, useSave, useWarehouses } from '@/lib/data'
import { money, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { lineAmount, LinesEditor, netKg, newLine, SumRow, type Line } from './LinesEditor'

export type Purchase = {
  id: string
  purchase_no: string
  purchase_date: string
  supplier_id: string
  broker_id: string | null
  warehouse_id: string
  vehicle_no: string | null
  reference: string | null
  notes: string | null
  goods_amount: number
  discount: number
  supplier_total: number
  transport_cost: number
  labour_cost: number
  other_cost: number
  costs_account_id: string | null
  commission_amount: number
  paid_amount: number
  paid_account_id: string | null
  paid_method: 'CASH' | 'BANK' | 'CHEQUE'
  paid_cheque_no: string | null
  paid_cheque_date: string | null
  total_cost: number
  created_by: string | null
  created_at: string
  lines?: PurchaseLine[]
}

export type PurchaseLine = {
  id: string
  line_no: number
  item_id: string
  bags: number
  bag_size_kg: number
  gross_kg: number
  deduction_kg: number
  net_kg: number
  rate: number
  rate_unit: 'KG' | 'BAG'
  amount: number
  unit_cost: number
  lot_id: string | null
}

export function PurchaseForm() {
  const { id } = useParams()
  const { data: warehouses } = useWarehouses()
  const existing = useData<Purchase>(['purchase', id], () => supabase.from('purchases').select('*, lines:purchase_lines(*)').eq('id', id!).single(), {
    enabled: Boolean(id),
  })
  if (existing.error) return <ErrorBox error={existing.error} />
  if ((id && !existing.data) || !warehouses) return <Loading />
  return <PurchaseEditor key={id ?? 'new'} id={id} existing={id ? existing.data : undefined} defaultWarehouse={warehouses[0]?.id ?? ''} />
}

const blank = (v: unknown) => (v == null || num(v) === 0 ? '' : String(v))

function PurchaseEditor({ id, existing: p, defaultWarehouse }: { id?: string; existing?: Purchase; defaultWarehouse: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [h, setH] = useState(() => ({
    purchase_date: p?.purchase_date ?? today(),
    supplier_id: p?.supplier_id ?? '',
    broker_id: p?.broker_id ?? '',
    warehouse_id: p?.warehouse_id ?? defaultWarehouse,
    vehicle_no: p?.vehicle_no ?? '',
    reference: p?.reference ?? '',
    notes: p?.notes ?? '',
    discount: blank(p?.discount),
    transport_cost: blank(p?.transport_cost),
    labour_cost: blank(p?.labour_cost),
    other_cost: blank(p?.other_cost),
    costs_account_id: p?.costs_account_id ?? '',
    commission_amount: blank(p?.commission_amount),
    paid_amount: blank(p?.paid_amount),
    paid_account_id: p?.paid_account_id ?? '',
    paid_method: p?.paid_method ?? 'CASH',
    paid_cheque_no: p?.paid_cheque_no ?? '',
    paid_cheque_date: p?.paid_cheque_date ?? '',
  }))
  const [lines, setLines] = useState<Line[]>(() =>
    p?.lines?.length
      ? [...p.lines]
          .sort((a, b) => a.line_no - b.line_no)
          .map((l) => ({
            key: l.id,
            item_id: l.item_id,
            lot_id: '',
            warehouse_id: '',
            bags: blank(l.bags),
            bag_size_kg: blank(l.bag_size_kg),
            gross_kg: String(l.gross_kg),
            deduction_kg: blank(l.deduction_kg),
            rate: String(l.rate),
            rate_unit: l.rate_unit,
          }))
      : [newLine()],
  )
  const [addingParty, setAddingParty] = useState(false)
  const [costsByUs, setCostsByUs] = useState(Boolean(p?.costs_account_id))
  const methodFor = useMethodFor()
  const set = (k: keyof typeof h) => (v: string) => setH((s) => ({ ...s, [k]: v }))

  const goods = lines.reduce((s, l) => s + lineAmount(l), 0)
  const extras = num(h.transport_cost) + num(h.labour_cost) + num(h.other_cost)
  const supplierBill = goods - num(h.discount) + (costsByUs ? 0 : extras)
  const landed = goods - num(h.discount) + extras + num(h.commission_amount)
  const totalNet = lines.reduce((s, l) => s + netKg(l), 0)

  const save = useSave(async () => {
    if (costsByUs && extras > 0 && !h.costs_account_id) throw new Error(t('trading.chooseCostsAccount'))
    return rpc<string>('save_purchase', {
      p: {
        id,
        ...h,
        discount: num(h.discount),
        transport_cost: num(h.transport_cost),
        labour_cost: num(h.labour_cost),
        other_cost: num(h.other_cost),
        commission_amount: num(h.commission_amount),
        paid_amount: num(h.paid_amount),
        costs_account_id: costsByUs ? h.costs_account_id : '',
        lines: lines
          .filter((l) => l.item_id)
          .map((l) => ({
            item_id: l.item_id,
            bags: num(l.bags),
            bag_size_kg: num(l.bag_size_kg),
            gross_kg: num(l.gross_kg),
            deduction_kg: num(l.deduction_kg),
            rate: num(l.rate),
            rate_unit: l.rate_unit,
          })),
      },
    })
  })

  return (
    <>
      <PageHeader title={id ? `${t('trading.editPurchase')} ${p?.purchase_no ?? ''}` : t('trading.newPurchase')} subtitle={t('trading.purchaseHelp')} />
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('trading.supplier')} className="lg:col-span-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <PartyPicker value={h.supplier_id} onChange={set('supplier_id')} type="SUPPLIER" />
                </div>
                <Button variant="secondary" onClick={() => setAddingParty(true)} title={t('parties.new')}>
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label={t('common.date')}>
              <Input type="date" value={h.purchase_date} onChange={(e) => set('purchase_date')(e.target.value)} />
            </Field>
            <Field label={t('trading.receiveInto')}>
              <WarehouseSelect value={h.warehouse_id} onChange={set('warehouse_id')} />
            </Field>
            <Field label={t('trading.broker')}>
              <PartyPicker value={h.broker_id} onChange={set('broker_id')} type="BROKER" clearable placeholder={t('common.none')} />
            </Field>
            <Field label={t('trading.vehicleNo')}>
              <Input value={h.vehicle_no} onChange={(e) => set('vehicle_no')(e.target.value)} />
            </Field>
            <Field label={t('common.reference')}>
              <Input value={h.reference} onChange={(e) => set('reference')(e.target.value)} placeholder={t('trading.referenceHint')} />
            </Field>
          </div>
        </Card>

        <Card title={t('trading.items')}>
          <LinesEditor lines={lines} onChange={setLines} mode="purchase" />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('trading.costsAndPayment')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('trading.discount')}>
                <Input type="number" min="0" step="0.01" value={h.discount} onChange={(e) => set('discount')(e.target.value)} />
              </Field>
              <Field label={t('trading.commission')} hint={h.broker_id ? undefined : t('trading.commissionNeedsBroker')}>
                <Input type="number" min="0" step="0.01" value={h.commission_amount} onChange={(e) => set('commission_amount')(e.target.value)} />
              </Field>
              <Field label={t('trading.transport')}>
                <Input type="number" min="0" step="0.01" value={h.transport_cost} onChange={(e) => set('transport_cost')(e.target.value)} />
              </Field>
              <Field label={t('trading.labour')}>
                <Input type="number" min="0" step="0.01" value={h.labour_cost} onChange={(e) => set('labour_cost')(e.target.value)} />
              </Field>
              <Field label={t('trading.otherCost')}>
                <Input type="number" min="0" step="0.01" value={h.other_cost} onChange={(e) => set('other_cost')(e.target.value)} />
              </Field>
              <Field label={t('trading.costsPaidBy')}>
                <Select value={costsByUs ? 'ACCOUNT' : 'SUPPLIER'} onChange={(e) => setCostsByUs(e.target.value === 'ACCOUNT')}>
                  <option value="SUPPLIER">{t('trading.addedToSupplierBill')}</option>
                  <option value="ACCOUNT">{t('trading.paidByUs')}</option>
                </Select>
              </Field>
              {costsByUs && (
                <Field label={t('money.paidFrom')}>
                  <AccountSelect value={h.costs_account_id} onChange={set('costs_account_id')} filter={isMoneyAccount} />
                </Field>
              )}
              <Field label={t('trading.paidNow')}>
                <Input type="number" min="0" step="0.01" value={h.paid_amount} onChange={(e) => set('paid_amount')(e.target.value)} />
              </Field>
              {num(h.paid_amount) > 0 && (
                <>
                  <Field label={t('money.paidFrom')}>
                    <AccountSelect
                      value={h.paid_account_id}
                      onChange={(id) => setH((x) => ({ ...x, paid_account_id: id, paid_method: methodFor(id, x.paid_method) as typeof x.paid_method }))}
                      filter={isMoneyAccount}
                    />
                  </Field>
                  <Field label={t('money.method')}>
                    <Select value={h.paid_method} onChange={(e) => set('paid_method')(e.target.value)}>
                      <option value="CASH">{t('money.methods.CASH')}</option>
                      <option value="BANK">{t('money.methods.BANK')}</option>
                      <option value="CHEQUE">{t('money.methods.CHEQUE')}</option>
                    </Select>
                  </Field>
                  {h.paid_method === 'CHEQUE' && (
                    <>
                      <Field label={t('money.chequeNo')}>
                        <Input value={h.paid_cheque_no} onChange={(e) => set('paid_cheque_no')(e.target.value)} />
                      </Field>
                      <Field label={t('money.chequeDate')}>
                        <Input type="date" value={h.paid_cheque_date} onChange={(e) => set('paid_cheque_date')(e.target.value)} />
                      </Field>
                    </>
                  )}
                </>
              )}
              <Field label={t('common.notes')} className="sm:col-span-2">
                <Textarea value={h.notes} onChange={(e) => set('notes')(e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card title={t('common.summary')}>
            <div className="space-y-2">
              <SumRow label={t('trading.netWeight')} value={`${totalNet.toLocaleString()} ${t('unit.kg')}`} />
              <SumRow label={t('trading.goodsValue')} value={money(goods)} />
              {num(h.discount) > 0 && <SumRow label={t('trading.discount')} value={`- ${money(h.discount)}`} />}
              {!costsByUs && extras > 0 && <SumRow label={t('trading.transportLabour')} value={money(extras)} />}
              <SumRow label={t('trading.supplierBill')} value={money(supplierBill)} strong />
              <SumRow label={t('trading.paidNow')} value={money(h.paid_amount)} />
              <SumRow label={t('trading.dueToSupplier')} value={money(supplierBill - num(h.paid_amount))} />
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <SumRow label={t('trading.landedCost')} value={money(landed)} />
                <SumRow label={t('trading.costPerKg')} value={totalNet > 0 ? money(landed / totalNet) : '—'} />
                <p className="mt-1 text-xs text-slate-500">{t('trading.landedHelp')}</p>
              </div>
            </div>
            <ErrorBox error={save.error} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={save.isPending}
                onClick={() =>
                  save.mutate(undefined, {
                    onSuccess: (newId) => {
                      toast(t('common.saved'))
                      navigate(`/purchases/${newId}`, { replace: true })
                    },
                  })
                }
              >
                {t('common.save')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
      {addingParty && <PartyForm open defaultType="SUPPLIER" onClose={() => setAddingParty(false)} onSaved={set('supplier_id')} />}
    </>
  )
}
