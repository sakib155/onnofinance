import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, LogOut, Users, Receipt, CreditCard, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const { signOut, isAdmin } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo d-flex align-items-center gap-2">
          {/* A simple placeholder logo using CSS shapes */}
          <div className="logo-icon">M</div>
          <span className="logo-text">Finance<span className="text-primary">Portal</span></span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
          </li>
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
          {isAdmin && (
            <li className="nav-item mt-auto">
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
