import clsx from 'clsx'
import {
  ArrowDownToLine,
  BarChart3,
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  Factory,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  UsersRound,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { setLanguage } from '@/i18n'
import { useAuth, useCan, type Permission } from './auth'

type NavItem = { to: string; label: string; icon: LucideIcon; perm?: Permission }
type NavGroup = { label: string; items: NavItem[] }

const nav: NavGroup[] = [
  { label: '', items: [{ to: '/', label: 'nav.dashboard', icon: LayoutDashboard }] },
  {
    label: 'nav.trading',
    items: [
      { to: '/purchases', label: 'nav.purchases', icon: ArrowDownToLine },
      { to: '/sales', label: 'nav.sales', icon: ShoppingCart },
      { to: '/returns', label: 'nav.returns', icon: Undo2 },
    ],
  },
  { label: 'nav.mill', items: [{ to: '/production', label: 'nav.production', icon: Factory }] },
  {
    label: 'nav.stock',
    items: [
      { to: '/stock', label: 'nav.stockSummary', icon: Boxes },
      { to: '/stock/lots', label: 'nav.lots', icon: Package },
      { to: '/stock/moves', label: 'nav.stockMoves', icon: Truck },
    ],
  },
  {
    label: 'nav.money',
    items: [
      { to: '/money', label: 'nav.transactions', icon: Banknote },
      { to: '/money/cheques', label: 'nav.cheques', icon: Receipt },
      { to: '/accounts', label: 'nav.accounts', icon: Landmark },
    ],
  },
  { label: 'nav.people', items: [{ to: '/parties', label: 'nav.parties', icon: UsersRound }] },
  {
    label: 'nav.reports',
    items: [
      { to: '/reports', label: 'nav.allReports', icon: BarChart3 },
      { to: '/reports/dues', label: 'nav.dues', icon: FileText, perm: 'books' },
      { to: '/reports/profit-loss', label: 'nav.profitLoss', icon: BookOpen, perm: 'books' },
    ],
  },
  {
    label: 'nav.setup',
    items: [
      { to: '/setup/items', label: 'nav.items', icon: Package },
      { to: '/setup/warehouses', label: 'nav.warehouses', icon: Warehouse },
      { to: '/setup/company', label: 'nav.company', icon: Building2 },
      { to: '/setup/team', label: 'nav.team', icon: Users, perm: 'admin' },
      { to: '/setup/audit', label: 'nav.audit', icon: History, perm: 'admin' },
    ],
  },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  return (
    <nav className="flex h-full flex-col overflow-y-auto px-3 py-4">
      <div className="mb-5 flex items-center gap-2 px-2">
        <img src="/favicon.svg" alt="" className="size-8" />
        <div>
          <div className="text-sm font-bold text-white">{t('app.name')}</div>
          <div className="text-[11px] text-brand-200">{t('app.tagline')}</div>
        </div>
      </div>
      {nav.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm))
        if (!items.length) return null
        return (
          <div key={g.label || 'home'} className="mb-3">
            {g.label && <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-brand-300 uppercase">{t(g.label)}</div>}
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/' || i.to === '/stock' || i.to === '/money' || i.to === '/reports'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                    isActive ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <i.icon className="size-4 shrink-0" />
                {t(i.label)}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

export function Layout() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 bg-brand-900 lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-brand-900">
            <button className="absolute top-3 right-3 text-brand-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
        <button className="text-slate-600 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <div className="flex-1" />
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(['en', 'bn'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={clsx('rounded-md px-2 py-1', i18n.language === l ? 'bg-brand-700 text-white' : 'text-slate-600')}
            >
              {l === 'en' ? 'EN' : 'বাংলা'}
            </button>
          ))}
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-800">{profile?.full_name || profile?.email}</div>
          <div className="text-xs text-slate-500">{profile && t(`role.${profile.role}`)}</div>
        </div>
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={signOut} title={t('auth.signOut')}>
          <LogOut className="size-4" />
        </button>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}

