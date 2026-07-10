import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Trash2, X, ArrowUpRight, ArrowDownLeft, Coins, CreditCard, DollarSign } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

const OwnerEquity = () => {
    const { profile } = useAuth();
    const isAccountsOrAdmin = ['ADMIN', 'ACCOUNTS'].includes(profile?.role);

    // State lists
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Form data state
    const [formData, setFormData] = useState({
        transaction_date: new Date().toISOString().split('T')[0],
        transaction_type: 'INVESTMENT', // INVESTMENT, DRAWING
        amount: '',
        payment_method: 'Cash',
        note: ''
    });

    // Summary stats
    const [stats, setStats] = useState({
        totalInvestments: 0,
        totalDrawings: 0,
        netEquity: 0
    });

    useEffect(() => {
        fetchTransactions();
    }, []);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('owner_transactions')
                .select('*')
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setTransactions(data);
                calculateStats(data);
            }
        } catch (error) {
            console.error('Error fetching owner transactions:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (list) => {
        const investments = list
            .filter(t => t.transaction_type === 'INVESTMENT')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        const drawings = list
            .filter(t => t.transaction_type === 'DRAWING')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        setStats({
            totalInvestments: investments,
            totalDrawings: drawings,
            netEquity: investments - drawings
        });
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenModal = () => {
        setFormData({
            transaction_date: new Date().toISOString().split('T')[0],
            transaction_type: 'INVESTMENT',
            amount: '',
            payment_method: 'Cash',
            note: ''
        });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const amt = parseFloat(formData.amount);
        if (!amt || amt <= 0) return alert('Please enter a valid amount.');

        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('owner_transactions')
                .insert([{
                    transaction_date: formData.transaction_date,
                    transaction_type: formData.transaction_type,
                    amount: amt,
                    payment_method: formData.payment_method,
                    note: formData.note,
                    created_by: profile?.id
                }]);

            if (error) throw error;

            alert('Owner transaction successfully logged.');
            setIsModalOpen(false);
            fetchTransactions();
        } catch (error) {
            console.error('Error saving transaction:', error);
            alert('Failed to save transaction: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this transaction record? This action cannot be undone.')) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('owner_transactions')
                .delete()
                .eq('id', id);

            if (error) throw error;
            alert('Transaction deleted.');
            fetchTransactions();
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Failed to delete transaction: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredTransactions = transactions.filter(t => {
        const matchesSearch = !searchTerm || (t.note && t.note.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = typeFilter === 'ALL' || t.transaction_type === typeFilter;
        return matchesSearch && matchesType;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Owner's Equity & Capital Ledger</h1>
                    <p className="text-muted">Record capital investments (credit) and personal drawings/withdrawals (debit) separately.</p>
                </div>
                {isAccountsOrAdmin && (
                    <button className="btn btn-primary" onClick={handleOpenModal} style={{ gap: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        <Plus size={18} /> Record Owner Cash Flow
                    </button>
                )}
            </header>

            {/* Stats Cards Section */}
            <section className="stats-grid mb-6">
                {/* Total Capital / Investment (Credit) */}
                <div className="stat-card glass-panel card-emerald" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><ArrowUpRight size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">৳ {stats.totalInvestments.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        <div className="stat-label">Total Capital Invested (Credit)</div>
                    </div>
                </div>

                {/* Total Drawings (Debit) */}
                <div className="stat-card glass-panel card-amber" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><ArrowDownLeft size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">৳ {stats.totalDrawings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        <div className="stat-label">Total Owner Drawings (Debit)</div>
                    </div>
                </div>

                {/* Net Balance / Net Equity */}
                <div className="stat-card glass-panel card-blue" style={{ padding: '1.25rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}><Coins size={20} /></div>
                    <div className="stat-info">
                        <div className="stat-value">৳ {stats.netEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        <div className="stat-label">Net Owner Equity Balance</div>
                    </div>
                </div>
            </section>

            {/* Filter controls */}
            <section className="glass-panel mb-6" style={{ padding: '1.25rem' }}>
                <div className="form-grid-3" style={{ alignItems: 'flex-end', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Search Notes</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', top: '10px', left: '10px', color: 'var(--color-text-muted)' }} />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search note..."
                                style={{ paddingLeft: '2.2rem', fontSize: '0.85rem', height: '38px' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Transaction Type</label>
                        <select className="form-input" style={{ fontSize: '0.85rem', height: '38px' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                            <option value="ALL">All Transactions</option>
                            <option value="INVESTMENT">Capital Investments (Credit)</option>
                            <option value="DRAWING">Owner Drawings (Debit)</option>
                        </select>
                    </div>
                    <div>
                        <button className="btn btn-secondary w-full" style={{ height: '38px', fontSize: '0.85rem' }} onClick={() => { setSearchTerm(''); setTypeFilter('ALL'); }}>
                            Clear
                        </button>
                    </div>
                </div>
            </section>

            {/* Transaction List Table */}
            <section className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Method</th>
                                <th>Description / Note</th>
                                <th className="text-right">Amount</th>
                                {isAccountsOrAdmin && <th className="text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.map(t => (
                                <tr key={t.id}>
                                    <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                                    <td>
                                        <span className="status-badge" style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '600',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: t.transaction_type === 'INVESTMENT' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: t.transaction_type === 'INVESTMENT' ? '#10b981' : '#ef4444',
                                            border: t.transaction_type === 'INVESTMENT' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                                        }}>
                                            {t.transaction_type === 'INVESTMENT' ? 'Capital Investment' : 'Owner Drawing'}
                                        </span>
                                    </td>
                                    <td>{t.payment_method}</td>
                                    <td>{t.note || <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>None</span>}</td>
                                    <td className="text-right font-bold" style={{ color: t.transaction_type === 'INVESTMENT' ? '#10b981' : '#ef4444' }}>
                                        {t.transaction_type === 'INVESTMENT' ? '+' : '-'} ৳ {parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    {isAccountsOrAdmin && (
                                        <td className="text-right">
                                            <button className="btn-icon text-danger" title="Delete record" onClick={() => handleDelete(t.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {filteredTransactions.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No owner transactions recorded. Add an entry to get started!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Modal Form */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '500px', borderRadius: '12px' }}>
                        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Record Owner Cash Flow</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '1.5rem' }}>
                            <form onSubmit={handleSubmit}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Flow Direction *</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div 
                                            onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'INVESTMENT' }))}
                                            style={{ 
                                                padding: '0.75rem', 
                                                borderRadius: '8px', 
                                                border: formData.transaction_type === 'INVESTMENT' ? '2px solid #10b981' : '1px solid #cbd5e1', 
                                                cursor: 'pointer', 
                                                textAlign: 'center',
                                                background: formData.transaction_type === 'INVESTMENT' ? 'rgba(16, 185, 129, 0.05)' : '#fff',
                                                fontWeight: 'bold',
                                                color: formData.transaction_type === 'INVESTMENT' ? '#10b981' : '#64748b'
                                            }}
                                        >
                                            Capital Invested
                                        </div>
                                        <div 
                                            onClick={() => setFormData(prev => ({ ...prev, transaction_type: 'DRAWING' }))}
                                            style={{ 
                                                padding: '0.75rem', 
                                                borderRadius: '8px', 
                                                border: formData.transaction_type === 'DRAWING' ? '2px solid #ef4444' : '1px solid #cbd5e1', 
                                                cursor: 'pointer', 
                                                textAlign: 'center',
                                                background: formData.transaction_type === 'DRAWING' ? 'rgba(239, 68, 68, 0.05)' : '#fff',
                                                fontWeight: 'bold',
                                                color: formData.transaction_type === 'DRAWING' ? '#ef4444' : '#64748b'
                                            }}
                                        >
                                            Drawing (Withdrawal)
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Date *</label>
                                    <input 
                                        type="date" 
                                        className="form-input" 
                                        name="transaction_date" 
                                        value={formData.transaction_date} 
                                        onChange={handleInputChange} 
                                        required 
                                    />
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Amount (৳) *</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        name="amount" 
                                        value={formData.amount} 
                                        onChange={handleInputChange} 
                                        placeholder="e.g. 50000"
                                        required 
                                        min="0.01"
                                        step="0.01"
                                    />
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Payment Method *</label>
                                    <select 
                                        className="form-input" 
                                        name="payment_method" 
                                        value={formData.payment_method} 
                                        onChange={handleInputChange}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="bKash / Nagad MFS">bKash / Nagad MFS</option>
                                    </select>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Internal Notes / Purpose</label>
                                    <textarea 
                                        className="form-input" 
                                        name="note" 
                                        rows="2" 
                                        value={formData.note} 
                                        onChange={handleInputChange}
                                        placeholder="e.g. Injected capital for machinery purchase, Personal cashout"
                                    />
                                </div>

                                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Confirm'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OwnerEquity;
