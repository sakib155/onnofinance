import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/app/auth'
import { nameOf } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/form'
import { Badge, Card, ErrorBox, PageHeader } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { unwrap, useData, useItems, useSave } from '@/lib/data'
import { date, money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ITEM_CATEGORIES, type Item, type MillSection } from '@/lib/types'

const SECTIONS: MillSection[] = ['DRYER', 'SORTER']
// Only what the mill makes can come out of a section
const MADE_IN_MILL: Item['category'][] = ['UNSORTED', 'RICE', 'BYPRODUCT']

export const categoryTone = { PADDY: 'amber', UNSORTED: 'blue', RICE: 'green', BYPRODUCT: 'violet', PACKAGING: 'slate', OTHER: 'slate' } as const

function ItemForm({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({
    name: item?.name ?? '',
    name_bn: item?.name_bn ?? '',
    code: item?.code ?? '',
    category: item?.category ?? 'RICE',
    default_bag_kg: String(item?.default_bag_kg ?? 50),
    standard_price: String(item?.standard_price ?? 0),
    reorder_level_kg: item?.reorder_level_kg != null ? String(item.reorder_level_kg) : '',
    is_active: item?.is_active ?? true,
    output_of: item?.output_of ?? ([] as MillSection[]),
  })
  const set = (k: keyof typeof v) => (val: string | boolean) => setV((s) => ({ ...s, [k]: val }))
  const toggleSection = (sec: MillSection, on: boolean) =>
    setV((s) => ({ ...s, output_of: on ? [...s.output_of.filter((x) => x !== sec), sec] : s.output_of.filter((x) => x !== sec) }))
  const madeInMill = MADE_IN_MILL.includes(v.category)
  const save = useSave(() =>
    unwrap(
      supabase.from('items').upsert({
        ...(item ? { id: item.id } : {}),
        ...v,
        name_bn: v.name_bn || null,
        code: v.code || null,
        default_bag_kg: num(v.default_bag_kg),
        standard_price: num(v.standard_price),
        reorder_level_kg: v.reorder_level_kg ? num(v.reorder_level_kg) : null,
        output_of: madeInMill ? v.output_of : [],
      }),
    ),
  )
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? t('items.edit') : t('items.new')}
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
        <Field label={t('common.name')}>
          <Input value={v.name} onChange={(e) => set('name')(e.target.value)} autoFocus />
        </Field>
        <Field label={t('common.nameBn')}>
          <Input value={v.name_bn} onChange={(e) => set('name_bn')(e.target.value)} />
        </Field>
        <Field label={t('items.category')}>
          <Select value={v.category} onChange={(e) => set('category')(e.target.value)}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.code')}>
          <Input value={v.code} onChange={(e) => set('code')(e.target.value)} />
        </Field>
        <Field label={t('items.bagSize')}>
          <Input type="number" step="0.001" min="0" value={v.default_bag_kg} onChange={(e) => set('default_bag_kg')(e.target.value)} />
        </Field>
        <Field label={t('items.standardPrice')} hint={num(v.standard_price) > 0 ? `${t('items.per50', { amount: money(num(v.standard_price) * 50) })} · ${t('items.standardPriceHint')}` : t('items.standardPriceHint')}>
          <Input type="number" step="0.01" min="0" value={v.standard_price} onChange={(e) => set('standard_price')(e.target.value)} />
        </Field>
        <Field label={t('items.reorderLevel')}>
          <Input type="number" step="1" min="0" value={v.reorder_level_kg} onChange={(e) => set('reorder_level_kg')(e.target.value)} />
        </Field>
        {madeInMill && (
          <Field label={t('items.outputOf')} hint={t('items.outputOfHint')} className="sm:col-span-2">
            <div className="flex gap-4 pt-1">
              {SECTIONS.map((sec) => (
                <Checkbox key={sec} label={t(`production.section.${sec}`)} checked={v.output_of.includes(sec)} onChange={(e) => toggleSection(sec, e.target.checked)} />
              ))}
            </div>
          </Field>
        )}
        <div className="pt-6">
          <Checkbox label={t('common.active')} checked={v.is_active} onChange={(e) => set('is_active')(e.target.checked)} />
        </div>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
      </div>
    </Modal>
  )
}

export function ItemsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const { data, isLoading } = useItems()
  // when each item's current price was last changed
  const { data: history } = useData<{ item_id: string; changed_at: string }[]>(['price-history'], () =>
    supabase.from('item_price_history').select('item_id, changed_at').order('changed_at', { ascending: false }),
  )
  const lastChanged = (id: string) => history?.find((h) => h.item_id === id)?.changed_at
  const [editing, setEditing] = useState<Item | null | undefined>(undefined)
  const [show, setShow] = useState<'ALL' | MillSection>('ALL')
  const rows = (data ?? []).filter((i) => show === 'ALL' || i.output_of?.includes(show))
  return (
    <>
      <PageHeader
        title={t('nav.items')}
        subtitle={t('items.subtitle')}
        actions={
          can('setup') && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              {t('items.new')}
            </Button>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(['ALL', ...SECTIONS] as const).map((s) => (
              <button key={s} onClick={() => setShow(s)} className={clsx('rounded-md px-3 py-1 whitespace-nowrap', show === s ? 'bg-white font-medium shadow-sm' : 'text-slate-600')}>
                {s === 'ALL' ? t('common.all') : t('items.outOf', { section: t(`production.section.${s}`) })}
              </button>
            ))}
          </div>
          {show !== 'ALL' && <span className="text-xs text-slate-500">{t('items.outOfHint')}</span>}
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(i) => i.id}
          onRowClick={can('setup') ? setEditing : undefined}
          rowClassName={(i) => (i.is_active ? undefined : 'opacity-50')}
          columns={[
            { key: 'code', phone: 'sub', header: t('common.code'), cell: (i) => <span className="text-slate-500">{i.code}</span> },
            { key: 'name', phone: 'title', header: t('common.name'), cell: (i) => <span className="font-medium">{nameOf(i)}</span> },
            { key: 'cat', header: t('items.category'), cell: (i) => <Badge tone={categoryTone[i.category]}>{t(`category.${i.category}`)}</Badge> },
            {
              key: 'out',
              header: t('items.outputOf'),
              cell: (i) => (
                <span className="flex gap-1">
                  {(i.output_of ?? []).map((s) => (
                    <Badge key={s} tone={s === 'DRYER' ? 'amber' : 'violet'}>
                      {t(`production.section.${s}`)}
                    </Badge>
                  ))}
                </span>
              ),
            },
            { key: 'bag', header: t('items.bagSize'), align: 'right', cell: (i) => (num(i.default_bag_kg) ? `${qty(i.default_bag_kg)} ${t('unit.kg')}` : '—') },
            {
              key: 'price',
              phone: 'value',
              header: t('items.standardPrice'),
              align: 'right',
              cell: (i) => (
                <div>
                  {money(i.standard_price)}
                  {i.category === 'BYPRODUCT' && num(i.standard_price) > 0 && <div className="text-xs text-slate-500">{t('items.per50', { amount: money(num(i.standard_price) * 50) })}</div>}
                  {lastChanged(i.id) && <div className="text-xs text-slate-500">{t('items.since', { date: date(lastChanged(i.id)) })}</div>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {editing !== undefined && <ItemForm item={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
