import clsx from 'clsx'
import { ArrowLeft, Check, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { AccountSelect, isExpenseHead, isMoneyAccount, ItemPicker, nameOf, PartyPicker } from '@/components/common'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui/layout'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useItems, useSave } from '@/lib/data'
import { date, kg, money, num, qty, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { STAGES, type Stage } from '@/lib/types'
import { statusTone, type Batch, type BatchCost, type BatchInput, type BatchOutput, type BatchStage } from './types'

type Detail = Batch & { inputs: BatchInput[]; stages: BatchStage[]; costs: BatchCost[]; outputs: BatchOutput[] }

function Stepper({ status }: { status: Batch['status'] }) {
  const { t } = useTranslation()
  const steps = [...STAGES, 'COMPLETED'] as const
  const current = steps.indexOf(status as (typeof steps)[number])
  return (
    <ol className="mb-4 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={clsx(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              i < current || status === 'COMPLETED' ? 'bg-brand-700 text-white' : i === current ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-600' : 'bg-slate-100 text-slate-500',
            )}
          >
            {i < current || status === 'COMPLETED' ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={clsx('text-sm whitespace-nowrap', i === current ? 'font-semibold text-slate-900' : 'text-slate-600')}>{t(`production.status.${s}`)}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-slate-300" />}
        </li>
      ))}
    </ol>
  )
}

