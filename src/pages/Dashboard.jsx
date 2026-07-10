import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Users, DollarSign, Activity, Wheat, Truck, Landmark, ShoppingBag, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

const StatCard = ({ title, value, icon: Icon, description, onClick }) => (
    <div className="glass-panel stat-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
        <div className="stat-header">
            <div className="stat-icon-wrapper" style={{ backgroundColor: 'var(--color-primary)', padding: '8px', borderRadius: '8px', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={24} />
            </div>
        </div>
        <div className="stat-details" style={{ marginTop: '12px' }}>
            <h3 className="stat-title" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
            <p className="stat-value" style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-text)' }}>{value}</p>
            {description && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{description}</p>}
        </div>
    </div>
);

const Dashboard = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({ 
        salesRevenue: 0, 
        paddyCost: 0, 
        netProfit: 0, 
        receivable: 0, 
        payable: 0,
        paddyStock: 0,
        riceStock: 0
    });
    
    const [recentInvoices, setRecentInvoices] = useState([]);
    const [supplierDues, setSupplierDues] = useState([]);
    const [financialTrend, setFinancialTrend] = useState([]);
    const [inventoryPieData, setInventoryPieData] = useState([]);
    const [loading, setLoading] = useState(true);

    const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Clients Due
            const { data: clientsDueData } = await supabase.from('v_client_due').select('*');
            let totalReceivable = 0;
            if (clientsDueData) {
                totalReceivable = clientsDueData.reduce((sum, c) => sum + parseFloat(c.current_due || 0), 0);
            }

            // 2. Fetch Suppliers Due (We Owe)
            const { data: suppliersDueData } = await supabase.from('v_supplier_due').select('*');
            let totalPayable = 0;
            if (suppliersDueData) {
                totalPayable = suppliersDueData.reduce((sum, s) => sum + parseFloat(s.current_due || 0), 0);
                // Set top 5 supplier dues for the bottom list
                setSupplierDues(
                    suppliersDueData
                        .filter(s => parseFloat(s.current_due) > 0)
                        .sort((a, b) => parseFloat(b.current_due) - parseFloat(a.current_due))
                        .slice(0, 5)
                );
            }

            // 3. Fetch Overdue Invoices
            const { data: overdueData } = await supabase.from('v_overdue_invoices').select('*').limit(5);
            if (overdueData) {
                setRecentInvoices(overdueData);
            }

            // 4. Fetch Inventory Stock Levels
            const { data: products } = await supabase.from('products').select('*');
            let paddyBags = 0;
            let riceBags = 0;
            let pieChartData = [];

            if (products) {
                products.forEach(p => {
                    const stock = parseFloat(p.current_stock || 0);
                    if (p.name.toLowerCase().includes('paddy')) {
                        paddyBags += stock;
                    } else {
                        riceBags += stock;
                    }
                });

                pieChartData = [
                    { name: 'Raw Paddy Stock', value: paddyBags },
                    { name: 'Finished Rice Stock', value: riceBags }
                ];
                setInventoryPieData(pieChartData.filter(item => item.value > 0));
            }

            // 5. Fetch Financial History (last 6 months) for Trend Chart
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const dateStr = sixMonthsAgo.toISOString().split('T')[0];

            // Invoices/Sales Revenue
            const { data: salesData } = await supabase
                .from('invoices')
                .select('invoice_total, invoice_date')
                .eq('status', 'UNPAID') // or any finalized status
                .gte('invoice_date', dateStr);

            // Paddy Purchases (Costs)
            const { data: paddyData } = await supabase
                .from('paddy_purchases')
                .select('total_amount, purchase_date')
                .gte('purchase_date', dateStr);

            // Operational Expenses
            const { data: expensesData } = await supabase
                .from('expenses')
                .select('amount, expense_date')
                .gte('expense_date', dateStr);

            // Group by Month
            const grouped = {};
            let totalSales = 0;
            let totalPaddy = 0;
            let totalExpenses = 0;

            if (salesData) {
                salesData.forEach(s => {
                    const month = s.invoice_date.substring(0, 7);
                    if (!grouped[month]) grouped[month] = { sales: 0, paddy: 0, exp: 0 };
                    grouped[month].sales += parseFloat(s.invoice_total || 0);
                    totalSales += parseFloat(s.invoice_total || 0);
                });
            }

            if (paddyData) {
                paddyData.forEach(p => {
                    const month = p.purchase_date.substring(0, 7);
                    if (!grouped[month]) grouped[month] = { sales: 0, paddy: 0, exp: 0 };
                    grouped[month].paddy += parseFloat(p.total_amount || 0);
                    totalPaddy += parseFloat(p.total_amount || 0);
                });
            }

            if (expensesData) {
                expensesData.forEach(e => {
                    const month = e.expense_date.substring(0, 7);
                    if (!grouped[month]) grouped[month] = { sales: 0, paddy: 0, exp: 0 };
                    grouped[month].exp += parseFloat(e.amount || 0);
                    totalExpenses += parseFloat(e.amount || 0);
                });
            }

            const trend = Object.keys(grouped).sort().map(month => ({
                month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                sales: grouped[month].sales,
                paddyCost: grouped[month].paddy,
                operatingExp: grouped[month].exp,
                profit: grouped[month].sales - grouped[month].paddy - grouped[month].exp
            }));

            setFinancialTrend(trend);

            setStats({
                salesRevenue: totalSales,
                paddyCost: totalPaddy,
                netProfit: totalSales - totalPaddy - totalExpenses,
                receivable: totalReceivable,
                payable: totalPayable,
                paddyStock: paddyBags,
                riceStock: riceBags
            });

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="dashboard-container"><p style={{ padding: '2rem' }}>Loading Rice Mill Dashboard...</p></div>;

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Rice Mill Operations Dashboard</h1>
                <p className="text-muted">Welcome back, {profile?.full_name || 'Admin'}! Manage milling logs, purchases, and client sales invoices.</p>
            </header>

            <section className="stats-grid">
                <StatCard 
                    title="Milling Net Profit" 
                    value={`৳ ${stats.netProfit?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                    icon={DollarSign} 
                    description="Rice Sales - Paddy Purchases - Expenses" 
                    onClick={() => navigate('/production-batches')}
                />
                <StatCard 
                    title="Rice Sales Revenue" 
                    value={`৳ ${stats.salesRevenue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                    icon={TrendingUp} 
                    description="Total sales invoiced" 
                    onClick={() => navigate('/invoices')}
                />
                <StatCard 
                    title="Paddy Purchase Cost" 
                    value={`৳ ${stats.paddyCost?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                    icon={ShoppingBag} 
                    description="Total paddy procured" 
                    onClick={() => navigate('/paddy-purchases')}
                />
                <StatCard 
                    title="Financial Balances" 
                    value={`৳ ${(stats.receivable - stats.payable).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
                    icon={Landmark} 
                    description={`Receivable: ৳${stats.receivable.toLocaleString()} | Payable: ৳${stats.payable.toLocaleString()}`} 
                    onClick={() => navigate('/clients')}
                />
                <StatCard 
                    title="Total Warehouse Stock" 
                    value={`${(stats.paddyStock + stats.riceStock).toLocaleString()} Bags`} 
                    icon={Package} 
                    description={`Raw Paddy: ${stats.paddyStock} | Finished Rice: ${stats.riceStock}`} 
                    onClick={() => navigate('/inventory')}
                />
            </section>

            <section className="charts-grid mt-6" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
                {/* 6-Month Operations Trend */}
                <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                    <div className="section-header" style={{ marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Paddy Cost vs Rice Sales Trend (6 Months)</h2>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, height: '100%', width: '100%' }}>
                        {financialTrend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <BarChart data={financialTrend} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} tickMargin={10} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={(val) => `৳ ${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{ fill: 'var(--color-background-hover)' }} contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} formatter={(value, name) => [`৳ ${value.toLocaleString()}`, name === 'sales' ? 'Rice Sales' : name === 'paddyCost' ? 'Paddy Purchases' : 'Expenses']} />
                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="sales" name="Rice Sales" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                                    <Bar dataKey="paddyCost" name="Paddy Purchases" fill="var(--color-danger)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No historical operations found.</div>
                        )}
                    </div>
                </div>

                {/* Warehouse Stock Breakdown */}
                <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                    <div className="section-header" style={{ marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Warehouse Stock Summary (Bags)</h2>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => navigate('/inventory')}>
                            View Stock
                        </button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, position: 'relative', height: '100%', width: '100%' }}>
                        {inventoryPieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <PieChart>
                                    <Pie
                                        data={inventoryPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {inventoryPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} formatter={(value) => [`${value.toLocaleString()} Bags`, 'Stock']} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No warehouse stock available.</div>
                        )}
                    </div>
                    <div style={{ fontSize: '0.8rem', padding: '10px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', marginTop: '10px', textAlign: 'center' }}>
                        Raw Paddy: <b>{stats.paddyStock.toLocaleString()} Bags</b> | Finished Rice: <b>{stats.riceStock.toLocaleString()} Bags</b>
                    </div>
                </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
                {/* Top Overdue Client Receivables */}
                <div className="glass-panel">
                    <div className="section-header">
                        <h2 style={{ fontSize: '1rem' }}>Top Overdue Client Receivables</h2>
                    </div>
                    <div className="table-container mt-4">
                        <table>
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Due Date</th>
                                    <th className="text-right">Balance Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentInvoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td className="font-medium">{inv.company_name}</td>
                                        <td>{inv.due_date}</td>
                                        <td className="font-medium text-right text-danger">৳ {parseFloat(inv.balance_due).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {recentInvoices.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="text-center" style={{ padding: '1.5rem', color: 'var(--color-text-muted)' }}>No outstanding client balances.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Top Supplier Payables */}
                <div className="glass-panel">
                    <div className="section-header">
                        <h2 style={{ fontSize: '1rem' }}>Top Supplier Payables (Raw Paddy Cost)</h2>
                    </div>
                    <div className="table-container mt-4">
                        <table>
                            <thead>
                                <tr>
                                    <th>Supplier Name</th>
                                    <th>Contact</th>
                                    <th className="text-right">We Owe Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supplierDues.map((sup) => (
                                    <tr key={sup.supplier_id}>
                                        <td className="font-medium">{sup.company_name}</td>
                                        <td>{sup.phone || '-'}</td>
                                        <td className="font-medium text-right text-danger">৳ {parseFloat(sup.current_due).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {supplierDues.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="text-center" style={{ padding: '1.5rem', color: 'var(--color-text-muted)' }}>No outstanding supplier payments.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
