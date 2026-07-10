import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ExpensesList = () => {
    const { profile } = useAuth();
    const isAdmin = profile?.role === 'ADMIN';
    const [expenses, setExpenses] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newExpenseData, setNewExpenseData] = useState({
        expense_date: new Date().toISOString().split('T')[0],
        category: 'Rice Purchase (Inventory)',
        amount: '',
        description: '',
        reference: '',
        invoice_id: ''
    });

    const [invoicesList, setInvoicesList] = useState([]);

    const categories = [
        'Rice Purchase (Inventory)', 
        'Transportation / Freight', 
        'Labor / Sorting Cost', 
        'Packaging Material',
        'Office Supplies', 
        'Rent', 
        'Utilities', 
        'Salaries', 
        'Other'
    ];

    useEffect(() => {
        fetchExpenses();
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select('id, invoice_no, clients(company_name)')
                .order('created_at', { ascending: false });
            if (!error && data) setInvoicesList(data);
        } catch (err) {
            console.warn('Could not fetch invoices for the dropdown', err);
        }
    };

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select('*, invoices(invoice_no)')
                .order('expense_date', { ascending: false });

            if (error) throw error;
            if (data) setExpenses(data);
        } catch (error) {
            console.error('Error fetching expenses:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = () => {
        setIsAddModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setNewExpenseData({
            expense_date: new Date().toISOString().split('T')[0],
            category: 'Rice Purchase (Inventory)',
            amount: '',
            description: '',
            reference: '',
            invoice_id: ''
        });
    };

    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!newExpenseData.amount || newExpenseData.amount <= 0) return alert("Amount must be greater than 0.");

        setIsSubmitting(true);
        try {
            const payload = {
                expense_date: newExpenseData.expense_date,
                category: newExpenseData.category,
                amount: parseFloat(newExpenseData.amount),
                description: newExpenseData.description,
                reference: newExpenseData.reference,
                created_by: profile.id
            };
            if (newExpenseData.invoice_id) {
                payload.invoice_id = newExpenseData.invoice_id;
            }

            const { error } = await supabase.from('expenses').insert([payload]);

            if (error) throw error;

            handleCloseModal();
            fetchExpenses(); // Refresh list

        } catch (error) {
            console.error('Error recording expense:', error);
            alert('Failed to record expense: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteExpense = async (id) => {
        if (!window.confirm("Are you sure you want to delete this expense? This action cannot be undone.")) return;
        
        try {
            const { error } = await supabase.from('expenses').delete().eq('id', id);
            if (error) throw error;
            fetchExpenses();
        } catch (err) {
            console.error('Error deleting expense:', err);
            alert('Failed to delete expense.');
        }
    };

    const filteredExpenses = expenses.filter(expense => {
        const catMatch = expense.category?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        const descMatch = expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        const invMatch = expense.invoices?.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        return catMatch || descMatch || invMatch;
    });

    if (loading) return <div className="dashboard-container"><p style={{ padding: '2rem' }}>Loading expenses...</p></div>;

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Company Expenses</h1>
                    <p className="text-muted">Record operational costs and purchases to accurately calculate profit.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}><Plus size={18} /> Record Expense</button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by category, desc or invoice..."
                            style={{ paddingLeft: '2.5rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Linked Invoice</th>
                                <th className="text-right">Amount</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.map(expense => (
                                <tr key={expense.id}>
                                    <td>{expense.expense_date}</td>
                                    <td className="font-medium"><span className="status-badge" style={{backgroundColor: '#f3f4f6', color: '#4b5563', padding: '4px 8px'}}>{expense.category}</span></td>
                                    <td>{expense.description || '-'}</td>
                                    <td>{expense.invoices ? <span style={{color: 'var(--color-primary)', fontWeight: 600}}>{expense.invoices.invoice_no}</span> : '-'}</td>
                                    <td className="text-right font-medium text-danger">৳ {parseFloat(expense.amount || 0).toLocaleString()}</td>
                                    {isAdmin && (
                                        <td>
                                            <button className="btn-icon text-danger" onClick={() => handleDeleteExpense(expense.id)} title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={isAdmin ? "6" : "5"} style={{ textAlign: 'center', padding: '2rem' }}>No expenses found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Add Expense Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Record Expense</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleAddExpense}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Link to Invoice / Trade Deal (Optional)</label>
                                    <select
                                        className="form-input"
                                        value={newExpenseData.invoice_id}
                                        onChange={(e) => setNewExpenseData({ ...newExpenseData, invoice_id: e.target.value })}
                                    >
                                        <option value="">-- No specific invoice (General Expense) --</option>
                                        {invoicesList.map(inv => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.invoice_no} ({inv.clients?.company_name})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-muted" style={{fontSize: '0.75rem', marginTop: '4px'}}>
                                        Select an invoice to count this cost (like Rice Purchase) directly against it for trade profit.
                                    </p>
                                </div>
                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Expense Date *</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={newExpenseData.expense_date}
                                            onChange={(e) => setNewExpenseData({ ...newExpenseData, expense_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Amount (৳) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={newExpenseData.amount}
                                            onChange={(e) => setNewExpenseData({ ...newExpenseData, amount: e.target.value })}
                                            step="0.01"
                                            min="0.01"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Category *</label>
                                    <select
                                        className="form-input"
                                        value={newExpenseData.category}
                                        onChange={(e) => setNewExpenseData({ ...newExpenseData, category: e.target.value })}
                                        required
                                    >
                                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Description / Note</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        placeholder="Specific details about this expense..."
                                        value={newExpenseData.description}
                                        onChange={(e) => setNewExpenseData({ ...newExpenseData, description: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Receipt / Reference No.</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. Inv-9922 or Voucher No"
                                        value={newExpenseData.reference}
                                        onChange={(e) => setNewExpenseData({ ...newExpenseData, reference: e.target.value })}
                                    />
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Record Expense'}
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

export default ExpensesList;