function StageForm({ batch, stage, onClose }: { batch: Detail; stage: BatchStage; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const s = (v: unknown) => (v == null ? '' : String(v))
  const [v, setV] = useState({
    start_date: s(stage.start_date),
    end_date: s(stage.end_date),
    input_kg: s(stage.input_kg),
    output_kg: s(stage.output_kg),
    moisture_pct: s(stage.moisture_pct),
    notes: s(stage.notes),
  })
  const next = STAGES[STAGES.indexOf(stage.stage) + 1]
  const save = useSave((moveOn: boolean) =>
    rpc('save_production_stage', {
      p: { batch_id: batch.id, stage: stage.stage, ...v, set_status: moveOn && next ? next : null },
    }),
  )
  const go = (moveOn: boolean) => save.mutate(moveOn, { onSuccess: () => (toast(t('common.saved')), onClose()) })
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Modal
      open
      onClose={onClose}
      title={t(`production.status.${stage.stage}`)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={next && batch.status === stage.stage ? 'secondary' : 'primary'} loading={save.isPending} onClick={() => go(false)}>
            {t('common.save')}
          </Button>
          {next && batch.status === stage.stage && (
            <Button loading={save.isPending} onClick={() => go(true)}>
              {t('production.saveAndMove', { stage: t(`production.status.${next}`) })}
            </Button>
          )}
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">{t(`production.stageHelp.${stage.stage}`)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('production.stageStart')}>
          <Input type="date" value={v.start_date} onChange={set('start_date')} />
        </Field>
        <Field label={t('production.stageEnd')}>
          <Input type="date" value={v.end_date} onChange={set('end_date')} />
        </Field>
        <Field label={t('production.kgIn')}>
          <Input type="number" min="0" step="0.001" value={v.input_kg} onChange={set('input_kg')} />
        </Field>
        <Field label={t('production.kgOut')}>
          <Input type="number" min="0" step="0.001" value={v.output_kg} onChange={set('output_kg')} />
        </Field>
        <Field label={t('production.moisture')}>
          <Input type="number" min="0" max="100" step="0.1" value={v.moisture_pct} onChange={set('moisture_pct')} />
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={v.notes} onChange={set('notes')} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

function CostForm({ batch, onClose }: { batch: Detail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({
    stage: STAGES.includes(batch.status as Stage) ? batch.status : 'GENERAL',
    cost_date: today(),
    cost_head_id: '',
    amount: '',
    paid_by: 'ACCOUNT',
    paid_account_id: '',
    party_id: '',
    notes: '',
  })
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  const save = useSave(() =>
    rpc('save_production_cost', {
      p: {
        batch_id: batch.id,
        stage: v.stage,
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
        <Field label={t('production.stage')}>
          <Select value={v.stage} onChange={(e) => set('stage')(e.target.value)}>
            {[...STAGES, 'GENERAL'].map((s) => (
              <option key={s} value={s}>
                {t(`production.status.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
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

function CompleteForm({ batch, onClose }: { batch: Detail; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: items } = useItems()
  const [when, setWhen] = useState(today())
  const [lines, setLines] = useState<OutLine[]>(() =>
    (items ?? [])
      .filter((i) => i.is_active && (i.category === 'RICE' || i.category === 'BYPRODUCT'))
      .slice(0, 6)
      .map((i) => ({ key: i.id, item_id: i.id, bags: '', bag_size_kg: num(i.default_bag_kg) ? String(i.default_bag_kg) : '', qty_kg: '' })),
  )
  const update = (key: string, patch: Partial<OutLine>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const n = { ...l, ...patch }
        if ((patch.bags !== undefined || patch.bag_size_kg !== undefined) && num(n.bags) && num(n.bag_size_kg)) n.qty_kg = String(num(n.bags) * num(n.bag_size_kg))
        return n
      }),
    )
  const used = lines.filter((l) => l.item_id && num(l.qty_kg) > 0)
  const totalCost = num(batch.input_cost) + batch.costs.reduce((s, c) => s + num(c.amount), 0)
  // preview of the cost split: same rule as the database (value at standard price, else weight)
  const weights = used.map((l) => num(l.qty_kg) * num(items?.find((i) => i.id === l.item_id)?.standard_price))
  const byValue = weights.reduce((a, b) => a + b, 0) > 0
  const base = byValue ? weights : used.map((l) => num(l.qty_kg))
  const sum = base.reduce((a, b) => a + b, 0)
  const outKg = used.reduce((s, l) => s + num(l.qty_kg), 0)

  const save = useSave(() =>
    rpc('complete_production_batch', {
      p: {
        batch_id: batch.id,
        completed_date: when,
        outputs: used.map((l) => ({ item_id: l.item_id, bags: num(l.bags), bag_size_kg: num(l.bag_size_kg), qty_kg: num(l.qty_kg) })),
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
      <p className="mb-3 text-sm text-slate-500">{t('production.completeHelp')}</p>
      <Field label={t('production.completedOn')} className="mb-3 max-w-48">
        <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1 font-medium">{t('production.output')}</th>
              <th className="pb-1 font-medium">{t('unit.bags')}</th>
              <th className="pb-1 font-medium">{t('trading.bagSize')}</th>
              <th className="pb-1 font-medium">{t('trading.weightKg')}</th>
              <th className="pb-1 text-right font-medium">{t('production.costShare')}</th>
              <th className="pb-1 text-right font-medium">{t('trading.costPerKg')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const idx = used.indexOf(l)
              const share = idx >= 0 && sum > 0 ? (totalCost * base[idx]) / sum : 0
              return (
                <tr key={l.key}>
                  <td className="py-1 pr-2">
                    <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} categories={['RICE', 'BYPRODUCT', 'OTHER']} />
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
                  <td className="num py-1 pr-2">{share ? money(share) : ''}</td>
                  <td className="num py-1 pr-2">{share ? money(share / num(l.qty_kg)) : ''}</td>
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
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => setLines([...lines, { key: crypto.randomUUID(), item_id: '', bags: '', bag_size_kg: '', qty_kg: '' }])}
      >
        <Plus className="size-4" />
        {t('trading.addLine')}
      </Button>
      <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
        <div>
          {t('production.paddyIn')}: <b>{kg(batch.input_kg)}</b>
        </div>
        <div>
          {t('production.totalOut')}: <b>{kg(outKg)}</b>
          {num(batch.input_kg) > 0 && <span className="text-slate-500"> ({qty((100 * outKg) / num(batch.input_kg))}%)</span>}
        </div>
        <div>
          {t('production.totalCost')}: <b>{money(totalCost)}</b>
        </div>
        <p className="text-xs text-slate-500 sm:col-span-3">{byValue ? t('production.splitByValue') : t('production.splitByWeight')}</p>
      </div>
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
  const [stageEdit, setStageEdit] = useState<BatchStage | null>(null)
  const [addingCost, setAddingCost] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reopen' | null>(null)
  const { data: b, isLoading } = useData<Detail>(['batch', id], async () => {
    const [batch, rest] = await Promise.all([
      supabase.from('v_production_batches').select('*').eq('id', id!).single(),
      supabase
        .from('production_batches')
        .select(
          'inputs:production_inputs(*, item:items(*), lot:lots(lot_no)), stages:production_stages(*), costs:production_costs(*, head:accounts!production_costs_cost_head_id_fkey(name, name_bn), paid:accounts!production_costs_paid_account_id_fkey(name), party:parties(name)), outputs:production_outputs(*, item:items(*), lot:lots(lot_no))',
        )
        .eq('id', id!)
        .single(),
    ])
    if (batch.error || rest.error) return { data: null, error: batch.error ?? rest.error }
    return { data: { ...(batch.data as Batch), ...(rest.data as object) } as Detail, error: null }
  })
  const { data: items } = useItems()
  const delCost = useSave((costId: string) => rpc('delete_production_cost', { p_id: costId }))
  const delBatch = useSave(() => rpc('delete_production_batch', { p_id: id }))
  const reopen = useSave(() => rpc('reopen_production_batch', { p_id: id }))

  if (isLoading || !b) return <Loading />
  const open = !['COMPLETED', 'CANCELLED'].includes(b.status)
  const stages = STAGES.map((s) => b.stages.find((x) => x.stage === s)!).filter(Boolean)
  const costTotal = b.costs.reduce((s, c) => s + num(c.amount), 0)
  const showCost = can('books')
  const err = (e: unknown) => toast(errorMessage(e), 'error')

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ButtonLink to="/production" variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </ButtonLink>
            {b.batch_no}
            <Badge tone={statusTone(b.status)}>{t(`production.status.${b.status}`)}</Badge>
          </span>
        }
        subtitle={`${t('production.started')} ${date(b.start_date)}${b.completed_date ? ` · ${t('production.completedOn')} ${date(b.completed_date)}` : ''}`}
        actions={
          <>
            {open && can('trade') && (
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
            {open && can('deleteDocs') && (
              <Button variant="secondary" onClick={() => setConfirm('delete')}>
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
      <Stepper status={b.status} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('production.paddyIn')} value={kg(b.input_kg)} hint={showCost ? money(b.input_cost) : undefined} />
        <Stat label={t('production.processingCost')} value={showCost ? money(costTotal) : '—'} hint={t('production.costEntries', { count: b.costs.length })} />
        <Stat
          label={t('production.riceOut')}
          value={b.status === 'COMPLETED' ? kg(b.rice_kg) : '—'}
          hint={b.rice_yield_pct != null && b.status === 'COMPLETED' ? `${t('production.yield')} ${qty(b.rice_yield_pct)}%` : undefined}
        />
        <Stat
          label={t('production.riceCostPerKg')}
          value={showCost && b.rice_cost_per_kg ? money(b.rice_cost_per_kg) : '—'}
          hint={showCost ? `${t('production.totalCost')} ${money(num(b.input_cost) + costTotal)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {stages.map((s) => {
          const loss = num(s.input_kg) && num(s.output_kg) ? num(s.input_kg) - num(s.output_kg) : null
          return (
            <Card
              key={s.stage}
              title={t(`production.status.${s.stage}`)}
              className={clsx(b.status === s.stage && 'ring-2 ring-brand-600')}
              actions={
                open &&
                can('trade') && (
                  <Button size="sm" variant="ghost" onClick={() => setStageEdit(s)}>
                    {t('common.edit')}
                  </Button>
                )
              }
            >
              <dl className="space-y-1 text-sm">
                <Row k={t('production.stageStart')} v={date(s.start_date) || '—'} />
                <Row k={t('production.stageEnd')} v={date(s.end_date) || '—'} />
                <Row k={t('production.kgIn')} v={s.input_kg != null ? kg(s.input_kg) : '—'} />
                <Row k={t('production.kgOut')} v={s.output_kg != null ? kg(s.output_kg) : '—'} />
                {loss != null && <Row k={loss >= 0 ? t('production.weightLoss') : t('production.weightGain')} v={`${kg(Math.abs(loss))} (${qty((100 * Math.abs(loss)) / num(s.input_kg))}%)`} />}
                {s.moisture_pct != null && <Row k={t('production.moisture')} v={`${qty(s.moisture_pct)}%`} />}
                {showCost && <Row k={t('production.stageCost')} v={money(b.costs.filter((c) => c.stage === s.stage).reduce((a, c) => a + num(c.amount), 0))} />}
              </dl>
              {s.notes && <p className="mt-2 text-xs text-slate-500">{s.notes}</p>}
            </Card>
          )
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t('production.paddyInputs')} padded={false}>
          <Table
            rows={b.inputs}
            rowKey={(i) => i.id}
            columns={[
              { key: 'item', header: t('common.item'), cell: (i) => nameOf(i.item) },
              { key: 'lot', header: t('stock.lot'), cell: (i) => <span className="text-xs text-slate-500">{i.lot?.lot_no ?? t('stock.fifo')}</span> },
              { key: 'bags', header: t('unit.bags'), align: 'right', cell: (i) => (num(i.bags) ? qty(i.bags) : '') },
              { key: 'kg', header: t('unit.kg'), align: 'right', cell: (i) => qty(i.qty_kg) },
              ...(showCost ? [{ key: 'cost', header: t('production.cost'), align: 'right' as const, cell: (i: BatchInput) => money(i.cost) }] : []),
            ]}
          />
        </Card>
        <Card
          title={t('production.costs')}
          padded={false}
          actions={
            open &&
            can('trade') && (
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
                      {t(`production.status.${c.stage}`)} · {c.paid?.name ?? c.party?.name}
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
                  can('trade') && (
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
            rows={b.outputs}
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
                header: t('production.ofPaddy'),
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
        </Card>
      )}
      {b.notes && <p className="mt-4 text-sm text-slate-600">{b.notes}</p>}

      {stageEdit && <StageForm batch={b} stage={stageEdit} onClose={() => setStageEdit(null)} />}
      {addingCost && <CostForm batch={b} onClose={() => setAddingCost(false)} />}
      {completing && items && <CompleteForm batch={b} onClose={() => setCompleting(false)} />}
      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? t('common.delete') : t('production.reopen')}
        message={confirm === 'delete' ? t('production.deleteConfirm', { no: b.batch_no }) : t('production.reopenConfirm')}
        danger={confirm === 'delete'}
        loading={delBatch.isPending || reopen.isPending}
        onConfirm={() =>
          confirm === 'delete'
            ? delBatch.mutate(undefined, { onSuccess: () => navigate('/production'), onError: (e) => (setConfirm(null), err(e)) })
            : reopen.mutate(undefined, { onSuccess: () => setConfirm(null), onError: (e) => (setConfirm(null), err(e)) })
        }
      />
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  )
}
