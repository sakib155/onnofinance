import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/app/auth'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Card, ErrorBox, Loading, PageHeader } from '@/components/ui/layout'
import { useToast } from '@/components/ui/toast'
import { unwrap, useSave } from '@/lib/data'
import { num } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useCompany, type Company } from './company'

export function CompanyPage() {
  const { data } = useCompany()
  return data ? <CompanyForm initial={data} /> : <Loading />
}

function CompanyForm({ initial }: { initial: Company }) {
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const [v, setV] = useState<Company>(initial)
  const save = useSave((c: Company) =>
    unwrap(
      supabase
        .from('company_settings')
        .update({
          name: c.name,
          name_bn: c.name_bn || null,
          address: c.address || null,
          phone: c.phone || null,
          email: c.email || null,
          header_image_url: c.header_image_url || null,
          default_bag_kg: num(c.default_bag_kg),
          invoice_footer: c.invoice_footer || null,
        })
        .eq('id', 1),
    ),
  )
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  const readOnly = !can('admin')

  return (
    <>
      <PageHeader title={t('nav.company')} subtitle={t('company.subtitle')} />
      <Card className="max-w-2xl">
        <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('company.name')}>
            <Input value={v.name} onChange={set('name')} />
          </Field>
          <Field label={t('company.nameBn')}>
            <Input value={v.name_bn ?? ''} onChange={set('name_bn')} />
          </Field>
          <Field label={t('common.address')} className="sm:col-span-2">
            <Input value={v.address ?? ''} onChange={set('address')} />
          </Field>
          <Field label={t('common.phone')}>
            <Input value={v.phone ?? ''} onChange={set('phone')} />
          </Field>
          <Field label={t('company.email')}>
            <Input value={v.email ?? ''} onChange={set('email')} />
          </Field>
          <Field label={t('company.headerImage')} hint={t('company.headerImageHint')} className="sm:col-span-2">
            <Input value={v.header_image_url ?? ''} onChange={set('header_image_url')} />
          </Field>
          <Field label={t('company.defaultBag')}>
            <Input type="number" value={v.default_bag_kg} onChange={set('default_bag_kg')} />
          </Field>
          <Field label={t('company.invoiceFooter')} className="sm:col-span-2">
            <Textarea value={v.invoice_footer ?? ''} onChange={set('invoice_footer')} />
          </Field>
        </fieldset>
        {!readOnly && (
          <div className="mt-4 flex items-center gap-3">
            <Button loading={save.isPending} onClick={() => save.mutate(v, { onSuccess: () => toast(t('common.saved')) })}>
              {t('common.save')}
            </Button>
            <ErrorBox error={save.error} />
          </div>
        )}
      </Card>
    </>
  )
}
