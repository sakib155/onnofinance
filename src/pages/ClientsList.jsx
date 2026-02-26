import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Activity, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import './ClientsList.css';

const ClientsList = () => {
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [newClientData, setNewClientData] = useState({
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        payment_terms_days: 15,
        opening_due: 0
    });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('v_client_due').select('*');
            if (error) throw error;
            if (data) setClients(data);
        } catch (error) {
            console.error('Error fetching clients:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = () => setIsAddModalOpen(true);
    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setNewClientData({
            company_name: '',
            contact_person: '',
            phone: '',
            email: '',
            address: '',
            payment_terms_days: 15,
            opening_due: 0
        });
    };

    const handleAddClient = async (e) => {
        e.preventDefault();
        if (!newClientData.company_name) return alert("Company name is required.");

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('clients').insert([{
                company_name: newClientData.company_name,
                contact_person: newClientData.contact_person,
                phone: newClientData.phone,
                email: newClientData.email,
                address: newClientData.address,
                payment_terms_days: parseInt(newClientData.payment_terms_days) || 15,
                opening_due: parseFloat(newClientData.opening_due) || 0
            }]);

            if (error) throw error;

            alert('Client added successfully.');
            handleCloseModal();
            fetchClients(); // Refresh list

        } catch (error) {
            console.error('Error adding client:', error);
            alert('Failed to add client. Check console for details.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredClients = clients.filter(c => {
        const matchesName = c.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPhone = c.phone?.includes(searchTerm);
        return matchesName || matchesPhone;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Clients</h1>
                    <p className="text-muted">Manage your client ledger and settings.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}>
                    <Plus size={18} /> Add Client
                </button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search clients..."
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
                                <th>Company Name</th>
                                <th>Contact Person</th>
                                <th>Phone</th>
                                <th className="text-right">Current Due</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(client => {
                                return (
                                    <tr key={client.client_id}>
                                        <td className="font-medium">{client.company_name}</td>
                                        <td>{client.contact_person || '-'}</td>
                                        <td>{client.phone || '-'}</td>
                                        <td className="font-medium text-right" style={{ color: parseFloat(client.current_due) > 0 ? 'var(--color-danger)' : 'inherit' }}>
                                            ৳ {parseFloat(client.current_due || 0).toLocaleString()}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <Link to={`/clients/${client.client_id}`} className="btn btn-secondary btn-sm" title="View Ledger">
                                                    <Activity size={14} style={{ marginRight: '4px' }} /> Ledger
                                                </Link>
                                                <button className="btn btn-secondary btn-sm" title="Create Invoice"><FileText size={14} style={{ marginRight: '4px' }} /> Invoice</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredClients.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No clients found matching your search.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Add Client Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add New Client</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleAddClient}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Company Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newClientData.company_name}
                                        onChange={(e) => setNewClientData({ ...newClientData, company_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Contact Person</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={newClientData.contact_person}
                                            onChange={(e) => setNewClientData({ ...newClientData, contact_person: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Phone</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={newClientData.phone}
                                            onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={newClientData.email}
                                            onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Payment Terms (Days)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={newClientData.payment_terms_days}
                                            onChange={(e) => setNewClientData({ ...newClientData, payment_terms_days: e.target.value })}
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Address</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        value={newClientData.address}
                                        onChange={(e) => setNewClientData({ ...newClientData, address: e.target.value })}
                                    ></textarea>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Opening Due (BDT)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={newClientData.opening_due}
                                        onChange={(e) => setNewClientData({ ...newClientData, opening_due: e.target.value })}
                                        step="0.01"
                                    />
                                    <small className="help-text">Any balance owed before using this system.</small>
                                </div>

                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Save Client'}
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

export default ClientsList;
