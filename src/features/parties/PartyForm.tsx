import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form'
import { ErrorBox } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { unwrap, useSave } from '@/lib/data'
import { today } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { PARTY_TYPES, type Party, type PartyType } from '@/lib/types'

const schema = z.object({
  name: z.string().trim().min(1, 'Required'),
  name_bn: z.string().optional(),
  code: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  types: z.array(z.enum(PARTY_TYPES)).min(1, 'Pick at least one'),
  opening_side: z.enum(['RECEIVABLE', 'PAYABLE']),
  opening_amount: z.coerce.number().min(0),
  opening_date: z.string().min(1),
  credit_limit: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

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
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    values: {
      name: party?.name ?? '',
      name_bn: party?.name_bn ?? '',
      code: party?.code ?? '',
      phone: party?.phone ?? '',
      address: party?.address ?? '',
      types: party?.types ?? (defaultType ? [defaultType] : []),
      opening_side: ob < 0 ? 'PAYABLE' : 'RECEIVABLE',
      opening_amount: Math.abs(ob),
      opening_date: party?.opening_date ?? today(),
      credit_limit: party?.credit_limit != null ? String(party.credit_limit) : '',
      notes: party?.notes ?? '',
      is_active: party?.is_active ?? true,
    },
  })
  const { register, handleSubmit, setValue, formState, control } = form
  const types = (useWatch({ control, name: 'types' }) ?? []) as PartyType[]

  const save = useSave(async (v: FormOut) => {
    const row = {
      ...(party?.id ? { id: party.id } : {}),
      name: v.name,
      name_bn: v.name_bn || null,
      code: v.code || null,
      phone: v.phone || null,
      address: v.address || null,
      types: v.types,
      opening_balance: v.opening_side === 'PAYABLE' ? -v.opening_amount : v.opening_amount,
      opening_date: v.opening_date,
      credit_limit: v.credit_limit ? Number(v.credit_limit) : null,
      notes: v.notes || null,
      is_active: v.is_active,
    }
    return unwrap(supabase.from('parties').upsert(row).select('id').single()) as Promise<{ id: string }>
  })

  const submit = handleSubmit(
    (v) =>
      save.mutate(v, {
        onSuccess: (r) => {
          toast(t('common.saved'))
          onSaved?.(r.id)
          onClose()
        },
      }),
    // surface errors on fields that don't show their own message
    (errors) => {
      const [field, err] = Object.entries(errors)[0] ?? []
      if (field) toast(`${field}: ${err?.message ?? ''}`, 'error')
    },
  )

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
          <Button onClick={submit} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.name')} error={formState.errors.name?.message}>
          <Input {...register('name')} autoFocus />
        </Field>
        <Field label={t('common.nameBn')}>
          <Input {...register('name_bn')} />
        </Field>
        <Field label={t('common.phone')}>
          <Input {...register('phone')} inputMode="tel" />
        </Field>
        <Field label={t('common.code')}>
          <Input {...register('code')} />
        </Field>
        <Field label={t('common.address')} className="sm:col-span-2">
          <Input {...register('address')} />
        </Field>
        <Field label={t('parties.types')} error={formState.errors.types?.message} className="sm:col-span-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {PARTY_TYPES.map((pt) => (
              <Checkbox
                key={pt}
                label={t(`partyType.${pt}`)}
                checked={types.includes(pt)}
                onChange={(e) =>
                  setValue('types', e.target.checked ? [...types, pt] : types.filter((x) => x !== pt), { shouldValidate: true })
                }
              />
            ))}
          </div>
        </Field>
        <Field label={t('parties.openingBalance')} hint={t('parties.openingHint')}>
          <div className="flex gap-2">
            <select {...register('opening_side')} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm">
              <option value="RECEIVABLE">{t('balance.receivable')}</option>
              <option value="PAYABLE">{t('balance.payable')}</option>
            </select>
            <Input type="number" step="0.01" min="0" {...register('opening_amount')} />
          </div>
        </Field>
        <Field label={t('parties.openingDate')}>
          <Input type="date" {...register('opening_date')} />
        </Field>
        <Field label={t('parties.creditLimit')}>
          <Input type="number" step="0.01" min="0" {...register('credit_limit')} />
        </Field>
        <Field label={t('common.status')}>
          <div className="pt-2">
            <Checkbox label={t('common.active')} {...register('is_active')} />
          </div>
        </Field>
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea {...register('notes')} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorBox error={save.error} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
