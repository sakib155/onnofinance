import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '@/features/setup/company'
import { useData } from '@/lib/data'
import { supabase } from '@/lib/supabase'

// A4 at 96 dpi. PDFs are made from these exact pixel sizes, one PDF page per .doc-page.
export const A4 = { width: 794, height: 1123 }

// Name of the person who created a record (documents store only their user id)
export function useUserName(id: string | null | undefined) {
  const { data } = useData<{ full_name: string; email: string | null }>(
    ['user-name', id],
    () => supabase.from('profiles').select('full_name, email').eq('id', id!).single(),
    { enabled: Boolean(id), staleTime: 10 * 60_000 },
  )
  return data ? data.full_name || data.email || '' : ''
}

// Company name, address and contact, or the header image if one is set
function CompanyHeader() {
  const { i18n } = useTranslation()
  const { data: c } = useCompany()
  if (c?.header_image_url) return <img src={c.header_image_url} alt="" className="mb-4 w-full" crossOrigin="anonymous" />
  const name = i18n.language === 'bn' && c?.name_bn ? c.name_bn : c?.name
  return (
    <div className="mb-4 border-b-2 border-brand-800 pb-3">
      <div className="text-2xl font-bold text-brand-900">{name}</div>
      <div className="text-xs text-slate-600">{[c?.address, c?.phone, c?.email].filter(Boolean).join(' · ')}</div>
    </div>
  )
}

// One A4 page. The footer is pushed to the bottom of the page however short the content is.
export function DocPage({ title, meta, children, footer, page, compactHeader }: {
  title: ReactNode
  meta?: ReactNode
  children: ReactNode
  footer?: ReactNode
  page?: { n: number; of: number }
  compactHeader?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className="doc-page print-area mx-auto flex flex-col bg-white p-10 text-[13px] text-slate-800 shadow-sm print:shadow-none"
      style={{ width: A4.width, minHeight: A4.height }}
    >
      {!compactHeader && <CompanyHeader />}
      <div className={clsx('mb-4 flex items-start justify-between gap-4', compactHeader && 'border-b border-slate-300 pb-2')}>
        <div className="text-lg font-bold tracking-wide">{title}</div>
        {meta && <div className="text-right text-xs">{meta}</div>}
      </div>
      <div className="flex-1">{children}</div>
      <div className="mt-8">
        {footer}
        {page && page.of > 1 && (
          <div className="mt-3 text-center text-[11px] text-slate-500">{t('doc.page', { n: page.n, of: page.of })}</div>
        )}
      </div>
    </div>
  )
}

// Bottom of every document: who created it and when, then signature lines (Approved by is always there)
export function SignatureFooter({ createdBy, createdAt, signers = [] }: {
  createdBy?: string
  createdAt?: string | null
  signers?: string[]
}) {
  const { t, i18n } = useTranslation()
  const when = createdAt
    ? new Intl.DateTimeFormat(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(createdAt))
    : ''
  const lines = [...signers, t('doc.createdBy'), t('doc.approvedBy')]
  return (
    <div className="border-t border-slate-200 pt-3">
      {createdBy && (
        <div className="mb-10 text-[11px] text-slate-500">
          {t('doc.createdByLine', { name: createdBy, when })}
        </div>
      )}
      <div className="grid gap-6 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${lines.length}, minmax(0, 1fr))` }}>
        {lines.map((l, i) => (
          <div key={l} className="border-t border-slate-400 pt-1">
            {l}
            {i === lines.length - 2 && createdBy && <div className="mt-0.5 font-medium text-slate-700">{createdBy}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// Small two-column total row used at the end of document tables
export function DocRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-slate-300 pt-1 font-semibold' : 'flex justify-between'}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

// Bordered table cells for documents
export const th = 'border border-slate-200 bg-slate-100 px-2 py-1.5 text-left font-semibold'
export const td = 'border border-slate-200 px-2 py-1.5'
