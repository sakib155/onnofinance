import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/layout'
import { ToastProvider } from '@/components/ui/toast'
import { Login, NotConfigured } from '@/features/auth/Login'
import { isConfigured } from '@/lib/supabase'
import { AuthProvider, useAuth, useCan, type Permission } from './auth'
import { VIEW } from './Layout'
import { Layout } from './Layout'

// Each page is its own download, fetched the first time it is opened
const AccountLedgerPage = lazy(() => import('@/features/accounts/AccountsPage').then((m) => ({ default: m.AccountLedgerPage })))
const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const Dashboard = lazy(() => import('@/features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })))
const ChequesPage = lazy(() => import('@/features/money/ChequesPage').then((m) => ({ default: m.ChequesPage })))
const MoneyPage = lazy(() => import('@/features/money/MoneyPage').then((m) => ({ default: m.MoneyPage })))
const VoucherPage = lazy(() => import('@/features/money/VoucherPage').then((m) => ({ default: m.VoucherPage })))
const PartiesPage = lazy(() => import('@/features/parties/PartiesPage').then((m) => ({ default: m.PartiesPage })))
const PartyLedgerPage = lazy(() => import('@/features/parties/PartyLedgerPage').then((m) => ({ default: m.PartyLedgerPage })))
const BatchForm = lazy(() => import('@/features/production/BatchForm').then((m) => ({ default: m.BatchForm })))
const BatchView = lazy(() => import('@/features/production/BatchView').then((m) => ({ default: m.BatchView })))
const MillPage = lazy(() => import('@/features/production/MillPage').then((m) => ({ default: m.MillPage })))
const ProductionPage = lazy(() => import('@/features/production/ProductionPage').then((m) => ({ default: m.ProductionPage })))
const DuesPage = lazy(() => import('@/features/reports/DuesPage').then((m) => ({ default: m.DuesPage })))
const BalanceSheetPage = lazy(() => import('@/features/reports/FinancialReports').then((m) => ({ default: m.BalanceSheetPage })))
const CashSummaryPage = lazy(() => import('@/features/reports/FinancialReports').then((m) => ({ default: m.CashSummaryPage })))
const ProfitLossPage = lazy(() => import('@/features/reports/FinancialReports').then((m) => ({ default: m.ProfitLossPage })))
const TrialBalancePage = lazy(() => import('@/features/reports/FinancialReports').then((m) => ({ default: m.TrialBalancePage })))
const LotProfitPage = lazy(() => import('@/features/reports/LotProfitPage').then((m) => ({ default: m.LotProfitPage })))
const SupplierYieldPage = lazy(() => import('@/features/reports/SupplierYieldPage').then((m) => ({ default: m.SupplierYieldPage })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const AuditPage = lazy(() => import('@/features/setup/AuditPage').then((m) => ({ default: m.AuditPage })))
const CompanyPage = lazy(() => import('@/features/setup/CompanyPage').then((m) => ({ default: m.CompanyPage })))
const ItemsPage = lazy(() => import('@/features/setup/ItemsPage').then((m) => ({ default: m.ItemsPage })))
const TeamPage = lazy(() => import('@/features/setup/TeamPage').then((m) => ({ default: m.TeamPage })))
const WarehousesPage = lazy(() => import('@/features/setup/WarehousesPage').then((m) => ({ default: m.WarehousesPage })))
const LotsPage = lazy(() => import('@/features/stock/LotsPage').then((m) => ({ default: m.LotsPage })))
const StockMovesPage = lazy(() => import('@/features/stock/StockMovesPage').then((m) => ({ default: m.StockMovesPage })))
const StockPage = lazy(() => import('@/features/stock/StockPage').then((m) => ({ default: m.StockPage })))
const OrderForm = lazy(() => import('@/features/trading/OrdersPage').then((m) => ({ default: m.OrderForm })))
const OrdersPage = lazy(() => import('@/features/trading/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const OrderView = lazy(() => import('@/features/trading/OrdersPage').then((m) => ({ default: m.OrderView })))
const PurchaseForm = lazy(() => import('@/features/trading/PurchaseForm').then((m) => ({ default: m.PurchaseForm })))
const PurchasesPage = lazy(() => import('@/features/trading/PurchasesPage').then((m) => ({ default: m.PurchasesPage })))
const PurchaseView = lazy(() => import('@/features/trading/PurchasesPage').then((m) => ({ default: m.PurchaseView })))
const ReturnsPage = lazy(() => import('@/features/trading/ReturnsPage').then((m) => ({ default: m.ReturnsPage })))
const SaleForm = lazy(() => import('@/features/trading/SaleForm').then((m) => ({ default: m.SaleForm })))
const SalesPage = lazy(() => import('@/features/trading/SalesPage').then((m) => ({ default: m.SalesPage })))
const SaleView = lazy(() => import('@/features/trading/SalesPage').then((m) => ({ default: m.SaleView })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

function Protected({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Loading />
  if (profile.status !== 'ACTIVE') return <AwaitingAccess status={profile.status} />
  return <>{children}</>
}

// Signed in but not approved yet (or blocked): nothing else is reachable
function AwaitingAccess({ status }: { status: 'PENDING' | 'BLOCKED' }) {
  const { t } = useTranslation()
  const { profile, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <img src="/favicon.svg" alt="" className="mx-auto mb-3 size-12" />
        <h1 className="mb-2 text-lg font-semibold text-slate-900">{status === 'PENDING' ? t('auth.pendingTitle') : t('auth.blockedTitle')}</h1>
        <p className="mb-1 text-sm text-slate-600">{status === 'PENDING' ? t('auth.pending') : t('auth.blocked')}</p>
        <p className="mb-5 text-xs text-slate-500">{profile?.email}</p>
        <div className="flex justify-center gap-2">
          {status === 'PENDING' && (
            <Button
              loading={checking}
              onClick={async () => {
                setChecking(true)
                await refreshProfile()
                setChecking(false)
              }}
            >
              {t('auth.checkAgain')}
            </Button>
          )}
          <Button variant="secondary" onClick={signOut}>
            {t('auth.signOut')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// A page opens for anyone holding one of the listed permissions
function Guard({ perm, children }: { perm: Permission | Permission[]; children: ReactNode }) {
  const can = useCan()
  return can(...(Array.isArray(perm) ? perm : [perm])) ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <Protected>
                    <Layout />
                  </Protected>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="purchases" element={<Guard perm={VIEW.purchases}><PurchasesPage /></Guard>} />
                <Route path="purchases/new" element={<Guard perm="purchase"><PurchaseForm /></Guard>} />
                <Route path="purchases/:id" element={<Guard perm={VIEW.purchases}><PurchaseView /></Guard>} />
                <Route path="purchases/:id/edit" element={<Guard perm="purchase"><PurchaseForm /></Guard>} />
                <Route path="orders" element={<Guard perm={VIEW.sales}><OrdersPage /></Guard>} />
                <Route path="orders/new" element={<Guard perm="sale"><OrderForm /></Guard>} />
                <Route path="orders/:id" element={<Guard perm={VIEW.sales}><OrderView /></Guard>} />
                <Route path="orders/:id/edit" element={<Guard perm="sale"><OrderForm /></Guard>} />
                <Route path="sales" element={<Guard perm={VIEW.sales}><SalesPage /></Guard>} />
                <Route path="sales/new" element={<Guard perm="sale"><SaleForm /></Guard>} />
                <Route path="sales/:id" element={<Guard perm={VIEW.sales}><SaleView /></Guard>} />
                <Route path="sales/:id/edit" element={<Guard perm="sale"><SaleForm /></Guard>} />
                <Route path="returns" element={<Guard perm={VIEW.returns}><ReturnsPage /></Guard>} />
                <Route path="mill" element={<Guard perm={VIEW.production}><MillPage /></Guard>} />
                <Route path="production" element={<Guard perm={VIEW.production}><ProductionPage /></Guard>} />
                <Route path="production/new" element={<Guard perm="production"><BatchForm /></Guard>} />
                <Route path="production/:id" element={<Guard perm={VIEW.production}><BatchView /></Guard>} />
                <Route path="production/:id/edit" element={<Guard perm="production"><BatchForm /></Guard>} />
                <Route path="stock" element={<StockPage />} />
                <Route path="stock/lots" element={<LotsPage />} />
                <Route path="stock/moves" element={<StockMovesPage />} />
                <Route path="money" element={<Guard perm={VIEW.money}><MoneyPage /></Guard>} />
                <Route path="money/cheques" element={<Guard perm={VIEW.money}><ChequesPage /></Guard>} />
                <Route path="money/:id" element={<Guard perm={VIEW.money}><VoucherPage /></Guard>} />
                <Route path="accounts" element={<Guard perm={VIEW.money}><AccountsPage /></Guard>} />
                <Route path="accounts/:id" element={<Guard perm="books"><AccountLedgerPage /></Guard>} />
                <Route path="parties" element={<Guard perm={VIEW.parties}><PartiesPage /></Guard>} />
                <Route path="parties/:id" element={<Guard perm={VIEW.parties}><PartyLedgerPage /></Guard>} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="reports/dues" element={<Guard perm="books"><DuesPage /></Guard>} />
                <Route path="reports/cash" element={<Guard perm="books"><CashSummaryPage /></Guard>} />
                <Route path="reports/profit-loss" element={<Guard perm="books"><ProfitLossPage /></Guard>} />
                <Route path="reports/balance-sheet" element={<Guard perm="books"><BalanceSheetPage /></Guard>} />
                <Route path="reports/trial-balance" element={<Guard perm="books"><TrialBalancePage /></Guard>} />
                <Route path="reports/lot-profit" element={<Guard perm="books"><LotProfitPage /></Guard>} />
                <Route path="reports/supplier-yield" element={<Guard perm="books"><SupplierYieldPage /></Guard>} />
                <Route path="setup/items" element={<ItemsPage />} />
                <Route path="setup/warehouses" element={<WarehousesPage />} />
                <Route path="setup/company" element={<Guard perm="company"><CompanyPage /></Guard>} />
                <Route path="setup/team" element={<Guard perm="team"><TeamPage /></Guard>} />
                <Route path="setup/audit" element={<Guard perm="audit"><AuditPage /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
