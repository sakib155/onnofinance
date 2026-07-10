import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, LogOut, Users, Receipt, CreditCard, Shield, Package, UserCheck, Truck, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { signOut, isAdmin } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo d-flex align-items-center gap-2">
          <div className="logo-icon">M</div>
          <span className="logo-text">RiceMill<span className="text-primary">Finance</span></span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <div className="sidebar-section-title">Main</div>
          <li className="nav-item">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/inventory" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Package size={20} />
              <span>Inventory</span>
            </NavLink>
          </li>

          <div className="sidebar-section-title">Sales (Revenue)</div>
          <li className="nav-item">
            <NavLink to="/clients" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={20} />
              <span>Clients</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/invoice-generator" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <FileText size={20} />
              <span>New Invoice</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/invoices" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Receipt size={20} />
              <span>Invoices</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/payments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <CreditCard size={20} />
              <span>Payments</span>
            </NavLink>
          </li>

          <div className="sidebar-section-title">Procurement (Cost)</div>
          <li className="nav-item">
            <NavLink to="/suppliers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <UserCheck size={20} />
              <span>Suppliers</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/paddy-purchases" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Truck size={20} />
              <span>Purchases</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/production-batches" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <RefreshCw size={20} />
              <span>Production & Sorting</span>
            </NavLink>
          </li>

          <div className="sidebar-section-title">Expenses</div>
          <li className="nav-item">
            <NavLink to="/expenses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <FileText size={20} />
              <span>Expenses</span>
            </NavLink>
          </li>

          <div className="sidebar-section-title" style={{ marginTop: 'auto' }}>System</div>
          {isAdmin && (
            <li className="nav-item">
              <NavLink to="/team" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Shield size={20} />
                <span>Team Access</span>
              </NavLink>
            </li>
          )}
          <li className="nav-item">
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Settings size={20} />
              <span>Settings</span>
            </NavLink>
          </li>
          <li className="nav-item">
            <button className="nav-link text-danger w-full text-left" onClick={signOut}>
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
