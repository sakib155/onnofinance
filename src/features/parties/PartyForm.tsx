import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form'
import { ErrorBox } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { unwrap, useSave } from '@/lib/data'
import { num, today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { PARTY_TYPES, type Party, type PartyType } from '@/lib/types'

export function PartyForm({ party, defaultType, open, onClose, onSaved }: {
  party?: Party | null
  defaultType?: PartyType
  open: boolean
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const ob = Number(party?.opening_balance ?? 0)
  const [v, setV] = useState({
    name: party?.name ?? '',
    name_bn: party?.name_bn ?? '',
    code: party?.code ?? '',
    phone: party?.phone ?? '',
    address: party?.address ?? '',
    types: party?.types ?? (defaultType ? [defaultType] : []),
    opening_side: ob < 0 ? 'PAYABLE' : 'RECEIVABLE',
    opening_amount: ob ? String(Math.abs(ob)) : '',
    opening_date: party?.opening_date ?? today(),
    credit_limit: party?.credit_limit != null ? String(party.credit_limit) : '',
    notes: party?.notes ?? '',
    is_active: party?.is_active ?? true,
  })
  const [tried, setTried] = useState(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))
  const nameError = tried && !v.name.trim() ? t('errors.required', { field: t('common.name') }) : undefined
  const typesError = tried && !v.types.length ? t('errors.required', { field: t('parties.types') }) : undefined
  const amountError = tried && num(v.opening_amount) < 0 ? t('errors.positiveAmount') : undefined

  const save = useSave(async () => {
    const amount = num(v.opening_amount)
    const row = {
      ...(party?.id ? { id: party.id } : {}),
      name: v.name.trim(),
      name_bn: v.name_bn || null,
      code: v.code || null,
      phone: v.phone || null,
      address: v.address || null,
      types: v.types,
      opening_balance: v.opening_side === 'PAYABLE' ? -amount : amount,
      opening_date: v.opening_date,
      credit_limit: v.credit_limit ? Number(v.credit_limit) : null,
      notes: v.notes || null,
      is_active: v.is_active,
    }
    return unwrap(supabase.from('parties').upsert(row).select('id').single()) as Promise<{ id: string }>
  })

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!v.name.trim() || !v.types.length || num(v.opening_amount) < 0) return
    save.mutate(undefined, {
      onSuccess: (r) => {
        toast(t('common.saved'))
        onSaved?.(r.id)
        onClose()
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={party ? t('parties.edit') : t('parties.new')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.name')} error={nameError}>
          <Input value={v.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label={t('common.nameBn')}>
          <Input value={v.name_bn} onChange={set('name_bn')} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={v.phone} onChange={set('phone')} inputMode="tel" />
        </Field>
        <Field label={t('common.code')}>
          <Input value={v.code} onChange={set('code')} />
        </Field>
        <Field label={t('common.address')} className="sm:col-span-2">
          <Input value={v.address} onChange={set('address')} />
        </Field>
        <Field label={t('parties.types')} error={typesError} className="sm:col-span-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {PARTY_TYPES.map((pt) => (
              <Checkbox
                key={pt}
                label={t(`partyType.${pt}`)}
                checked={v.types.includes(pt)}
                onChange={(e) => setV((x) => ({ ...x, types: e.target.checked ? [...x.types, pt] : x.types.filter((y) => y !== pt) }))}
              />
            ))}
          </div>
        </Field>
        <Field label={t('parties.openingBalance')} hint={t('parties.openingHint')} error={amountError}>
          <div className="flex gap-2">
            <select value={v.opening_side} onChange={set('opening_side')} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm">
              <option value="RECEIVABLE">{t('balance.receivable')}</option>
              <option value="PAYABLE">{t('balance.payable')}</option>
            </select>
            <Input type="number" step="0.01" min="0" value={v.opening_amount} onChange={set('opening_amount')} />
          </div>
        </Field>
        <Field label={t('parties.openingDate')}>
          <Input type="date" value={v.opening_date} onChange={set('opening_date')} />
        </Field>
        <Field label={t('parties.creditLimit')}>
          <Input type="number" step="0.01" min="0" value={v.credit_limit} onChange={set('credit_limit')} />
        </Field>
        <Field label={t('common.status')}>
          <div className="pt-2">
            <Checkbox label={t('common.active')} checked={v.is_active} onChange={(e) => setV((x) => ({ ...x, is_active: e.target.checked }))} />
          </div>
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={v.notes} onChange={set('notes')} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
