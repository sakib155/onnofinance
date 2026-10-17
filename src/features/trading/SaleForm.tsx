import { Layers, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { AccountSelect, isMoneyAccount, PartyPicker, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { PartyForm } from '@/features/parties/PartyForm'
import { rpc, useData, useMethodFor, useParties, useSave, useWarehouses } from '@/lib/data'
import { kg, money, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useStockSummary } from '@/features/stock/StockPage'
import { lineAmount, LinesEditor, newLine, SumRow, type Line } from './LinesEditor'

export type Sale = {
  id: string
  sale_no: string
  sale_date: string
  customer_id: string
  broker_id: string | null
  warehouse_id: string
  vehicle_no: string | null
  driver_name: string | null
  driver_phone: string | null
  reference: string | null
  notes: string | null
  goods_amount: number
  transport_charge: number
  labour_charge: number
  discount: number
  total_amount: number
  commission_amount: number
  received_amount: number
  received_account_id: string | null
  received_method: 'CASH' | 'BANK' | 'CHEQUE'
  received_cheque_no: string | null
  received_cheque_date: string | null
  cost_amount: number
  created_by: string | null
  created_at: string
  lines?: SaleLine[]
}

export type SaleLine = {
  id: string
  line_no: number
  item_id: string
  lot_id: string | null
  warehouse_id: string | null
  bags: number
  bag_size_kg: number
  qty_kg: number
  rate: number
  rate_unit: 'KG' | 'BAG'
  amount: number
  cost_amount: number
}

export function SaleForm() {
  const { id } = useParams()
  const { data: warehouses } = useWarehouses()
  const existing = useData<Sale>(['sale', id], () => supabase.from('sales').select('*, lines:sale_lines(*)').eq('id', id!).single(), { enabled: Boolean(id) })
  if (existing.error) return <ErrorBox error={existing.error} />
  if ((id && !existing.data) || !warehouses) return <Loading />
  return <SaleEditor key={id ?? 'new'} id={id} existing={id ? existing.data : undefined} defaultWarehouse={warehouses[0]?.id ?? ''} />
}

const blank = (v: unknown) => (v == null || num(v) === 0 ? '' : String(v))

function SaleEditor({ id, existing: s, defaultWarehouse }: { id?: string; existing?: Sale; defaultWarehouse: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: customers } = useParties()
  const [h, setH] = useState(() => ({
    sale_date: s?.sale_date ?? today(),
    customer_id: s?.customer_id ?? '',
    broker_id: s?.broker_id ?? '',
    warehouse_id: s?.warehouse_id ?? defaultWarehouse,
    vehicle_no: s?.vehicle_no ?? '',
    driver_name: s?.driver_name ?? '',
    driver_phone: s?.driver_phone ?? '',
    reference: s?.reference ?? '',
    notes: s?.notes ?? '',
    transport_charge: blank(s?.transport_charge),
    labour_charge: blank(s?.labour_charge),
    discount: blank(s?.discount),
    commission_amount: blank(s?.commission_amount),
    received_amount: blank(s?.received_amount),
    received_account_id: s?.received_account_id ?? '',
    received_method: s?.received_method ?? 'CASH',
    received_cheque_no: s?.received_cheque_no ?? '',
    received_cheque_date: s?.received_cheque_date ?? '',
  }))
  const [lines, setLines] = useState<Line[]>(() =>
    s?.lines?.length
      ? [...s.lines]
          .sort((a, b) => a.line_no - b.line_no)
          .map((l) => ({
            key: l.id,
            item_id: l.item_id,
            lot_id: l.lot_id ?? '',
            warehouse_id: l.warehouse_id ?? '',
            bags: blank(l.bags),
            bag_size_kg: blank(l.bag_size_kg),
            gross_kg: String(l.qty_kg),
            deduction_kg: '',
            rate: String(l.rate),
            rate_unit: l.rate_unit,
          }))
      : [newLine()],
  )
  const [addingParty, setAddingParty] = useState(false)
  const [overLimit, setOverLimit] = useState(false)
  const { data: stock } = useStockSummary()
  // by-products in this godown, for selling them all (or half) in one go
  const byproductStock = (stock ?? []).filter((r) => r.category === 'BYPRODUCT' && r.warehouse_id === h.warehouse_id && num(r.qty_kg) > 0)
  const addByproducts = (share: number) =>
    setLines((ls) => {
      const kept = ls.filter((l) => l.item_id && !byproductStock.some((r) => r.item_id === l.item_id))
      const added = byproductStock.map((r) => ({
        ...newLine(),
        item_id: r.item_id,
        gross_kg: String(Math.round(num(r.qty_kg) * share * 1000) / 1000),
        bags: num(r.bags) ? String(Math.floor(num(r.bags) * share)) : '',
      }))
      return [...kept, ...added]
    })
  const methodFor = useMethodFor()
  const set = (k: keyof typeof h) => (v: string) => setH((x) => ({ ...x, [k]: v }))

  const goods = lines.reduce((s, l) => s + lineAmount(l), 0)
  const total = goods - num(h.discount) + num(h.transport_charge) + num(h.labour_charge)
  const customer = customers?.find((c) => c.id === h.customer_id)
  const prevBalance = num(customer?.balance) - (s ? num(s.total_amount) - num(s.received_amount) : 0)

  const save = useSave(() =>
    rpc<string>('save_sale', {
      p: {
        id,
        ...h,
        transport_charge: num(h.transport_charge),
        labour_charge: num(h.labour_charge),
        discount: num(h.discount),
        commission_amount: num(h.commission_amount),
        received_amount: num(h.received_amount),
        lines: lines
          .filter((l) => l.item_id)
          .map((l) => ({
            item_id: l.item_id,
            lot_id: l.lot_id,
            warehouse_id: l.warehouse_id,
            bags: num(l.bags),
            bag_size_kg: num(l.bag_size_kg),
            qty_kg: num(l.gross_kg),
            rate: num(l.rate),
            rate_unit: l.rate_unit,
          })),
      },
    }),
  )

  const dueAfter = prevBalance + total - num(h.received_amount)
  const limit = customer?.credit_limit != null ? num(customer.credit_limit) : null
  const submit = () =>
    save.mutate(undefined, {
      onSuccess: (newId) => {
        toast(t('common.saved'))
        navigate(`/sales/${newId}`, { replace: true })
      },
    })

  return (
    <>
      <PageHeader title={id ? `${t('trading.editSale')} ${s?.sale_no ?? ''}` : t('trading.newSale')} subtitle={t('trading.saleHelp')} />
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label={t('trading.customer')}
              className="lg:col-span-2"
              hint={customer && Math.abs(prevBalance) > 0.005 ? t('trading.previousBalance', { amount: money(prevBalance) }) : undefined}
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <PartyPicker value={h.customer_id} onChange={set('customer_id')} type="CUSTOMER" />
                </div>
                <Button variant="secondary" onClick={() => setAddingParty(true)} title={t('parties.new')}>
                  <UserPlus className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label={t('common.date')}>
              <Input type="date" value={h.sale_date} onChange={(e) => set('sale_date')(e.target.value)} />
            </Field>
            <Field label={t('trading.deliverFrom')}>
              <WarehouseSelect value={h.warehouse_id} onChange={set('warehouse_id')} />
            </Field>
            <Field label={t('trading.vehicleNo')}>
              <Input value={h.vehicle_no} onChange={(e) => set('vehicle_no')(e.target.value)} />
            </Field>
            <Field label={t('trading.driver')}>
              <Input value={h.driver_name} onChange={(e) => set('driver_name')(e.target.value)} />
            </Field>
            <Field label={t('trading.driverPhone')}>
              <Input value={h.driver_phone} onChange={(e) => set('driver_phone')(e.target.value)} />
            </Field>
            <Field label={t('trading.broker')}>
              <PartyPicker value={h.broker_id} onChange={set('broker_id')} type="BROKER" clearable placeholder={t('common.none')} />
            </Field>
          </div>
        </Card>

        <Card
          title={t('trading.items')}
          actions={
            byproductStock.length > 0 && (
              <>
                <Button size="sm" variant="secondary" onClick={() => addByproducts(1)}>
                  <Layers className="size-4" />
                  {t('trading.sellAllByproducts')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addByproducts(0.5)}>
                  {t('trading.sellHalfByproducts')}
                </Button>
              </>
            )
          }
        >
          <LinesEditor lines={lines} onChange={setLines} mode="sale" warehouseId={h.warehouse_id} />
          <p className="mt-2 text-xs text-slate-500">{t('trading.lotHelp')}</p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('trading.chargesAndPayment')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('trading.transportCharge')}>
                <Input type="number" min="0" step="0.01" value={h.transport_charge} onChange={(e) => set('transport_charge')(e.target.value)} />
              </Field>
              <Field label={t('trading.labourCharge')}>
                <Input type="number" min="0" step="0.01" value={h.labour_charge} onChange={(e) => set('labour_charge')(e.target.value)} />
              </Field>
              <Field label={t('trading.discount')}>
                <Input type="number" min="0" step="0.01" value={h.discount} onChange={(e) => set('discount')(e.target.value)} />
              </Field>
              <Field label={t('trading.commission')} hint={h.broker_id ? undefined : t('trading.commissionNeedsBroker')}>
                <Input type="number" min="0" step="0.01" value={h.commission_amount} onChange={(e) => set('commission_amount')(e.target.value)} />
              </Field>
              <Field label={t('trading.receivedNow')}>
                <Input type="number" min="0" step="0.01" value={h.received_amount} onChange={(e) => set('received_amount')(e.target.value)} />
              </Field>
              {num(h.received_amount) > 0 && (
                <>
                  <Field label={t('money.receivedInto')}>
                    <AccountSelect
                      value={h.received_account_id}
                      onChange={(id) => setH((x) => ({ ...x, received_account_id: id, received_method: methodFor(id, x.received_method) as typeof x.received_method }))}
                      filter={isMoneyAccount}
                    />
                  </Field>
                  <Field label={t('money.method')}>
                    <Select value={h.received_method} onChange={(e) => set('received_method')(e.target.value)}>
                      <option value="CASH">{t('money.methods.CASH')}</option>
                      <option value="BANK">{t('money.methods.BANK')}</option>
                      <option value="CHEQUE">{t('money.methods.CHEQUE')}</option>
                    </Select>
                  </Field>
                  {h.received_method === 'CHEQUE' && (
                    <>
                      <Field label={t('money.chequeNo')}>
                        <Input value={h.received_cheque_no} onChange={(e) => set('received_cheque_no')(e.target.value)} />
                      </Field>
                      <Field label={t('money.chequeDate')}>
                        <Input type="date" value={h.received_cheque_date} onChange={(e) => set('received_cheque_date')(e.target.value)} />
                      </Field>
                    </>
                  )}
                </>
              )}
              <Field label={t('common.reference')}>
                <Input value={h.reference} onChange={(e) => set('reference')(e.target.value)} />
              </Field>
              <Field label={t('common.notes')} className="sm:col-span-2">
                <Textarea value={h.notes} onChange={(e) => set('notes')(e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card title={t('common.summary')}>
            <div className="space-y-2">
              <SumRow label={t('trading.totalWeight')} value={kg(lines.reduce((s, l) => s + num(l.gross_kg), 0))} />
              <SumRow label={t('trading.goodsValue')} value={money(goods)} />
              {num(h.transport_charge) > 0 && <SumRow label={t('trading.transportCharge')} value={money(h.transport_charge)} />}
              {num(h.labour_charge) > 0 && <SumRow label={t('trading.labourCharge')} value={money(h.labour_charge)} />}
              {num(h.discount) > 0 && <SumRow label={t('trading.discount')} value={`- ${money(h.discount)}`} />}
              <SumRow label={t('trading.invoiceTotal')} value={money(total)} strong />
              <SumRow label={t('trading.receivedNow')} value={money(h.received_amount)} />
              <SumRow label={t('trading.dueOnInvoice')} value={money(total - num(h.received_amount))} />
              {customer && <SumRow label={t('trading.customerTotalDue')} value={money(dueAfter)} />}
            </div>
            {limit != null && dueAfter > limit + 0.005 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('trading.overLimit', { limit: money(limit), over: money(dueAfter - limit) })}
              </div>
            )}
            <ErrorBox error={save.error} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button loading={save.isPending} onClick={() => (limit != null && dueAfter > limit + 0.005 ? setOverLimit(true) : submit())}>
                {t('common.save')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
      {addingParty && <PartyForm open defaultType="CUSTOMER" onClose={() => setAddingParty(false)} onSaved={set('customer_id')} />}
      <ConfirmModal
        open={overLimit}
        onClose={() => setOverLimit(false)}
        title={t('trading.overLimitTitle')}
        message={t('trading.overLimit', { limit: money(limit), over: money(dueAfter - num(limit)) })}
        danger={false}
        loading={save.isPending}
        onConfirm={() => {
          setOverLimit(false)
          submit()
        }}
      />
    </>
  )
}
