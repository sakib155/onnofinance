import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '@/features/setup/company'

// Company name and address, shown only when printing
export function PrintHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const { i18n } = useTranslation()
  const { data: c } = useCompany()
  return (
    <div className="mb-4 hidden border-b border-slate-300 pb-3 print:block">
      <div className="text-lg font-bold">{i18n.language === 'bn' && c?.name_bn ? c.name_bn : c?.name}</div>
      <div className="text-xs text-slate-600">{[c?.address, c?.phone, c?.email].filter(Boolean).join(' · ')}</div>
      <div className="mt-2 text-base font-semibold">{title}</div>
      {children}
    </div>
  )
}
