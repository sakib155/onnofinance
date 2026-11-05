import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card, PageHeader, Stat, statGrid } from '@/components/ui/layout'
import { money, num, qty } from '@/lib/format'
import { mixPrice } from './mix'

const blank = { name: '', bags: '', rate: '' }

// Works out what a mix of rices costs. Nothing here is saved or touches stock
export function MixCalculatorPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([blank, blank])
  const set = (i: number, patch: Partial<typeof blank>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const mix = mixPrice(rows.map((r) => ({ bags: num(r.bags), rate: num(r.rate) })))

  return (
    <>
      <PageHeader title={t('stock.mix.title')} subtitle={t('stock.mix.subtitle')} />
      <div className="space-y-4">
        <div className={`${statGrid} lg:grid-cols-4`}>
          <Stat label={t('stock.mix.perBag')} value={money(mix.perBag)} />
          <Stat label={t('stock.mix.perKg')} value={money(mix.perKg)} />
          <Stat label={t('stock.mix.total')} value={`${qty(mix.bags)} ${t('unit.bags')}`} hint={`${qty(mix.kg)} ${t('unit.kg')}`} />
          <Stat label={t('stock.mix.totalCost')} value={money(mix.cost)} />
        </div>
        <Card>
          <div className="space-y-3">
            {rows.map((r, i) => {
              const filled = num(r.bags) > 0 && num(r.rate) > 0
              return (
                <div key={i} className="grid grid-cols-2 items-end gap-3 border-b border-slate-100 pb-3 sm:grid-cols-[1fr_7rem_9rem_4rem_8rem_2.5rem]">
                  <Field label={t('stock.mix.rice')} className="col-span-2 sm:col-span-1">
                    <Input value={r.name} placeholder={t('stock.mix.riceN', { n: i + 1 })} onChange={(e) => set(i, { name: e.target.value })} />
                  </Field>
                  <Field label={t('stock.mix.bags')}>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={r.bags} onChange={(e) => set(i, { bags: e.target.value })} />
                  </Field>
                  <Field label={t('stock.mix.rate')}>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={r.rate} onChange={(e) => set(i, { rate: e.target.value })} />
                  </Field>
                  <div className="text-sm">
                    <div className="mb-1 text-xs font-medium text-slate-600">{t('stock.mix.share')}</div>
                    <div className="num flex h-10 items-center">{filled ? `${qty((num(r.bags) / mix.bags) * 100, 1)}%` : '—'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="mb-1 text-xs font-medium text-slate-600">{t('stock.mix.amount')}</div>
                    <div className="num flex h-10 items-center">{filled ? money(num(r.bags) * num(r.rate)) : '—'}</div>
                  </div>
                  <button
                    className="flex h-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:invisible max-sm:col-span-2"
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
      </div>
    </>
  )
}
