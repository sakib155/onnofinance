import { ArrowLeft, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { AccountSelect, isExpenseHead, isMoneyAccount, ItemPicker, nameOf, PartyPicker } from '@/components/common'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui/layout'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useItems, useSave } from '@/lib/data'
import { date, kg, money, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/types'
import { kindTone, SECTION, statusTone, type Batch, type BatchCost, type BatchInput, type BatchOutput } from './types'

type Detail = Batch & { inputs: BatchInput[]; costs: BatchCost[]; outputs: BatchOutput[] }

function CostForm({ batch, onClose }: { batch: Detail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({ cost_date: today(), cost_head_id: '', amount: '', paid_by: 'ACCOUNT', paid_account_id: '', party_id: '', notes: '' })
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  const save = useSave(() =>
    rpc('save_production_cost', {
      p: {
        batch_id: batch.id,
        stage: 'GENERAL',
        cost_date: v.cost_date,
        cost_head_id: v.cost_head_id,
        amount: num(v.amount),
        paid_account_id: v.paid_by === 'ACCOUNT' ? v.paid_account_id : '',
        party_id: v.paid_by === 'PARTY' ? v.party_id : '',
        notes: v.notes,
      },
    }),
  )
  return (
    <Modal
      open
      onClose={onClose}
      title={t('production.addCost')}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.date')}>
          <Input type="date" value={v.cost_date} onChange={(e) => set('cost_date')(e.target.value)} />
        </Field>
        <Field label={t('production.costHead')}>
          <AccountSelect value={v.cost_head_id} onChange={set('cost_head_id')} filter={isExpenseHead} />
        </Field>
        <Field label={t('common.amount')}>
          <Input type="number" min="0" step="0.01" value={v.amount} onChange={(e) => set('amount')(e.target.value)} />
        </Field>
        <Field label={t('production.paidHow')}>
          <Select value={v.paid_by} onChange={(e) => set('paid_by')(e.target.value)}>
            <option value="ACCOUNT">{t('production.paidNow')}</option>
            <option value="PARTY">{t('production.owedTo')}</option>
          </Select>
        </Field>
        {v.paid_by === 'ACCOUNT' ? (
          <Field label={t('money.paidFrom')}>
            <AccountSelect value={v.paid_account_id} onChange={set('paid_account_id')} filter={isMoneyAccount} />
          </Field>
        ) : (
          <Field label={t('common.party')}>
            <PartyPicker value={v.party_id} onChange={set('party_id')} />
          </Field>
        )}
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Input value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

type OutLine = { key: string; item_id: string; bags: string; bag_size_kg: string; qty_kg: string }

// Same rule as the database: by-products at current price, main products share the rest
function previewCosts(lines: OutLine[], items: Item[], total: number, mainCat: string) {
  const item = (id: string) => items.find((i) => i.id === id)
  const used = lines.filter((l) => l.item_id && num(l.qty_kg) > 0)
  const byValue = used.filter((l) => item(l.item_id)?.category === 'BYPRODUCT').reduce((s, l) => s + num(l.qty_kg) * num(item(l.item_id)?.standard_price), 0)
  const main = used.filter((l) => item(l.item_id)?.category === mainCat)
  const rest = total - byValue
  const byPrice = main.reduce((s, l) => s + num(l.qty_kg) * num(item(l.item_id)?.standard_price), 0)
  const base = byPrice > 0 ? byPrice : main.reduce((s, l) => s + num(l.qty_kg), 0)
  const share = (l: OutLine) => {
    const it = item(l.item_id)
    if (!it || !num(l.qty_kg)) return null
    if (it.category === 'BYPRODUCT') return num(l.qty_kg) * num(it.standard_price)
    if (it.category !== mainCat || base <= 0) return null
    return (rest * (byPrice > 0 ? num(l.qty_kg) * num(it.standard_price) : num(l.qty_kg))) / base
  }
  return { used, byValue, rest, share }
}

function CompleteForm({ batch, items, onClose }: { batch: Detail; items: Item[]; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mainCat = SECTION[batch.kind].main
  // pre-fill this section's usual outputs: its main products, then by-products
  const defaults = batch.kind === 'DRYER' ? ['U-01', 'U-02', 'B-03', 'B-02'] : ['R-01', 'R-02', 'B-01', 'B-04']
  const [when, setWhen] = useState(today())
  const [lines, setLines] = useState<OutLine[]>(() => {
    const preset = defaults.map((c) => items.find((i) => i.code === c && i.is_active)).filter((i): i is Item => Boolean(i))
    const list = preset.length ? preset : items.filter((i) => i.is_active && (i.category === mainCat || i.category === 'BYPRODUCT')).slice(0, 5)
    return list.map((i) => ({ key: i.id, item_id: i.id, bags: '', bag_size_kg: num(i.default_bag_kg) ? String(i.default_bag_kg) : '', qty_kg: '' }))
  })
  const update = (key: string, patch: Partial<OutLine>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const n = { ...l, ...patch }
        if ((patch.bags !== undefined || patch.bag_size_kg !== undefined) && num(n.bags) && num(n.bag_size_kg)) n.qty_kg = String(num(n.bags) * num(n.bag_size_kg))
        return n
      }),
    )
  const totalCost = num(batch.input_cost) + batch.costs.reduce((s, c) => s + num(c.amount), 0)
  const p = previewCosts(lines, items, totalCost, mainCat)
  const outKg = p.used.reduce((s, l) => s + num(l.qty_kg), 0)
  const mainKg = p.used.filter((l) => items.find((i) => i.id === l.item_id)?.category === mainCat).reduce((s, l) => s + num(l.qty_kg), 0)

  const save = useSave(() =>
    rpc('complete_production_batch', {
      p: {
        batch_id: batch.id,
        completed_date: when,
        outputs: p.used.map((l) => ({ item_id: l.item_id, bags: num(l.bags), bag_size_kg: num(l.bag_size_kg), qty_kg: num(l.qty_kg) })),
      },
    }),
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('production.completeBatch')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => (toast(t('common.saved')), onClose()) })}>
            <CheckCircle2 className="size-4" />
            {t('production.complete')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">{t(`production.completeHelp.${batch.kind}`)}</p>
      <Field label={t('production.completedOn')} className="mb-3 max-w-48">
        <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1 font-medium">{t('production.output')}</th>
              <th className="pb-1 font-medium">{t('unit.bags')}</th>
              <th className="pb-1 font-medium">{t('trading.bagSize')}</th>
              <th className="pb-1 font-medium">{t('trading.weightKg')}</th>
              <th className="pb-1 text-right font-medium">{t('production.valuedAt')}</th>
              <th className="pb-1 text-right font-medium">{t('production.costShare')}</th>
              <th className="pb-1 text-right font-medium">{t('trading.costPerKg')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const it = items.find((i) => i.id === l.item_id)
              const share = p.share(l)
              return (
                <tr key={l.key}>
                  <td className="py-1 pr-2">
                    <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} categories={[mainCat, 'BYPRODUCT']} />
                  </td>
                  <td className="py-1 pr-2">
                    <Input type="number" min="0" className="w-20" value={l.bags} onChange={(e) => update(l.key, { bags: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Input type="number" min="0" className="w-20" value={l.bag_size_kg} onChange={(e) => update(l.key, { bag_size_kg: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Input type="number" min="0" step="0.001" className="w-28" value={l.qty_kg} onChange={(e) => update(l.key, { qty_kg: e.target.value })} />
                  </td>
                  <td className="num py-1 pr-2 text-xs text-slate-500">
                    {it?.category === 'BYPRODUCT' ? `${money(it.standard_price)}/${t('unit.kg')}` : it ? t('production.restOfCost') : ''}
                  </td>
                  <td className="num py-1 pr-2">{share != null ? money(share) : ''}</td>
                  <td className="num py-1 pr-2">{share != null && num(l.qty_kg) ? money(share / num(l.qty_kg)) : ''}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('common.remove')}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => setLines([...lines, { key: crypto.randomUUID(), item_id: '', bags: '', bag_size_kg: '', qty_kg: '' }])}>
        <Plus className="size-4" />
        {t('trading.addLine')}
      </Button>
      <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {t(`production.materialIn.${batch.kind}`)}: <b>{kg(batch.input_kg)}</b>
        </div>
        <div>
          {t(`production.mainOut.${batch.kind}`)}: <b>{kg(mainKg)}</b>
          {num(batch.input_kg) > 0 && <span className="text-slate-500"> ({qty((100 * mainKg) / num(batch.input_kg))}%)</span>}
        </div>
        <div>
          {t('production.totalOut')}: <b>{kg(outKg)}</b>
        </div>
        <div>
          {t('production.totalCost')}: <b>{money(totalCost)}</b>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          {t('production.byproductValue')}: <b>{money(p.byValue)}</b> · {t(`production.leftForMain.${batch.kind}`)}:{' '}
          <b className={p.rest < 0 ? 'text-red-600' : ''}>{money(p.rest)}</b>
          {mainKg > 0 && p.rest >= 0 && (
            <span className="text-slate-500">
              {' '}
              ({money(p.rest / mainKg)}/{t('unit.kg')})
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">{t('production.costRule')}</p>
      </div>
      {outKg > num(batch.input_kg) + 0.0005 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t(`production.moreOutThanIn.${batch.kind}`, { out: kg(outKg), in: kg(batch.input_kg) })}
        </div>
      )}
      <ErrorBox error={save.error} />
    </Modal>
  )
}

export function BatchView() {
  const { id } = useParams()
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const [addingCost, setAddingCost] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reopen' | null>(null)
  const { data: items } = useItems()
  const { data: b, isLoading } = useData<Detail>(['batch', id], async () => {
    const [batch, rest] = await Promise.all([
      supabase.from('v_production_batches').select('*').eq('id', id!).single(),
      supabase
        .from('production_batches')
        .select(
          'inputs:production_inputs(*, item:items(*), lot:lots(lot_no, source_type)), costs:production_costs(*, head:accounts!production_costs_cost_head_id_fkey(name, name_bn), paid:accounts!production_costs_paid_account_id_fkey(name), party:parties(name)), outputs:production_outputs(*, item:items(*), lot:lots(lot_no))',
        )
        .eq('id', id!)
        .single(),
    ])
    if (batch.error || rest.error) return { data: null, error: batch.error ?? rest.error }
    return { data: { ...(batch.data as Batch), ...(rest.data as object) } as Detail, error: null }
  })
  const delCost = useSave((costId: string) => rpc('delete_production_cost', { p_id: costId }))
  const delBatch = useSave(() => rpc('delete_production_batch', { p_id: id }))
  const reopen = useSave(() => rpc('reopen_production_batch', { p_id: id }))

  if (isLoading || !b) return <Loading />
  const open = b.status === 'RUNNING'
  const costTotal = b.costs.reduce((s, c) => s + num(c.amount), 0)
  const materials = b.inputs.filter((i) => i.purpose !== 'CONSUMABLE')
  const consumables = b.inputs.filter((i) => i.purpose === 'CONSUMABLE')
  const showCost = can('books')
  const err = (e: unknown) => toast(errorMessage(e), 'error')
  const inputColumns = [
    { key: 'item', header: t('common.item'), cell: (i: BatchInput) => nameOf(i.item) },
    {
      key: 'lot',
      header: t('stock.lot'),
      cell: (i: BatchInput) => <span className="text-xs text-slate-500">{i.lot ? `${i.lot.lot_no} · ${t(`source.${i.lot.source_type}`)}` : t('stock.fifo')}</span>,
    },
    { key: 'bags', header: t('unit.bags'), align: 'right' as const, cell: (i: BatchInput) => (num(i.bags) ? qty(i.bags) : '') },
    { key: 'kg', header: t('unit.kg'), align: 'right' as const, cell: (i: BatchInput) => qty(i.qty_kg) },
    ...(showCost ? [{ key: 'cost', header: t('production.cost'), align: 'right' as const, cell: (i: BatchInput) => money(i.cost) }] : []),
  ]

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <ButtonLink to={`/production?section=${b.kind}`} variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {b.batch_no}
            <Badge tone={kindTone(b.kind)}>{t(`production.section.${b.kind}`)}</Badge>
            <Badge tone={statusTone(b.status)}>{t(`production.status.${b.status}`)}</Badge>
          </span>
        }
        subtitle={`${t('production.started')} ${date(b.start_date)}${b.completed_date ? ` · ${t('production.completedOn')} ${date(b.completed_date)}` : ''}`}
        actions={
          <>
            {open && can('production') && (
              <>
                <ButtonLink to={`/production/${b.id}/edit`} variant="secondary">
                  <Pencil className="size-4" />
                  {t('production.editInputs')}
                </ButtonLink>
                <Button onClick={() => setCompleting(true)}>
                  <CheckCircle2 className="size-4" />
                  {t('production.completeBatch')}
                </Button>
              </>
            )}
            {open && can('deleteDoc') && (
              <Button variant="secondary" onClick={() => setConfirm('delete')} aria-label={t('common.delete')}>
                <Trash2 className="size-4" />
              </Button>
            )}
            {b.status === 'COMPLETED' && can('reopenBatch') && (
              <Button variant="secondary" onClick={() => setConfirm('reopen')}>
                <RotateCcw className="size-4" />
                {t('production.reopen')}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t(`production.materialIn.${b.kind}`)} value={kg(b.input_kg)} hint={showCost ? money(b.material_cost) : undefined} />
        <Stat
          label={t('production.otherCosts')}
          value={showCost ? money(num(b.consumable_cost) + costTotal) : '—'}
          hint={showCost ? `${t('production.consumablesShort')} ${money(b.consumable_cost)} · ${t('production.processing')} ${money(costTotal)}` : undefined}
        />
        <Stat
          label={t(`production.mainOut.${b.kind}`)}
          value={b.status === 'COMPLETED' ? kg(b.main_kg) : '—'}
          hint={b.main_yield_pct != null && b.status === 'COMPLETED' ? `${t('production.yield')} ${qty(b.main_yield_pct)}%` : undefined}
        />
        <Stat
          label={t(`production.mainCostPerKg.${b.kind}`)}
          value={showCost && b.main_cost_per_kg ? money(b.main_cost_per_kg) : '—'}
          hint={showCost && b.status === 'COMPLETED' ? `${t('production.byproductValue')} ${money(b.byproduct_value)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title={t(`production.materialTitle.${b.kind}`)} padded={false}>
            <Table rows={materials} rowKey={(i) => i.id} columns={inputColumns} />
          </Card>
          {consumables.length > 0 && (
            <Card title={t('production.consumablesTitle')} padded={false}>
              <Table rows={consumables} rowKey={(i) => i.id} columns={inputColumns} />
            </Card>
          )}
        </div>
        <Card
          title={t('production.costs')}
          padded={false}
          actions={
            open &&
            can('production') && (
              <Button size="sm" variant="secondary" onClick={() => setAddingCost(true)}>
                <Plus className="size-4" />
                {t('production.addCost')}
              </Button>
            )
          }
        >
          <Table
            rows={[...b.costs].sort((x, y) => x.cost_date.localeCompare(y.cost_date))}
            rowKey={(c) => c.id}
            empty={t('production.noCosts')}
            columns={[
              { key: 'date', header: t('common.date'), cell: (c) => date(c.cost_date) },
              {
                key: 'head',
                header: t('production.costHead'),
                cell: (c) => (
                  <div>
                    {nameOf(c.head)}
                    <div className="text-xs text-slate-500">
                      {c.paid?.name ?? c.party?.name}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </div>
                  </div>
                ),
              },
              { key: 'amt', header: t('common.amount'), align: 'right', cell: (c) => money(c.amount), footer: money(costTotal) },
              {
                key: 'del',
                header: '',
                align: 'right',
                cell: (c) =>
                  open &&
                  can('production') && (
                    <Button size="sm" variant="ghost" onClick={() => delCost.mutate(c.id, { onError: err })} aria-label={t('common.delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  ),
              },
            ]}
          />
        </Card>
      </div>

      {b.status === 'COMPLETED' && (
        <Card title={t('production.outputs')} padded={false} className="mt-4">
          <Table
            rows={[...b.outputs].sort((x, y) => (x.item.category === 'BYPRODUCT' ? 1 : 0) - (y.item.category === 'BYPRODUCT' ? 1 : 0))}
            rowKey={(o) => o.id}
            columns={[
              {
                key: 'item',
                header: t('common.item'),
                cell: (o) => (
                  <div>
                    <span className="font-medium">{nameOf(o.item)}</span> <Badge>{t(`category.${o.item.category}`)}</Badge>
                  </div>
                ),
              },
              { key: 'lot', header: t('stock.lot'), cell: (o) => <span className="text-xs text-slate-500">{o.lot?.lot_no}</span> },
              { key: 'bags', header: t('unit.bags'), align: 'right', cell: (o) => (num(o.bags) ? `${qty(o.bags)} × ${qty(o.bag_size_kg)}` : '') },
              { key: 'kg', header: t('unit.kg'), align: 'right', cell: (o) => qty(o.qty_kg), footer: qty(b.output_kg) },
              {
                key: 'pct',
                header: t(`production.ofMaterial.${b.kind}`),
                align: 'right',
                cell: (o) => (num(b.input_kg) ? `${qty((100 * num(o.qty_kg)) / num(b.input_kg))}%` : ''),
                footer: b.total_yield_pct != null ? `${qty(b.total_yield_pct)}%` : '',
              },
              ...(showCost
                ? [
                    { key: 'share', header: t('production.costShare'), align: 'right' as const, cell: (o: BatchOutput) => money(o.cost_share), footer: money(b.total_cost) },
                    { key: 'unit', header: t('trading.costPerKg'), align: 'right' as const, cell: (o: BatchOutput) => money(o.unit_cost) },
                  ]
                : []),
            ]}
          />
          {showCost && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('production.costRule')}</p>}
        </Card>
      )}
      {b.notes && <p className="mt-4 text-sm text-slate-600">{b.notes}</p>}

      {addingCost && <CostForm batch={b} onClose={() => setAddingCost(false)} />}
      {completing && items && <CompleteForm batch={b} items={items} onClose={() => setCompleting(false)} />}
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('common.delete') : t('production.reopen')}
        message={confirm === 'delete' ? t('production.deleteConfirm', { no: b.batch_no }) : t('production.reopenConfirm')}
        danger={confirm === 'delete'}
        loading={delBatch.isPending || reopen.isPending}
        onConfirm={() =>
          confirm === 'delete'
            ? delBatch.mutate(undefined, { onSuccess: () => navigate(`/production?section=${b.kind}`), onError: (e) => (setConfirm(null), err(e)) })
            : reopen.mutate(undefined, { onSuccess: () => setConfirm(null), onError: (e) => (setConfirm(null), err(e)) })
        }
      />
    </>
  )
}
