import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, DollarSign, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

const StatCard = ({ title, value, icon: Icon, trend }) => (
    <div className="glass-panel stat-card">
        <div className="stat-header">
            <div className="stat-icon-wrapper">
                <Icon className="stat-icon" size={24} />
            </div>
            <div className={`stat-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
                {trend >= 0 ? '+' : ''}{trend}%
            </div>
        </div>
        <div className="stat-details">
            <h3 className="stat-title">{title}</h3>
            <p className="stat-value">{value}</p>
        </div>
    </div>
);

const Dashboard = () => {
    const { profile } = useAuth();
    const [stats, setStats] = useState({ totalReceivable: 0, overdue: 0, activeClients: 0 });
    const [recentInvoices, setRecentInvoices] = useState([]);
    const [revenueData, setRevenueData] = useState([]);
    const [receivablesData, setReceivablesData] = useState([]);
    const [loading, setLoading] = useState(true);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const { data: clientsDueData } = await supabase.from('v_client_due').select('*');
            let totalReceivable = 0;
            let activeClients = 0;
            let receivablesChart = [];

            if (clientsDueData) {
                totalReceivable = clientsDueData.reduce((sum, c) => sum + parseFloat(c.current_due || 0), 0);
                activeClients = clientsDueData.length;

                // Prepare pie chart data (top 5 clients by due amount)
                receivablesChart = clientsDueData
                    .filter(c => parseFloat(c.current_due) > 0)
                    .sort((a, b) => parseFloat(b.current_due) - parseFloat(a.current_due))
                    .slice(0, 5)
                    .map(c => ({ name: c.company_name, value: parseFloat(c.current_due) }));
            }

            const { data: overdueData } = await supabase.from('v_overdue_invoices').select('*').limit(20);
            let totalOverdueAmount = 0;
            if (overdueData) {
                setRecentInvoices(overdueData);
                totalOverdueAmount = overdueData.reduce((sum, o) => sum + parseFloat(o.balance_due || 0), 0);
            }

            // Fetch payments for revenue trend (simple grouping by month)
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const { data: paymentsData } = await supabase
                .from('payments')
                .select('amount, payment_date')
                .gte('payment_date', sixMonthsAgo.toISOString().split('T')[0]);

            let revTrend = [];
            if (paymentsData) {
                const grouped = {};
                paymentsData.forEach(p => {
                    // Extract YYYY-MM
                    const month = p.payment_date.substring(0, 7);
                    grouped[month] = (grouped[month] || 0) + parseFloat(p.amount);
                });

                // Sort keys and format
                revTrend = Object.keys(grouped).sort().map(month => ({
                    month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                    revenue: grouped[month]
                }));
            }

            setStats({
                totalReceivable,
                overdue: totalOverdueAmount,
                activeClients
            });
            setReceivablesData(receivablesChart);
            setRevenueData(revTrend);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="dashboard-container"><p style={{ padding: '2rem' }}>Loading dashboard...</p></div>;

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <h1>Finance Overview</h1>
                <p className="text-muted">Welcome back, {profile?.full_name || 'Admin'}! Here's your financial summary.</p>
            </header>

            <section className="stats-grid">
                <StatCard title="Total Receivable" value={`৳ ${stats.totalReceivable.toLocaleString()}`} icon={DollarSign} trend={0} />
                <StatCard title="Total Overdue" value={`৳ ${stats.overdue.toLocaleString()}`} icon={TrendingUp} trend={-1} />
                <StatCard title="Total Active Clients" value={stats.activeClients} icon={Users} trend={0} />
            </section>

            <section className="charts-grid mt-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                    <div className="section-header" style={{ marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>6-Month Revenue Trend</h2>
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        {revenueData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={revenueData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} tickMargin={10} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={(val) => `৳ ${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{ fill: 'var(--color-background-hover)' }} contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} formatter={(value) => [`৳ ${value.toLocaleString()}`, 'Revenue']} />
                                    <Bar dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No revenue data available.</div>
                        )}
                    </div>
                </div>

                <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
                    <div className="section-header" style={{ marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Top Receivables (Balance Due)</h2>
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                        {receivablesData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={receivablesData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {receivablesData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} formatter={(value) => [`৳ ${value.toLocaleString()}`, 'Due']} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>All clients are fully paid!</div>
                        )}
                    </div>
                </div>
            </section>

            <section className="recent-invoices glass-panel mt-6">
                <div className="section-header">
                    <h2>Top Overdue Invoices</h2>
                </div>

                <div className="table-container mt-4">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice ID</th>
                                <th>Client</th>
                                <th>Due Date</th>
                                <th>Days Overdue</th>
                                <th className="text-right">Balance Due</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentInvoices.map((inv) => (
                                <tr key={inv.id}>
                                    <td className="font-medium">{inv.invoice_no}</td>
                                    <td>{inv.company_name}</td>
                                    <td>{inv.due_date}</td>
                                    <td className="text-danger font-medium">{inv.days_overdue} days</td>
                                    <td className="font-medium text-right text-danger">৳ {parseFloat(inv.balance_due).toLocaleString()}</td>
                                </tr>
                            ))}
                            {recentInvoices.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="text-center" style={{ padding: '2rem' }}>Great job! No overdue invoices right now.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
