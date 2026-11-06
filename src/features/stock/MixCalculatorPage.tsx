import { Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { nameOf } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Field, Input } from '@/components/ui/form'
import { Card, PageHeader, Stat, statGrid } from '@/components/ui/layout'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, useData, useSave } from '@/lib/data'
import { money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { mixPrice, rowCost } from './mix'
import { MixPdfButton } from './MixPdf'

const blank = { name: '', kg: '', rate: '', sorting: '' }

type OpenOrder = { id: string; order_no: string; po_number: string | null; customer_name: string; customer_name_bn: string | null }

// Works out what a mix of rices costs. It can be saved against an order, but never touches stock
export function MixCalculatorPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([blank, blank])
  const set = (i: number, patch: Partial<typeof blank>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const parse = (r: typeof blank) => ({ kg: num(r.kg), rate: num(r.rate), sorting: num(r.sorting) })
  const mix = mixPrice(rows.map(parse))
  const can = useCan()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [order, setOrder] = useState(params.get('order') ?? '')
  const { data: orders } = useData<OpenOrder[]>(
    ['orders', 'mix-picker'],
    () => supabase.from('v_sales_orders').select('id, order_no, po_number, customer_name, customer_name_bn').eq('status', 'OPEN').order('order_date', { ascending: false }) as never,
    { enabled: can('sale') },
  )
  const save = useSave(() => rpc('save_order_mix', { p_order: order, p_rows: rows.map((r) => ({ ...parse(r), name: r.name.trim() })) }))

  return (
    <>
      <PageHeader
        title={t('stock.mix.title')}
        subtitle={t('stock.mix.subtitle')}
        actions={<MixPdfButton rows={rows.map((r) => ({ ...parse(r), name: r.name.trim() }))} orderNo={orders?.find((o) => o.id === order)?.order_no} disabled={mix.kg <= 0} />}
      />
      <div className="space-y-4">
        <div className={`${statGrid} lg:grid-cols-4`}>
          <Stat label={t('stock.mix.perBag')} value={money(mix.perBag)} />
          <Stat label={t('stock.mix.perKg')} value={money(mix.perKg)} />
          <Stat label={t('stock.mix.total')} value={`${qty(mix.kg)} ${t('unit.kg')}`} hint={`${qty(mix.bags)} ${t('unit.bags')}`} />
          <Stat label={t('stock.mix.totalCost')} value={money(mix.cost)} hint={t('stock.mix.costSplit', { rice: money(mix.riceCost), sorting: money(mix.sorting) })} />
        </div>
        <Card>
          <div className="space-y-3">
            {rows.map((r, i) => {
              const filled = num(r.kg) > 0 && num(r.rate) > 0
              return (
                <div key={i} className="grid grid-cols-2 items-end gap-3 border-b border-slate-100 pb-3 lg:grid-cols-[1fr_5.5rem_7rem_6.5rem_3.5rem_7rem_2.5rem]">
                  <Field label={t('stock.mix.rice')} className="col-span-2 lg:col-span-1">
                    <Input value={r.name} placeholder={t('stock.mix.riceN', { n: i + 1 })} onChange={(e) => set(i, { name: e.target.value })} />
                  </Field>
                  <Field label={t('stock.mix.weight')}>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={r.kg} onChange={(e) => set(i, { kg: e.target.value })} />
                  </Field>
                  <Field label={t('stock.mix.rate')}>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={r.rate} onChange={(e) => set(i, { rate: e.target.value })} />
                  </Field>
                  <Field label={t('stock.mix.sorting')}>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={r.sorting} onChange={(e) => set(i, { sorting: e.target.value })} />
                  </Field>
                  <div className="text-sm">
                    <div className="mb-1 text-xs font-medium text-slate-600">{t('stock.mix.share')}</div>
                    <div className="num flex h-10 items-center">{filled ? `${qty((num(r.kg) / mix.kg) * 100, 1)}%` : '—'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="mb-1 text-xs font-medium text-slate-600">{t('stock.mix.amount')}</div>
                    <div className="num flex h-10 items-center">{filled ? money(rowCost(parse(r))) : '—'}</div>
                  </div>
                  <button
                    className="flex h-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:invisible"
                    disabled={rows.length < 2}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    aria-label={t('common.remove')}
                    title={t('common.remove')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => setRows([...rows, blank])}>
            <Plus className="size-4" />
            {t('stock.mix.add')}
          </Button>
        </Card>
        {can('sale') && (
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('stock.mix.order')} className="min-w-64 flex-1 sm:max-w-md">
                <Combobox
                  value={order}
                  onChange={setOrder}
                  placeholder={t('stock.mix.order')}
                  options={(orders ?? []).map((o) => ({
                    value: o.id,
                    label: `${o.order_no} · ${nameOf({ name: o.customer_name, name_bn: o.customer_name_bn })}`,
                    hint: o.po_number ?? undefined,
                    search: `${o.order_no} ${o.customer_name} ${o.po_number ?? ''}`,
                  }))}
                />
              </Field>
              <Button
                disabled={!order || mix.kg <= 0}
                loading={save.isPending}
                onClick={() =>
                  save.mutate(undefined, {
                    onSuccess: () => {
                      toast(t('common.saved'))
                      navigate(`/orders/${order}`)
                    },
                    onError: (e) => toast(errorMessage(e), 'error'),
                  })
                }
              >
                <Save className="size-4" />
                {t('stock.mix.save')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
