import clsx from 'clsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateRange, nameOf, PrintButton } from '@/components/common'
import { PrintHeader } from '@/components/PrintHeader'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader, Stat, statGrid } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { date, money, num, qty, today, yearStart } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Kind = 'DRYER' | 'SORTER'

type SupplierYield = {
  kind: Kind
  supplier_id: string | null
  supplier_name: string | null
  supplier_name_bn: string | null
  origin_type: string | null
  material_kg: number
  batches: number
  mixed_batches: number
  material_cost: number
  purchase_cost_per_kg: number | null
  main_kg: number
  main_yield_pct: number | null
  byproduct_kg: number
  byproduct_value: number
  other_cost: number
  main_cost: number
  main_cost_per_kg: number | null
  rank: number
  cheaper_but_dearer: boolean
  beaten_by: string | null
  beaten_by_bn: string | null
}

// Suppliers ranked by what their paddy (or unsorted rice) actually produced: cost per kg of the rice that came out
export function SupplierYieldPage() {
  const { t } = useTranslation()
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const [kind, setKind] = useState<Kind>('DRYER')
  const { data, isLoading } = useData<SupplierYield[]>(['supplier-yield', from, to], () => supabase.rpc('report_supplier_yield', { p_from: from, p_to: to }))
  const rows = (data ?? []).filter((r) => r.kind === kind)
  const sum = (k: keyof SupplierYield) => rows.reduce((s, r) => s + num(r[k]), 0)
  const materialKg = sum('material_kg')
  const mainKg = sum('main_kg')
  const mainCat = kind === 'DRYER' ? 'UNSORTED' : 'RICE'
  const who = (r: SupplierYield) =>
    r.supplier_name ? nameOf({ name: r.supplier_name, name_bn: r.supplier_name_bn }) : r.origin_type === 'PRODUCTION' ? t('reports.syOwnDryer') : t('reports.syOtherStock')

  return (
    <>
      <PrintHeader title={`${t('reports.supplierYield')} · ${t(`production.section.${kind}`)} · ${date(from)} – ${date(to)}`} />
      <PageHeader
        title={t('reports.supplierYield')}
        subtitle={t('reports.supplierYieldHelp')}
        actions={
          <>
            <DateRange
              from={from}
              to={to}
              onChange={(f, tt) => {
                setFrom(f)
                setTo(tt)
              }}
            />
            <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="w-44">
              <option value="DRYER">{t('production.section.DRYER')}</option>
              <option value="SORTER">{t('production.section.SORTER')}</option>
            </Select>
            <PrintButton />
          </>
        }
      />
      <div className={clsx(statGrid, 'mb-4 sm:grid-cols-4')}>
        <Stat label={t('reports.sySupplied', { material: t(`category.${kind === 'DRYER' ? 'PADDY' : 'UNSORTED'}`) })} value={qty(materialKg)} hint={t('unit.kg')} />
        <Stat label={t('reports.syMade', { product: t(`category.${mainCat}`) })} value={qty(mainKg)} hint={t('unit.kg')} />
        <Stat label={t('reports.syYield')} value={materialKg > 0 ? `${qty((100 * mainKg) / materialKg)}%` : '–'} />
        <Stat label={t(`reports.syMainCost.${kind}`)} value={mainKg > 0 ? money(sum('main_cost') / mainKg) : '–'} />
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(r) => `${r.supplier_id ?? r.origin_type}`}
          rowClassName={(r) => (r.cheaper_but_dearer ? 'bg-amber-50' : undefined)}
          empty={t('reports.syEmpty')}
          columns={[
            { key: 'rank', phone: 'hide', header: '#', cell: (r) => <span className="font-semibold tabular-nums text-slate-500">{r.rank}</span> },
            {
              key: 'who',
              phone: 'title',
              header: t('trading.supplier'),
              cell: (r) => (
                <div>
                  <span className="font-medium text-slate-900">{who(r)}</span>
                  {!r.supplier_id && (
                    <Badge tone="violet">{r.origin_type === 'PRODUCTION' ? t('source.PRODUCTION') : t('reports.syNotBought')}</Badge>
                  )}
                  <div className="text-xs text-slate-500">
                    {t('reports.syBatches', { count: num(r.batches) })}
                    {num(r.mixed_batches) > 0 && ` · ${t('reports.syMixed', { count: num(r.mixed_batches) })}`}
                  </div>
                  {r.cheaper_but_dearer && (
                    <div className="mt-1 text-xs font-medium text-amber-800">
                      {t('reports.syCheaperButDearer', { name: nameOf({ name: r.beaten_by ?? '', name_bn: r.beaten_by_bn }) })}
                    </div>
                  )}
                </div>
              ),
            },
            { key: 'kg', header: t('reports.syKg'), align: 'right', cell: (r) => qty(r.material_kg), footer: qty(materialKg) },
            { key: 'buy', header: t('reports.syBuyCost'), align: 'right', cell: (r) => (r.purchase_cost_per_kg != null ? money(r.purchase_cost_per_kg) : '') },
            {
              key: 'yield',
              header: t('reports.syYield'),
              align: 'right',
              cell: (r) => (
                <div>
                  {r.main_yield_pct != null ? `${qty(r.main_yield_pct)}%` : ''}
                  <div className="text-xs text-slate-500">{qty(r.main_kg)} {t('unit.kg')}</div>
                </div>
              ),
            },
            {
              key: 'by',
              header: t('reports.syByproducts'),
              align: 'right',
              cell: (r) => (
                <div>
                  {qty(r.byproduct_kg)} {t('unit.kg')}
                  <div className="text-xs text-slate-500">{money(r.byproduct_value)}</div>
                </div>
              ),
              footer: money(sum('byproduct_value')),
            },
            {
              key: 'main',
              phone: 'value',
              header: t(`reports.syMainCost.${kind}`),
              align: 'right',
              cell: (r) => (
                <span className={r.cheaper_but_dearer ? 'font-semibold text-amber-800' : r.rank === 1 ? 'font-semibold text-brand-800' : 'font-semibold'}>
                  {r.main_cost_per_kg != null ? money(r.main_cost_per_kg) : ''}
                </span>
              ),
            },
          ]}
        />
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('reports.syNote')}</p>
      </Card>
    </>
  )
}
