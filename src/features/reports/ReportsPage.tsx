import { BookOpen, Boxes, Factory, FileText, Landmark, PiggyBank, Scale, Wallet, Wheat } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useCan, type Permission } from '@/app/auth'
import { PageHeader } from '@/components/ui/layout'

const reports: { to: string; key: string; icon: typeof BookOpen; perm?: Permission }[] = [
  { to: '/reports/cash', key: 'cashSummary', icon: Wallet, perm: 'books' },
  { to: '/accounts', key: 'cashBankBooks', icon: Landmark, perm: 'books' },
  { to: '/reports/dues', key: 'dues', icon: FileText },
  { to: '/reports/profit-loss', key: 'profitLoss', icon: PiggyBank, perm: 'books' },
  { to: '/reports/balance-sheet', key: 'balanceSheet', icon: Scale, perm: 'books' },
  { to: '/reports/trial-balance', key: 'trialBalance', icon: BookOpen, perm: 'books' },
  { to: '/reports/lot-profit', key: 'lotProfit', icon: Wheat, perm: 'books' },
  { to: '/production', key: 'batchYield', icon: Factory },
  { to: '/stock', key: 'stockSummary', icon: Boxes },
]

export function ReportsPage() {
  const { t } = useTranslation()
  const can = useCan()
  return (
    <>
      <PageHeader title={t('nav.allReports')} subtitle={t('reports.subtitle')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports
          .filter((r) => !r.perm || can(r.perm))
          .map((r) => (
            <Link key={r.to} to={r.to} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-600">
              <r.icon className="mt-0.5 size-5 shrink-0 text-brand-700" />
              <div>
                <div className="font-medium text-slate-900">{t(`reports.${r.key}`)}</div>
                <div className="text-sm text-slate-500">{t(`reports.${r.key}Help`)}</div>
              </div>
            </Link>
          ))}
      </div>
    </>
  )
}
