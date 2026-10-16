import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/app/auth'
import { nameOf } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/form'
import { Card, ErrorBox, PageHeader } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { unwrap, useSave, useWarehouses } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import type { Warehouse } from '@/lib/types'

function WarehouseForm({ wh, onClose }: { wh: Warehouse | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({ name: wh?.name ?? '', name_bn: wh?.name_bn ?? '', location: wh?.location ?? '', is_active: wh?.is_active ?? true })
  const save = useSave(() =>
    unwrap(supabase.from('warehouses').upsert({ ...(wh ? { id: wh.id } : {}), ...v, name_bn: v.name_bn || null, location: v.location || null })),
  )
  return (
    <Modal
      open
      onClose={onClose}
      title={wh ? t('warehouses.edit') : t('warehouses.new')}
      size="sm"
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
      <div className="space-y-3">
        <Field label={t('common.name')}>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
        </Field>
        <Field label={t('common.nameBn')}>
          <Input value={v.name_bn} onChange={(e) => setV({ ...v, name_bn: e.target.value })} />
        </Field>
        <Field label={t('warehouses.location')}>
          <Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </Field>
        <Checkbox label={t('common.active')} checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

export function WarehousesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const { data, isLoading } = useWarehouses()
  const [editing, setEditing] = useState<Warehouse | null | undefined>(undefined)
  return (
    <>
      <PageHeader
        title={t('nav.warehouses')}
        subtitle={t('warehouses.subtitle')}
        actions={
          can('editSetup') && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              {t('warehouses.new')}
            </Button>
          )
        }
      />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(w) => w.id}
          onRowClick={can('editSetup') ? setEditing : undefined}
          rowClassName={(w) => (w.is_active ? undefined : 'opacity-50')}
          columns={[
            { key: 'name', header: t('common.name'), cell: (w) => <span className="font-medium">{nameOf(w)}</span> },
            { key: 'loc', header: t('warehouses.location'), cell: (w) => w.location },
          ]}
        />
      </Card>
      {editing !== undefined && <WarehouseForm wh={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
