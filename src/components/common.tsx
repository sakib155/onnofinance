import clsx from 'clsx'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { useAccounts, useData, useItems, useParties, useWarehouses } from '@/lib/data'
import { kg, money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { lotOrigin, type Account, type ItemCategory, type Lot } from '@/lib/types'
import { Button } from './ui/button'
import { Combobox } from './ui/combobox'
import { Input, Select } from './ui/form'

// Bangla name when the app is in Bangla and one is set
export const nameOf = (o: { name: string; name_bn?: string | null } | null | undefined) =>
  o ? (i18n.language === 'bn' && o.name_bn ? o.name_bn : o.name) : ''

export function Money({ value, className, colored }: { value: unknown; className?: string; colored?: boolean }) {
  const n = num(value)
  return <span className={clsx('tabular-nums', colored && n < 0 && 'text-red-600', className)}>{money(n)}</span>
}

// Party balance with direction: "12,000.00 Dr" (they owe us) / "Cr" (we owe them)
export function Balance({ value }: { value: unknown }) {
  const { t } = useTranslation()
  const n = num(value)
  if (Math.abs(n) < 0.005) return <span className="text-slate-400">0.00</span>
  return (
    <span className={clsx('tabular-nums', n > 0 ? 'text-brand-800' : 'text-red-600')}>
      {money(Math.abs(n))} <span className="text-xs">{n > 0 ? t('balance.dr') : t('balance.cr')}</span>
    </span>
  )
}

export function PartyPicker({ value, onChange, type, clearable, placeholder }: {
  value: string | null | undefined
  onChange: (v: string) => void
  type?: string
  clearable?: boolean
  placeholder?: string
}) {
  const { data } = useParties(type)
  const options = (data ?? [])
    .filter((p) => p.is_active || p.id === value)
    .map((p) => ({ value: p.id, label: nameOf(p), hint: [p.phone, p.code].filter(Boolean).join(' · '), search: p.name }))
  return <Combobox value={value} onChange={onChange} options={options} clearable={clearable} placeholder={placeholder} />
}

export function ItemPicker({ value, onChange, categories }: {
  value: string | null | undefined
  onChange: (v: string) => void
  categories?: ItemCategory[]
}) {
  const { t } = useTranslation()
  const { data } = useItems()
  const options = (data ?? [])
    .filter((i) => (i.is_active || i.id === value) && (!categories || categories.includes(i.category)))
    .map((i) => ({ value: i.id, label: nameOf(i), hint: t(`category.${i.category}`), search: `${i.name} ${i.code ?? ''}` }))
  return <Combobox value={value} onChange={onChange} options={options} />
}

export function WarehouseSelect({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const { t } = useTranslation()
  const { data } = useWarehouses()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll ? <option value="">{t('common.all')}</option> : <option value="">{t('common.select')}</option>}
      {(data ?? [])
        .filter((w) => w.is_active || w.id === value)
        .map((w) => (
          <option key={w.id} value={w.id}>
            {nameOf(w)}
          </option>
        ))}
    </Select>
  )
}

export function AccountSelect({ value, onChange, filter, placeholder }: {
  value: string | null | undefined
  onChange: (v: string) => void
  filter: (a: Account) => boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const { data } = useAccounts()
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? t('common.select')}</option>
      {(data ?? [])
        .filter((a) => (a.is_active || a.id === value) && filter(a))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {nameOf(a)}
          </option>
        ))}
    </Select>
  )
}

export const isMoneyAccount = (a: Account) => a.subtype === 'CASH' || a.subtype === 'BANK'
export const isExpenseHead = (a: Account) => a.type === 'EXPENSE' && a.subtype === 'EXPENSE'

// Lots with stock left, for picking a specific lot instead of oldest-first
export function useOpenLots(itemId?: string, warehouseId?: string) {
  return useData<Lot[]>(
    ['lots', 'open', itemId, warehouseId],
    () => {
      let q = supabase.from('v_lots').select('*').gt('remaining_kg', 0.0005).order('received_date')
      if (itemId) q = q.eq('item_id', itemId)
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      return q
    },
    { enabled: Boolean(itemId) },
  )
}

export function LotPicker({ itemId, warehouseId, value, onChange }: {
  itemId?: string
  warehouseId?: string
  value: string | null | undefined
  onChange: (v: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { data } = useOpenLots(itemId, warehouseId)
  const options = [
    { value: '', label: t('stock.fifo') },
    ...(data ?? []).map((l) => {
      const from = lotOrigin(l, i18n.language === 'bn')
      return {
        value: l.id,
        // the supplier (or batch) is part of the label so a lot can be picked by who it was bought from
        label: `${l.lot_no}${from ? ` · ${from}` : ''} · ${kg(l.remaining_kg)}`,
        hint: `${l.warehouse_name} · ${money(l.unit_cost)}/${t('unit.kg')}`,
        search: `${l.lot_no} ${l.supplier_name ?? ''} ${l.supplier_name_bn ?? ''} ${l.origin_no ?? ''}`,
      }
    }),
  ]
  return <Combobox value={value ?? ''} onChange={onChange} options={options} disabled={!itemId} />
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="date-range flex w-full items-center gap-2 sm:w-auto">
      <Input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label={t('common.from')} />
      <span className="text-slate-400">–</span>
      <Input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label={t('common.to')} />
    </div>
  )
}

export function PrintButton() {
  const { t } = useTranslation()
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" />
      {t('common.print')}
    </Button>
  )
}

export const qtyHint = (kgValue: unknown, bagsValue: unknown) => `${qty(bagsValue)} ${i18n.t('unit.bags')} · ${kg(kgValue)}`
