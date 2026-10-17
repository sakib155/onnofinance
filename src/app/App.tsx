import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/layout'
import { ToastProvider } from '@/components/ui/toast'
import { AccountLedgerPage, AccountsPage } from '@/features/accounts/AccountsPage'
import { Login, NotConfigured } from '@/features/auth/Login'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ChequesPage } from '@/features/money/ChequesPage'
import { MoneyPage } from '@/features/money/MoneyPage'
import { VoucherPage } from '@/features/money/VoucherPage'
import { PartiesPage } from '@/features/parties/PartiesPage'
import { PartyLedgerPage } from '@/features/parties/PartyLedgerPage'
import { BatchForm } from '@/features/production/BatchForm'
import { BatchView } from '@/features/production/BatchView'
import { ProductionPage } from '@/features/production/ProductionPage'
import { DuesPage } from '@/features/reports/DuesPage'
import { BalanceSheetPage, CashSummaryPage, ProfitLossPage, TrialBalancePage } from '@/features/reports/FinancialReports'
import { LotProfitPage } from '@/features/reports/LotProfitPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AuditPage } from '@/features/setup/AuditPage'
import { CompanyPage } from '@/features/setup/CompanyPage'
import { ItemsPage } from '@/features/setup/ItemsPage'
import { TeamPage } from '@/features/setup/TeamPage'
import { WarehousesPage } from '@/features/setup/WarehousesPage'
import { LotsPage } from '@/features/stock/LotsPage'
import { StockMovesPage } from '@/features/stock/StockMovesPage'
import { StockPage } from '@/features/stock/StockPage'
import { OrderForm, OrdersPage, OrderView } from '@/features/trading/OrdersPage'
import { PurchaseForm } from '@/features/trading/PurchaseForm'
import { PurchasesPage, PurchaseView } from '@/features/trading/PurchasesPage'
import { ReturnsPage } from '@/features/trading/ReturnsPage'
import { SaleForm } from '@/features/trading/SaleForm'
import { SalesPage, SaleView } from '@/features/trading/SalesPage'
import { isConfigured } from '@/lib/supabase'
import { AuthProvider, useAuth, useCan, type Permission } from './auth'
import { VIEW } from './Layout'
import { Layout } from './Layout'

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
