import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ItemPicker, LotPicker, WarehouseSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { useToast } from '@/components/ui/toast'
import { rpc, useData, useItems, useSave, useWarehouses } from '@/lib/data'
import { kg, num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { ItemCategory } from '@/lib/types'
import { SECTION, type Batch, type BatchInput, type BatchKind } from './types'

type InputLine = { key: string; item_id: string; lot_id: string; bags: string; qty_kg: string }
const newInput = (): InputLine => ({ key: crypto.randomUUID(), item_id: '', lot_id: '', bags: '', qty_kg: '' })

export function BatchForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data: warehouses } = useWarehouses()
  const existing = useData<Batch & { inputs: BatchInput[] }>(
    ['batch-edit', id],
    () => supabase.from('production_batches').select('*, inputs:production_inputs(*)').eq('id', id!).single() as never,
    { enabled: Boolean(id) },
  )
  if (existing.error) return <ErrorBox error={existing.error} />
  if ((id && !existing.data) || !warehouses) return <Loading />
  const kind = (existing.data?.kind ?? (params.get('section') === 'SORTER' ? 'SORTER' : 'DRYER')) as BatchKind
  return <BatchEditor key={id ?? `new-${kind}`} id={id} kind={kind} existing={id ? existing.data : undefined} defaultWarehouse={warehouses[0]?.id ?? ''} />
}

// One list of item lines (materials or consumables)
function InputLines({ lines, onChange, categories, warehouseId, addLabel }: {
  lines: InputLine[]
  onChange: (l: InputLine[]) => void
  categories?: ItemCategory[]
  warehouseId: string
  addLabel: string
}) {
  const { t } = useTranslation()
  const { data: items } = useItems()
  const update = (key: string, patch: Partial<InputLine>) =>
    onChange(
      lines.map((l) => {
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
  return (
    <div className="space-y-2">
      {lines.map((l) => (
        <div key={l.key} className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
          <Field label={t('common.item')}>
            <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} categories={categories} />
          </Field>
          <Field label={t('stock.lot')}>
            <LotPicker itemId={l.item_id} warehouseId={warehouseId} value={l.lot_id} onChange={(v) => update(l.key, { lot_id: v })} />
          </Field>
          <Field label={t('unit.bags')}>
            <Input type="number" min="0" value={l.bags} onChange={(e) => update(l.key, { bags: e.target.value })} />
          </Field>
          <Field label={t('trading.weightKg')}>
            <Input type="number" min="0" step="0.001" value={l.qty_kg} onChange={(e) => update(l.key, { qty_kg: e.target.value })} />
          </Field>
          <Button variant="ghost" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} aria-label={t('common.remove')}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...lines, newInput()])}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  )
}

function BatchEditor({ id, kind: initialKind, existing: b, defaultWarehouse }: {
  id?: string
  kind: BatchKind
  existing?: Batch & { inputs: BatchInput[] }
  defaultWarehouse: string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [kind, setKind] = useState<BatchKind>(initialKind)
  const [h, setH] = useState(() => ({
    start_date: b?.start_date ?? today(),
    input_warehouse_id: b?.input_warehouse_id ?? defaultWarehouse,
    output_warehouse_id: b?.output_warehouse_id ?? defaultWarehouse,
    notes: b?.notes ?? '',
  }))
  const toLine = (i: BatchInput): InputLine => ({ key: i.id, item_id: i.item_id, lot_id: i.lot_id ?? '', bags: num(i.bags) ? String(i.bags) : '', qty_kg: String(i.qty_kg) })
  const [materials, setMaterials] = useState<InputLine[]>(() => {
    const m = b?.inputs.filter((i) => i.purpose !== 'CONSUMABLE').map(toLine) ?? []
    return m.length ? m : [newInput()]
  })
  const [consumables, setConsumables] = useState<InputLine[]>(() => b?.inputs.filter((i) => i.purpose === 'CONSUMABLE').map(toLine) ?? [])

  const save = useSave(() =>
    rpc<string>('save_production_batch', {
      p: {
        id,
        kind,
        ...h,
        inputs: [
          ...materials.filter((i) => i.item_id).map((i) => ({ item_id: i.item_id, lot_id: i.lot_id, bags: num(i.bags), qty_kg: num(i.qty_kg), purpose: 'MATERIAL' })),
          ...consumables.filter((i) => i.item_id).map((i) => ({ item_id: i.item_id, lot_id: i.lot_id, bags: num(i.bags), qty_kg: num(i.qty_kg), purpose: 'CONSUMABLE' })),
        ],
      },
    }),
  )

  const total = materials.reduce((s, i) => s + num(i.qty_kg), 0)

  return (
    <>
      <PageHeader
        title={id ? `${t('common.edit')} ${b?.batch_no ?? ''}` : t(`production.newBatchOf.${kind}`)}
        subtitle={t(`production.newHelp.${kind}`)}
      />
      <div className="space-y-4">
        <Card>
          {!id && (
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
              {(['DRYER', 'SORTER'] as BatchKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k)
                    setMaterials([newInput()])
                  }}
                  className={clsx('flex-1 rounded-md px-5 py-1.5', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}
                >
                  {t(`production.section.${k}`)}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('production.startDate')}>
              <Input type="date" value={h.start_date} onChange={(e) => setH({ ...h, start_date: e.target.value })} />
            </Field>
            <Field label={t('production.takeFrom')}>
              <WarehouseSelect value={h.input_warehouse_id} onChange={(v) => setH({ ...h, input_warehouse_id: v })} />
            </Field>
            <Field label={t('production.outputTo')}>
              <WarehouseSelect value={h.output_warehouse_id} onChange={(v) => setH({ ...h, output_warehouse_id: v })} />
            </Field>
          </div>
        </Card>
        <Card title={t(`production.materialTitle.${kind}`)}>
          <InputLines
            lines={materials}
            onChange={setMaterials}
            categories={[SECTION[kind].material]}
            warehouseId={h.input_warehouse_id}
            addLabel={t('trading.addLine')}
          />
          <div className="mt-2 text-right text-sm font-medium">
            {t('common.total')}: {kg(total)}
          </div>
          {kind === 'SORTER' && <p className="mt-1 text-xs text-slate-500">{t('production.sorterLotHelp')}</p>}
        </Card>
        <Card title={t('production.consumablesTitle')}>
          <p className="mb-3 text-sm text-slate-500">{t('production.consumablesHelp')}</p>
          <InputLines lines={consumables} onChange={setConsumables} warehouseId={h.input_warehouse_id} addLabel={t('production.addConsumable')} />
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
