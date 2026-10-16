import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ItemPicker, LotPicker, nameOf } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { useItems, useWarehouses } from '@/lib/data'
import { money, num } from '@/lib/format'
import type { RateUnit } from '@/lib/types'

export type Line = {
  key: string
  item_id: string
  lot_id: string
  warehouse_id: string // sale lines: ship from another godown than the sale's
  bags: string
  bag_size_kg: string
  gross_kg: string
  deduction_kg: string
  rate: string
  rate_unit: RateUnit
}

export const newLine = (): Line => ({
  key: crypto.randomUUID(),
  item_id: '',
  lot_id: '',
  warehouse_id: '',
  bags: '',
  bag_size_kg: '',
  gross_kg: '',
  deduction_kg: '',
  rate: '',
  rate_unit: 'KG',
})

export const netKg = (l: Line) => num(l.gross_kg) - num(l.deduction_kg)
export const needsBags = (l: Line) => l.rate_unit === 'BAG' && num(l.bags) <= 0
export const lineAmount = (l: Line) => Math.round(num(l.rate) * (l.rate_unit === 'BAG' ? num(l.bags) : netKg(l)) * 100) / 100

// Item lines for purchases (with weight deductions) and sales (with lot picking)
export function LinesEditor({ lines, onChange, mode, warehouseId }: {
  lines: Line[]
  onChange: (lines: Line[]) => void
  mode: 'purchase' | 'sale'
  warehouseId?: string
}) {
  const { t } = useTranslation()
  const { data: items } = useItems()
  const { data: warehouses } = useWarehouses()

  const update = (key: string, patch: Partial<Line>) =>
    onChange(
      lines.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        // picking an item fills its usual bag size
        if (patch.item_id !== undefined) {
          const item = items?.find((i) => i.id === patch.item_id)
          if (item && !l.bag_size_kg) next.bag_size_kg = String(item.default_bag_kg || '')
          next.lot_id = ''
        }
        if (patch.warehouse_id !== undefined) next.lot_id = ''
        // bags x bag size gives the weight, unless the weight was typed in
        if ((patch.bags !== undefined || patch.bag_size_kg !== undefined) && num(next.bags) && num(next.bag_size_kg)) {
          next.gross_kg = String(Math.round(num(next.bags) * num(next.bag_size_kg) * 1000) / 1000)
        }
        return next
      }),
    )

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="w-[24%] pb-1 font-medium">{t('common.item')}</th>
              {mode === 'sale' && <th className="w-[18%] pb-1 font-medium">{t('stock.lot')}</th>}
              <th className="pb-1 font-medium">{t('unit.bags')}</th>
              <th className="pb-1 font-medium">{t('trading.bagSize')}</th>
              <th className="pb-1 font-medium">{mode === 'purchase' ? t('trading.grossKg') : t('trading.weightKg')}</th>
              {mode === 'purchase' && <th className="pb-1 font-medium">{t('trading.deductionKg')}</th>}
              <th className="pb-1 font-medium">{t('trading.rate')}</th>
              <th className="pb-1 text-right font-medium">{t('common.amount')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="align-top">
                <td className="py-1 pr-2">
                  <ItemPicker value={l.item_id} onChange={(v) => update(l.key, { item_id: v })} />
                  {mode === 'purchase' && num(l.deduction_kg) > 0 && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t('trading.net')}: {netKg(l)} {t('unit.kg')}
                    </div>
                  )}
                </td>
                {mode === 'sale' && (
                  <td className="py-1 pr-2">
                    <LotPicker
                      itemId={l.item_id}
                      warehouseId={l.warehouse_id || warehouseId}
                      value={l.lot_id}
                      onChange={(v) => update(l.key, { lot_id: v })}
                    />
                    {(warehouses?.length ?? 0) > 1 && (
                      <select
                        value={l.warehouse_id}
                        onChange={(e) => update(l.key, { warehouse_id: e.target.value })}
                        className="mt-1 w-full bg-transparent text-xs text-slate-500 focus:outline-none"
                        aria-label={t('trading.lineGodown')}
                      >
                        <option value="">{t('trading.sameGodown')}</option>
                        {warehouses!
                          .filter((w) => w.is_active && w.id !== warehouseId)
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {t('trading.fromGodown', { name: nameOf(w) })}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                )}
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={l.bags}
                    onChange={(e) => update(l.key, { bags: e.target.value })}
                    className={clsx('w-20', needsBags(l) && 'border-red-400 ring-2 ring-red-200')}
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="0.01" value={l.bag_size_kg} onChange={(e) => update(l.key, { bag_size_kg: e.target.value })} className="w-20" />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" min="0" step="0.001" value={l.gross_kg} onChange={(e) => update(l.key, { gross_kg: e.target.value })} className="w-28" />
                </td>
                {mode === 'purchase' && (
                  <td className="py-1 pr-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={l.deduction_kg}
                      onChange={(e) => update(l.key, { deduction_kg: e.target.value })}
                      className="w-24"
                      title={t('trading.deductionHint')}
                    />
                  </td>
                )}
                <td className="py-1 pr-2">
                  <div className="flex">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                      className="w-24 rounded-r-none"
                    />
                    <Select
                      value={l.rate_unit}
                      onChange={(e) => update(l.key, { rate_unit: e.target.value as RateUnit })}
                      className="w-20 rounded-l-none border-l-0 px-1"
                    >
                      <option value="KG">/{t('unit.kg')}</option>
                      <option value="BAG">/{t('unit.bag')}</option>
                    </Select>
                  </div>
                  {needsBags(l) && <div className="mt-0.5 text-xs text-red-600">{t('trading.enterBags')}</div>}
                </td>
                <td className="num py-1 pt-3 pr-2 font-medium">{money(lineAmount(l))}</td>
                <td className="py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [newLine()])}
                    aria-label={t('common.remove')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" onClick={() => onChange([...lines, newLine()])}>
        <Plus className="size-4" />
        {t('trading.addLine')}
      </Button>
    </div>
  )
}

// Two-column summary row used under document forms
export function SumRow({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-slate-200 pt-2 text-base font-semibold' : 'flex justify-between text-sm'}>
      <span className={strong ? '' : 'text-slate-600'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
