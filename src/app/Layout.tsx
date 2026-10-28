import clsx from 'clsx'
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
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
import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Loading } from '@/components/ui/layout'
import { setLanguage } from '@/i18n'
import { useAuth, useCan, type Permission } from './auth'

type NavItem = { to: string; label: string; icon: LucideIcon; perm?: Permission[] }

// Who can open each area: anyone who works in it, plus anyone who reads the books
export const VIEW = {
  purchases: ['purchase', 'books'],
  sales: ['sale', 'books'],
  returns: ['purchaseReturn', 'saleReturn', 'books'],
  production: ['production', 'books'],
  money: ['money', 'books'],
  parties: ['parties', 'books'],
} satisfies Record<string, Permission[]>
type NavGroup = { label: string; items: NavItem[] }

const nav: NavGroup[] = [
  { label: '', items: [{ to: '/', label: 'nav.dashboard', icon: LayoutDashboard }] },
  {
    label: 'nav.trading',
    items: [
      { to: '/purchases', label: 'nav.purchases', icon: ArrowDownToLine, perm: VIEW.purchases },
      { to: '/orders', label: 'nav.orders', icon: ClipboardList, perm: VIEW.sales },
      { to: '/sales', label: 'nav.sales', icon: ShoppingCart, perm: VIEW.sales },
      { to: '/returns', label: 'nav.returns', icon: Undo2, perm: VIEW.returns },
    ],
  },
  {
    label: 'nav.mill',
    items: [
      { to: '/mill', label: 'nav.millFloor', icon: Activity, perm: VIEW.production },
      { to: '/production', label: 'nav.production', icon: Factory, perm: VIEW.production },
    ],
  },
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
      { to: '/money', label: 'nav.transactions', icon: Banknote, perm: VIEW.money },
      { to: '/money/cheques', label: 'nav.cheques', icon: Receipt, perm: VIEW.money },
      { to: '/accounts', label: 'nav.accounts', icon: Landmark, perm: VIEW.money },
    ],
  },
  { label: 'nav.people', items: [{ to: '/parties', label: 'nav.parties', icon: UsersRound, perm: VIEW.parties }] },
  {
    label: 'nav.reports',
    items: [
      { to: '/reports', label: 'nav.allReports', icon: BarChart3 },
      { to: '/reports/dues', label: 'nav.dues', icon: FileText, perm: ['books'] },
      { to: '/reports/profit-loss', label: 'nav.profitLoss', icon: BookOpen, perm: ['books'] },
    ],
  },
  {
    label: 'nav.setup',
    items: [
      { to: '/setup/items', label: 'nav.items', icon: Package },
      { to: '/setup/warehouses', label: 'nav.warehouses', icon: Warehouse },
      { to: '/setup/company', label: 'nav.company', icon: Building2, perm: ['company'] },
      { to: '/setup/team', label: 'nav.team', icon: Users, perm: ['team'] },
      { to: '/setup/audit', label: 'nav.audit', icon: History, perm: ['audit'] },
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
        const items = g.items.filter((i) => !i.perm || can(...i.perm))
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

// On a phone the busiest pages sit in a bar at the bottom; the rest are in the menu
const phoneBar: NavItem[] = [
  { to: '/', label: 'nav.home', icon: LayoutDashboard },
  { to: '/sales', label: 'nav.sales', icon: ShoppingCart, perm: VIEW.sales },
  { to: '/purchases', label: 'nav.purchases', icon: ArrowDownToLine, perm: VIEW.purchases },
  { to: '/mill', label: 'nav.mill', icon: Activity, perm: VIEW.production },
]

function PhoneBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-tight'
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {phoneBar
        .filter((i) => !i.perm || can(...i.perm))
        .map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            className={({ isActive }) => clsx(item, isActive ? 'font-semibold text-brand-700' : 'text-slate-500')}
          >
            <i.icon className="size-5" />
            {t(i.label)}
          </NavLink>
        ))}
      <button className={clsx(item, 'text-slate-500')} onClick={onMenu}>
        <Menu className="size-5" />
        {t('nav.more')}
      </button>
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
        <Link to="/" className="flex items-center gap-2 lg:hidden">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-sm font-bold text-brand-900">{t('app.name')}</span>
        </Link>
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
      <main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <PhoneBar onMenu={() => setOpen(true)} />
    </div>
  )
}

