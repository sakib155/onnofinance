import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

// One item line as a stacked card, used by the line editors below the md breakpoint
// where the wide line tables would need sideways scrolling.
export function LineCard({ item, extra, children, amount, onRemove }: {
  item: ReactNode
  extra?: ReactNode
  children: ReactNode
  amount: ReactNode
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">{t('common.item')}</span>
        {item}
      </div>
      {extra}
      <div className="grid grid-cols-2 gap-3">{children}</div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <div className="text-sm">
          <span className="text-slate-500">{t('common.amount')}: </span>
          <span className="num font-medium">{amount}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t('common.remove')}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// A labelled cell in a LineCard's grid
export function LineCardField({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </div>
  )
}
