import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import { PurchaseForm } from '@/features/trading/PurchaseForm'
import { PurchasesPage, PurchaseView } from '@/features/trading/PurchasesPage'
import { ReturnsPage } from '@/features/trading/ReturnsPage'
import { SaleForm } from '@/features/trading/SaleForm'
import { SalesPage, SaleView } from '@/features/trading/SalesPage'
import { isConfigured } from '@/lib/supabase'
import { AuthProvider, useAuth, useCan, type Permission } from './auth'
import { Layout } from './Layout'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

function Protected({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { session, profile, loading, signOut } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (profile && !profile.is_active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-slate-600">{t('auth.blocked')}</p>
        <button className="text-sm text-brand-700 hover:underline" onClick={signOut}>
          {t('auth.signOut')}
        </button>
      </div>
    )
  }
  return <>{children}</>
}

function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const can = useCan()
  return can(perm) ? <>{children}</> : <Navigate to="/" replace />
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
                <Route path="purchases" element={<PurchasesPage />} />
                <Route path="purchases/new" element={<Guard perm="trade"><PurchaseForm /></Guard>} />
                <Route path="purchases/:id" element={<PurchaseView />} />
                <Route path="purchases/:id/edit" element={<Guard perm="trade"><PurchaseForm /></Guard>} />
                <Route path="sales" element={<SalesPage />} />
                <Route path="sales/new" element={<Guard perm="trade"><SaleForm /></Guard>} />
                <Route path="sales/:id" element={<SaleView />} />
                <Route path="sales/:id/edit" element={<Guard perm="trade"><SaleForm /></Guard>} />
                <Route path="returns" element={<ReturnsPage />} />
                <Route path="production" element={<ProductionPage />} />
                <Route path="production/new" element={<Guard perm="trade"><BatchForm /></Guard>} />
                <Route path="production/:id" element={<BatchView />} />
                <Route path="production/:id/edit" element={<Guard perm="trade"><BatchForm /></Guard>} />
                <Route path="stock" element={<StockPage />} />
                <Route path="stock/lots" element={<LotsPage />} />
                <Route path="stock/moves" element={<StockMovesPage />} />
                <Route path="money" element={<MoneyPage />} />
                <Route path="money/cheques" element={<ChequesPage />} />
                <Route path="money/:id" element={<VoucherPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="accounts/:id" element={<Guard perm="books"><AccountLedgerPage /></Guard>} />
                <Route path="parties" element={<PartiesPage />} />
                <Route path="parties/:id" element={<PartyLedgerPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="reports/dues" element={<Guard perm="books"><DuesPage /></Guard>} />
                <Route path="reports/cash" element={<Guard perm="books"><CashSummaryPage /></Guard>} />
                <Route path="reports/profit-loss" element={<Guard perm="books"><ProfitLossPage /></Guard>} />
                <Route path="reports/balance-sheet" element={<Guard perm="books"><BalanceSheetPage /></Guard>} />
                <Route path="reports/trial-balance" element={<Guard perm="books"><TrialBalancePage /></Guard>} />
                <Route path="reports/lot-profit" element={<Guard perm="books"><LotProfitPage /></Guard>} />
                <Route path="setup/items" element={<ItemsPage />} />
                <Route path="setup/warehouses" element={<WarehousesPage />} />
                <Route path="setup/company" element={<CompanyPage />} />
                <Route path="setup/team" element={<Guard perm="admin"><TeamPage /></Guard>} />
                <Route path="setup/audit" element={<Guard perm="admin"><AuditPage /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
