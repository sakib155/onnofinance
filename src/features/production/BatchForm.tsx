import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ItemPicker, LotPicker, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { useToast } from '@/components/ui/toast'
import { rpc, useData, useItems, useSave, useWarehouses } from '@/lib/data'
import { kg, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Batch, BatchInput } from './types'

type InputLine = { key: string; item_id: string; lot_id: string; bags: string; qty_kg: string }
const newInput = (): InputLine => ({ key: crypto.randomUUID(), item_id: '', lot_id: '', bags: '', qty_kg: '' })

export function BatchForm() {
  const { id } = useParams()
  const { data: warehouses } = useWarehouses()
  const existing = useData<Batch & { inputs: BatchInput[] }>(
    ['batch-edit', id],
    () => supabase.from('production_batches').select('*, inputs:production_inputs(*)').eq('id', id!).single() as never,
    { enabled: Boolean(id) },
  )
  if (existing.error) return <ErrorBox error={existing.error} />
  if ((id && !existing.data) || !warehouses) return <Loading />
  return <BatchEditor key={id ?? 'new'} id={id} existing={id ? existing.data : undefined} defaultWarehouse={warehouses[0]?.id ?? ''} />
}

function BatchEditor({ id, existing: b, defaultWarehouse }: { id?: string; existing?: Batch & { inputs: BatchInput[] }; defaultWarehouse: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: items } = useItems()
  const [h, setH] = useState(() => ({
    start_date: b?.start_date ?? today(),
    input_warehouse_id: b?.input_warehouse_id ?? defaultWarehouse,
    output_warehouse_id: b?.output_warehouse_id ?? defaultWarehouse,
    notes: b?.notes ?? '',
  }))
  const [inputs, setInputs] = useState<InputLine[]>(() =>
    b?.inputs.length
      ? b.inputs.map((i) => ({ key: i.id, item_id: i.item_id, lot_id: i.lot_id ?? '', bags: num(i.bags) ? String(i.bags) : '', qty_kg: String(i.qty_kg) }))
      : [newInput()],
  )

  const update = (key: string, patch: Partial<InputLine>) =>
    setInputs((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (patch.item_id !== undefined) next.lot_id = ''
        // bags fill the weight using the item's usual bag size
        if (patch.bags !== undefined) {
          const bag = num(items?.find((i) => i.id === next.item_id)?.default_bag_kg)
          if (bag && num(next.bags)) next.qty_kg = String(num(next.bags) * bag)
        }
        return next
      }),
    )

  const save = useSave(() =>
    rpc<string>('save_production_batch', {
      p: {
        id,
        ...h,
        inputs: inputs.filter((i) => i.item_id).map((i) => ({ item_id: i.item_id, lot_id: i.lot_id, bags: num(i.bags), qty_kg: num(i.qty_kg) })),
      },
    }),
  )

  const total = inputs.reduce((s, i) => s + num(i.qty_kg), 0)

  return (
    <>
      <PageHeader title={id ? `${t('common.edit')} ${b?.batch_no ?? ''}` : t('production.newBatch')} subtitle={t('production.newBatchHelp')} />
      <div className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('production.startDate')}>
              <Input type="date" value={h.start_date} onChange={(e) => setH({ ...h, start_date: e.target.value })} />
            </Field>
            <Field label={t('production.paddyFrom')}>
              <WarehouseSelect value={h.input_warehouse_id} onChange={(v) => setH({ ...h, input_warehouse_id: v })} />
            </Field>
            <Field label={t('production.outputTo')}>
              <WarehouseSelect value={h.output_warehouse_id} onChange={(v) => setH({ ...h, output_warehouse_id: v })} />
            </Field>
          </div>
        </Card>
        <Card title={t('production.paddyInputs')}>
          <div className="space-y-2">
            {inputs.map((l) => (
              <div key={l.key} className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
                <Field label={t('common.item')}>
                  <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} categories={['PADDY']} />
                </Field>
                <Field label={t('stock.lot')}>
                  <LotPicker itemId={l.item_id} warehouseId={h.input_warehouse_id} value={l.lot_id} onChange={(v) => update(l.key, { lot_id: v })} />
                </Field>
                <Field label={t('unit.bags')}>
                  <Input type="number" min="0" value={l.bags} onChange={(e) => update(l.key, { bags: e.target.value })} />
                </Field>
                <Field label={t('trading.weightKg')}>
                  <Input type="number" min="0" step="0.001" value={l.qty_kg} onChange={(e) => update(l.key, { qty_kg: e.target.value })} />
                </Field>
                <Button variant="ghost" onClick={() => setInputs((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newInput()]))} aria-label={t('common.remove')}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={() => setInputs([...inputs, newInput()])}>
              <Plus className="size-4" />
              {t('trading.addLine')}
            </Button>
            <div className="text-sm font-medium">
              {t('common.total')}: {kg(total)}
            </div>
          </div>
        </Card>
        <Card>
          <Field label={t('common.notes')}>
            <Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
          </Field>
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
                    navigate(`/production/${newId}`, { replace: true })
                  },
                })
              }
            >
              {id ? t('common.save') : t('production.startBatch')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
