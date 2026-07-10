import React, { useState, useEffect } from 'react';
import { Plus, Search, Activity, X, Edit, Trash2, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';

const SuppliersList = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedPaymentSupplier, setSelectedPaymentSupplier] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [paymentData, setPaymentData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        method: 'Cash',
        reference: '',
        note: ''
    });

    const [newSupplierData, setNewSupplierData] = useState({
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        opening_due: 0
    });

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('v_supplier_due').select('*');
            if (error) throw error;
            if (data) setSuppliers(data);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = () => setIsAddModalOpen(true);
    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setEditingSupplierId(null);
        setNewSupplierData({
            company_name: '',
            contact_person: '',
            phone: '',
            email: '',
            address: '',
            opening_due: 0
        });
    };

    const handleEditClick = async (supplierId) => {
        try {
            const { data, error } = await supabase.from('suppliers').select('*').eq('id', supplierId).single();
            if (error) throw error;
            setNewSupplierData({
                company_name: data.company_name || '',
                contact_person: data.contact_person || '',
                phone: data.phone || '',
                email: data.email || '',
                address: data.address || '',
                opening_due: data.opening_due || 0
            });
            setEditingSupplierId(supplierId);
            setIsAddModalOpen(true);
        } catch (error) {
            console.error('Error fetching supplier details:', error);
            alert('Failed to fetch supplier details.');
        }
    };

    const handleDeleteSupplier = async (supplierId) => {
        if (!window.confirm("Are you sure you want to delete this supplier? This action cannot be undone and will fail if they have associated purchases or payments.")) return;
        
        try {
            const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
            if (error) throw error;
            
            alert('Supplier deleted successfully.');
            fetchSuppliers();
        } catch (error) {
            console.error('Error deleting supplier:', error);
            if (error.code === '23503') {
                alert('Cannot delete this supplier because they have associated paddy purchases or payment logs.');
            } else {
                alert('Failed to delete supplier.');
            }
        }
    };

    const handleAddSupplier = async (e) => {
        e.preventDefault();
        if (!newSupplierData.company_name) return alert("Company name is required.");

        setIsSubmitting(true);
        try {
            if (editingSupplierId) {
                const { error } = await supabase.from('suppliers').update({
                    company_name: newSupplierData.company_name,
                    contact_person: newSupplierData.contact_person,
                    phone: newSupplierData.phone,
                    email: newSupplierData.email,
                    address: newSupplierData.address,
                    opening_due: parseFloat(newSupplierData.opening_due) || 0
                }).eq('id', editingSupplierId);
                if (error) throw error;
                alert('Supplier updated successfully.');
            } else {
                const { error } = await supabase.from('suppliers').insert([{
                    company_name: newSupplierData.company_name,
                    contact_person: newSupplierData.contact_person,
                    phone: newSupplierData.phone,
                    email: newSupplierData.email,
                    address: newSupplierData.address,
                    opening_due: parseFloat(newSupplierData.opening_due) || 0
                }]);
                if (error) throw error;
                alert('Supplier added successfully.');
            }

            handleCloseModal();
            fetchSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            alert('Failed to save supplier. Check console for details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenPaymentModal = (supplier) => {
        setSelectedPaymentSupplier(supplier);
        setPaymentData({
            amount: '',
            date: new Date().toISOString().split('T')[0],
            method: 'Cash',
            reference: '',
            note: ''
        });
        setIsPaymentModalOpen(true);
    };

    const handleClosePaymentModal = () => {
        setIsPaymentModalOpen(false);
        setSelectedPaymentSupplier(null);
    };

    const handleSendPayment = async (e) => {
        e.preventDefault();
        const amt = parseFloat(paymentData.amount);
        if (!amt || amt <= 0) return alert("Please enter a valid amount greater than 0.");

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('supplier_payments').insert([{
                supplier_id: selectedPaymentSupplier.supplier_id,
                amount: amt,
                payment_date: paymentData.date,
                method: paymentData.method,
                reference: paymentData.reference,
                note: paymentData.note
            }]);

            if (error) throw error;

            alert('Payment recorded successfully!');
            handleClosePaymentModal();
            fetchSuppliers();
        } catch (error) {
            console.error('Error logging payment:', error);
            alert('Failed to log payment. Please check database permissions.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSuppliers = suppliers.filter(s => {
        const matchesName = s.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPhone = s.phone?.includes(searchTerm);
        return matchesName || matchesPhone;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Paddy Suppliers</h1>
                    <p className="text-muted">Manage paddy brokers, farms, and raw material supplier accounts.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}>
                    <Plus size={18} /> Add Supplier
                </button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search suppliers..."
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
                                <th>Supplier Name</th>
                                <th>Contact Person</th>
                                <th>Phone</th>
                                <th className="text-right">Outstandings (We Owe)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSuppliers.map(sup => {
                                return (
                                    <tr key={sup.supplier_id}>
                                        <td className="font-medium">{sup.company_name}</td>
                                        <td>{sup.contact_person || '-'}</td>
                                        <td>{sup.phone || '-'}</td>
                                        <td className="font-medium text-right" style={{ color: parseFloat(sup.current_due) > 0 ? 'var(--color-danger)' : 'inherit' }}>
                                            ৳ {parseFloat(sup.current_due || 0).toLocaleString()}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <Link to={`/suppliers/${sup.supplier_id}`} className="btn btn-secondary btn-sm" title="View Ledger">
                                                    <Activity size={14} style={{ marginRight: '4px' }} /> Ledger
                                                </Link>
                                                <button className="btn btn-primary btn-sm" title="Record Payment" onClick={() => handleOpenPaymentModal(sup)}>
                                                    Record Payment
                                                </button>
                                                <button className="btn-icon" title="Edit Supplier" onClick={() => handleEditClick(sup.supplier_id)}>
                                                    <Edit size={16} />
                                                </button>
                                                <button className="btn-icon text-danger" title="Delete Supplier" onClick={() => handleDeleteSupplier(sup.supplier_id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredSuppliers.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No suppliers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Add/Edit Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingSupplierId ? 'Edit Supplier' : 'Add New Supplier'}</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleAddSupplier}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Supplier Company / Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newSupplierData.company_name}
                                        onChange={(e) => setNewSupplierData({ ...newSupplierData, company_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Contact Person</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={newSupplierData.contact_person}
                                            onChange={(e) => setNewSupplierData({ ...newSupplierData, contact_person: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={newSupplierData.phone}
                                            onChange={(e) => setNewSupplierData({ ...newSupplierData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={newSupplierData.email}
                                            onChange={(e) => setNewSupplierData({ ...newSupplierData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Opening Balance We Owe (BDT)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={newSupplierData.opening_due}
                                            onChange={(e) => setNewSupplierData({ ...newSupplierData, opening_due: e.target.value })}
                                            step="0.01"
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Address</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        value={newSupplierData.address}
                                        onChange={(e) => setNewSupplierData({ ...newSupplierData, address: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Save Supplier'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Record Payment Modal */}
            {isPaymentModalOpen && selectedPaymentSupplier && (
                <div className="modal-overlay" onClick={handleClosePaymentModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Log Supplier Payment</h2>
                            <button className="btn-icon" onClick={handleClosePaymentModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleSendPayment}>
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ margin: 0, fontWeight: '500' }}>Supplier: {selectedPaymentSupplier.company_name}</p>
                                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
                                        Outstanding Due: <strong>৳ {parseFloat(selectedPaymentSupplier.current_due || 0).toLocaleString()}</strong>
                                    </p>
                                </div>

                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Payment Amount (BDT) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={paymentData.amount}
                                            onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                                            step="0.01"
                                            min="0.01"
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Payment Date *</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={paymentData.date}
                                            onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Payment Method *</label>
                                        <select
                                            className="form-input"
                                            value={paymentData.method}
                                            onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
                                            required
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Bkash/Nagad">Mobile Banking (MFS)</option>
                                        </select>
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Reference ID (Txn/Cheque No)</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={paymentData.reference}
                                            onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Payment Note</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        value={paymentData.note}
                                        onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleClosePaymentModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Recording...' : 'Record Payment'}
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

export default SuppliersList;
