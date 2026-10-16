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
import { unwrap, useItems, useSave } from '@/lib/data'
import { money, num, qty } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ITEM_CATEGORIES, type Item } from '@/lib/types'

const categoryTone = { PADDY: 'amber', RICE: 'green', BYPRODUCT: 'violet', PACKAGING: 'blue', OTHER: 'slate' } as const

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
  })
  const set = (k: keyof typeof v) => (val: string | boolean) => setV((s) => ({ ...s, [k]: val }))
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
        <Field label={t('items.standardPrice')} hint={t('items.standardPriceHint')}>
          <Input type="number" step="0.01" min="0" value={v.standard_price} onChange={(e) => set('standard_price')(e.target.value)} />
        </Field>
        <Field label={t('items.reorderLevel')}>
          <Input type="number" step="1" min="0" value={v.reorder_level_kg} onChange={(e) => set('reorder_level_kg')(e.target.value)} />
        </Field>
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
  const [editing, setEditing] = useState<Item | null | undefined>(undefined)
  return (
    <>
      <PageHeader
        title={t('nav.items')}
        subtitle={t('items.subtitle')}
        actions={
          can('editSetup') && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              {t('items.new')}
            </Button>
          )
        }
      />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(i) => i.id}
          onRowClick={can('editSetup') ? setEditing : undefined}
          rowClassName={(i) => (i.is_active ? undefined : 'opacity-50')}
          columns={[
            { key: 'code', header: t('common.code'), cell: (i) => <span className="text-slate-500">{i.code}</span> },
            { key: 'name', header: t('common.name'), cell: (i) => <span className="font-medium">{nameOf(i)}</span> },
            { key: 'cat', header: t('items.category'), cell: (i) => <Badge tone={categoryTone[i.category]}>{t(`category.${i.category}`)}</Badge> },
            { key: 'bag', header: t('items.bagSize'), align: 'right', cell: (i) => (num(i.default_bag_kg) ? `${qty(i.default_bag_kg)} ${t('unit.kg')}` : '—') },
            { key: 'price', header: t('items.standardPrice'), align: 'right', cell: (i) => money(i.standard_price) },
          ]}
        />
      </Card>
      {editing !== undefined && <ItemForm item={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
