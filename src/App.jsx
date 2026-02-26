import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import InvoiceGenerator from './pages/InvoiceGenerator';
import ClientsList from './pages/ClientsList';
import ClientLedger from './pages/ClientLedger';
import InvoicesList from './pages/InvoicesList';
import PaymentsList from './pages/PaymentsList';
import Settings from './pages/Settings';
import TeamUsers from './pages/TeamUsers';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/*" element={
            <ProtectedRoute>
              <div className="app-container">
                <Sidebar />
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/clients" element={<ClientsList />} />
                    <Route path="/clients/:id" element={<ClientLedger />} />
                    <Route path="/invoices" element={<InvoicesList />} />
                    <Route path="/payments" element={<PaymentsList />} />
                    <Route path="/invoice-generator" element={<InvoiceGenerator />} />
                    <Route path="/invoice-edit/:id" element={<InvoiceGenerator />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/team" element={<TeamUsers />} />
                    <Route path="*" element={<Dashboard />} />
                  </Routes>
                </main>
              </div>
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
