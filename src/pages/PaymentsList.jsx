import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { X } from 'lucide-react';
import './PaymentsList.css';

const PaymentsList = () => {
    const [payments, setPayments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeInvoices, setActiveInvoices] = useState([]);
    const [newPaymentData, setNewPaymentData] = useState({
        invoice_id: '',
        amount: '',
        method: 'Cash',
        reference: '',
        note: ''
    });

    useEffect(() => {
        fetchPayments();
    }, []);

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('payments')
                .select(`
                    *,
                    clients ( company_name ),
                    invoices ( invoice_no )
                `)
                .order('payment_date', { ascending: false });

            if (error) throw error;
            if (data) setPayments(data);
        } catch (error) {
            console.error('Error fetching payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchActiveInvoices = async () => {
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select('id, invoice_no, balance_due, clients ( id, company_name )')
                .in('status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
                .order('invoice_no', { ascending: false });

            if (error) throw error;
            if (data) setActiveInvoices(data);
        } catch (error) {
            console.error('Error fetching active invoices:', error);
        }
    };

    const handleOpenModal = () => {
        fetchActiveInvoices();
        setIsAddModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setNewPaymentData({
            invoice_id: '',
            amount: '',
            method: 'Cash',
            reference: '',
            note: ''
        });
    };

    const handleAddPayment = async (e) => {
        e.preventDefault();
        if (!newPaymentData.invoice_id || !newPaymentData.amount) return alert("Invoice and Amount are required.");

        const selectedInvoice = activeInvoices.find(inv => inv.id === newPaymentData.invoice_id);
        if (!selectedInvoice) return alert("Invalid invoice selected.");
        if (parseFloat(newPaymentData.amount) > parseFloat(selectedInvoice.balance_due)) {
            return alert(`Amount cannot exceed the balance due (৳ ${selectedInvoice.balance_due.toLocaleString()})`);
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('payments').insert([{
                client_id: selectedInvoice.clients.id,
                invoice_id: newPaymentData.invoice_id,
                amount: parseFloat(newPaymentData.amount),
                method: newPaymentData.method,
                reference: newPaymentData.reference,
                note: newPaymentData.note
            }]);

            if (error) throw error;

            alert('Payment recorded successfully.');
            handleCloseModal();
            fetchPayments(); // Refresh list

        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Failed to record payment. Check console for details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredPayments = payments.filter(payment => {
        const clientMatch = payment.clients?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        const invoiceMatch = payment.invoices?.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        return clientMatch || invoiceMatch;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Payments</h1>
                    <p className="text-muted">Record and track all incoming client payments.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}><Plus size={18} /> Record Payment</button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by client or invoice..."
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
                                <th>Client</th>
                                <th>Invoice</th>
                                <th className="text-right">Amount</th>
                                <th>Method</th>
                                <th>Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPayments.map(payment => (
                                <tr key={payment.id}>
                                    <td>{payment.payment_date}</td>
                                    <td className="font-medium">{payment.clients?.company_name}</td>
                                    <td>{payment.invoices?.invoice_no}</td>
                                    <td className="text-right font-medium text-success">৳ {parseFloat(payment.amount || 0).toLocaleString()}</td>
                                    <td>{payment.method}</td>
                                    <td>{payment.reference}</td>
                                </tr>
                            ))}
                            {filteredPayments.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No payments found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Add Payment Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Record Payment</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleAddPayment}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Select Invoice *</label>
                                    <select
                                        className="form-input"
                                        value={newPaymentData.invoice_id}
                                        onChange={(e) => {
                                            const invoiceId = e.target.value;
                                            const selectedInvoice = activeInvoices.find(inv => inv.id === invoiceId);
                                            // Auto-fill amount with balance due
                                            setNewPaymentData({
                                                ...newPaymentData,
                                                invoice_id: invoiceId,
                                                amount: selectedInvoice ? selectedInvoice.balance_due : ''
                                            });
                                        }}
                                        required
                                    >
                                        <option value="">-- Choose an open invoice --</option>
                                        {activeInvoices.map(inv => (
                                            <option key={inv.id} value={inv.id}>
                                                {inv.invoice_no} ({inv.clients.company_name}) - Due: ৳ {parseFloat(inv.balance_due).toLocaleString()}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Amount Received (৳) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={newPaymentData.amount}
                                            onChange={(e) => setNewPaymentData({ ...newPaymentData, amount: e.target.value })}
                                            step="0.01"
                                            min="0.01"
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Payment Method *</label>
                                        <select
                                            className="form-input"
                                            value={newPaymentData.method}
                                            onChange={(e) => setNewPaymentData({ ...newPaymentData, method: e.target.value })}
                                            required
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Mobile Banking (bKash/Nagad)">Mobile Banking</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Transaction Reference</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. TRN-123456 or Cheque No"
                                        value={newPaymentData.reference}
                                        onChange={(e) => setNewPaymentData({ ...newPaymentData, reference: e.target.value })}
                                    />
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Internal Note</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        placeholder="Optional..."
                                        value={newPaymentData.note}
                                        onChange={(e) => setNewPaymentData({ ...newPaymentData, note: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Record Payment'}
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

export default PaymentsList;
