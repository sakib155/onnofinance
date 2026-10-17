import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { friendlyError } from '@/lib/errors'

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className, padded = true }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(padded && 'p-4')}>{children}</div>
    </section>
  )
}

const tones = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-brand-100 text-brand-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800',
  violet: 'bg-violet-100 text-violet-800',
}
export type Tone = keyof typeof tones

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={clsx('mt-1 text-xl font-semibold tabular-nums', tone === 'down' ? 'text-red-600' : 'text-slate-900')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block size-5 animate-spin rounded-full border-2 border-brand-700 border-t-transparent', className)} />
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return <div className="py-12 text-center text-sm text-slate-500">{children ?? t('common.nothing')}</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {friendlyError(error instanceof Error ? error.message : String(error))}
    </div>
  )
}
