import React, { useState, useEffect } from 'react';
import { Plus, Search, RefreshCw, X, Calendar, Activity, Database } from 'lucide-react';
import { supabase } from '../utils/supabase';

const MillingLogs = () => {
    const [millingLogs, setMillingLogs] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [logData, setLogData] = useState({
        milling_date: new Date().toISOString().split('T')[0],
        paddy_product_id: '',
        paddy_bags_used: '',
        paddy_weight_used: '',
        rice_product_id: '',
        rice_bags_produced: '',
        rice_weight_produced: '',
        byproduct_bran_bags: 0,
        byproduct_husk_bags: 0,
        labor_charge: 0,
        note: ''
    });

    useEffect(() => {
        fetchMillingLogs();
        fetchProducts();
    }, []);

    const fetchMillingLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('milling_logs')
                .select('*, paddy:paddy_product_id(name), rice:rice_product_id(name)')
                .order('milling_date', { ascending: false });

            if (error) throw error;
            if (data) setMillingLogs(data);
        } catch (error) {
            console.error('Error fetching milling logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const { data } = await supabase.from('products').select('id, name, unit');
            if (data) setProducts(data);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setLogData(prev => {
            const updated = { ...prev, [name]: value };
            
            // Auto calculate approximate weight in KG based on standard bags
            if (name === 'paddy_bags_used') {
                const bags = parseInt(value || 0);
                updated.paddy_weight_used = bags * 60; // Standard paddy bag weight is usually 60kg
            }
            if (name === 'rice_bags_produced') {
                const bags = parseInt(value || 0);
                updated.rice_weight_produced = bags * 50; // Standard rice bag weight is 50kg
            }
            return updated;
        });
    };

    const handleOpenModal = () => setIsAddModalOpen(true);
    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setLogData({
            milling_date: new Date().toISOString().split('T')[0],
            paddy_product_id: '',
            paddy_bags_used: '',
            paddy_weight_used: '',
            rice_product_id: '',
            rice_bags_produced: '',
            rice_weight_produced: '',
            byproduct_bran_bags: 0,
            byproduct_husk_bags: 0,
            labor_charge: 0,
            note: ''
        });
    };

    const handleSubmitMilling = async (e) => {
        e.preventDefault();
        if (!logData.paddy_product_id) return alert("Select raw paddy.");
        if (!logData.rice_product_id) return alert("Select output rice variant.");
        if (!logData.paddy_bags_used || logData.paddy_bags_used <= 0) return alert("Enter paddy bags used.");
        if (!logData.rice_bags_produced || logData.rice_bags_produced < 0) return alert("Enter rice bags produced.");

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('milling_logs').insert([{
                milling_date: logData.milling_date,
                paddy_product_id: logData.paddy_product_id,
                paddy_bags_used: parseInt(logData.paddy_bags_used),
                paddy_weight_used: parseFloat(logData.paddy_weight_used || 0),
                rice_product_id: logData.rice_product_id,
                rice_bags_produced: parseInt(logData.rice_bags_produced),
                rice_weight_produced: parseFloat(logData.rice_weight_produced || 0),
                byproduct_bran_bags: parseInt(logData.byproduct_bran_bags || 0),
                byproduct_husk_bags: parseInt(logData.byproduct_husk_bags || 0),
                labor_charge: parseFloat(logData.labor_charge || 0),
                note: logData.note
            }]);

            if (error) throw error;

            alert('Milling production logged. Raw stock deducted & finished stock added successfully!');
            handleCloseModal();
            fetchMillingLogs();
        } catch (error) {
            console.error('Error saving milling log:', error);
            alert('Failed to log milling production: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredLogs = millingLogs.filter(log => {
        const paddyName = log.paddy?.name?.toLowerCase() || '';
        const riceName = log.rice?.name?.toLowerCase() || '';
        const note = log.note?.toLowerCase() || '';
        const query = searchTerm.toLowerCase();
        return paddyName.includes(query) || riceName.includes(query) || note.includes(query);
    });

    // Helper to calculate yield efficiency
    const calculateYield = (riceWt, paddyWt) => {
        if (!paddyWt || paddyWt <= 0) return 0;
        return ((riceWt / paddyWt) * 100).toFixed(1);
    };

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Milling & Processing Logs</h1>
                    <p className="text-muted">Log raw paddy processing and record finished rice yields and byproducts.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}>
                    <Plus size={18} /> Record Milling Run
                </button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search milling runs..."
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
                                <th>Raw Material Used</th>
                                <th>Output Rice Produced</th>
                                <th>Bran / Husk Yield</th>
                                <th>Yield %</th>
                                <th className="text-right">Milling Labor Cost</th>
                                <th>Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => {
                                const yieldPct = calculateYield(log.rice_weight_produced, log.paddy_weight_used);
                                return (
                                    <tr key={log.id}>
                                        <td>{new Date(log.milling_date).toLocaleDateString()}</td>
                                        <td>
                                            <div className="font-medium">{log.paddy?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                {log.paddy_bags_used} Bags ({parseFloat(log.paddy_weight_used).toLocaleString()} kg)
                                            </div>
                                        </td>
                                        <td>
                                            <div className="font-medium text-success">{log.rice?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                {log.rice_bags_produced} Bags ({parseFloat(log.rice_weight_produced).toLocaleString()} kg)
                                            </div>
                                        </td>
                                        <td>
                                            <div>Bran: {log.byproduct_bran_bags} Bags</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Husk: {log.byproduct_husk_bags} Bags</div>
                                        </td>
                                        <td className="font-bold">{yieldPct}%</td>
                                        <td className="font-medium text-right">৳ {parseFloat(log.labor_charge).toLocaleString()}</td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.note || '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No milling operations logged. Log your first run!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Record Milling Run Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
                        <div className="modal-header">
                            <h2>Log Milling Run (Stock Conversion)</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleSubmitMilling}>
                                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>Input (Raw Paddy Used)</h3>
                                <div className="form-grid-3">
                                    <div className="form-group mb-4 col-span-2">
                                        <label className="form-label">Select Paddy Variety *</label>
                                        <select
                                            className="form-input"
                                            name="paddy_product_id"
                                            value={logData.paddy_product_id}
                                            onChange={handleInputChange}
                                            required
                                        >
                                            <option value="">-- Select Paddy --</option>
                                            {products
                                                .filter(p => p.name.toLowerCase().includes('paddy'))
                                                .map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.current_stock})</option>)}
                                            {products.filter(p => p.name.toLowerCase().includes('paddy')).length === 0 &&
                                                products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                            }
                                        </select>
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Milling Date *</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            name="milling_date"
                                            value={logData.milling_date}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Bags Used *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="paddy_bags_used"
                                            value={logData.paddy_bags_used}
                                            onChange={handleInputChange}
                                            required
                                            min="1"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Weight Used (KG)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="paddy_weight_used"
                                            value={logData.paddy_weight_used}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                </div>

                                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-success)', letterSpacing: '0.05em', marginBottom: '1rem', marginTop: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>Output (Rice & By-Products Produced)</h3>
                                <div className="form-grid-3">
                                    <div className="form-group mb-4 col-span-2">
                                        <label className="form-label">Select Output Rice *</label>
                                        <select
                                            className="form-input"
                                            name="rice_product_id"
                                            value={logData.rice_product_id}
                                            onChange={handleInputChange}
                                            required
                                        >
                                            <option value="">-- Select Rice Product --</option>
                                            {products
                                                .filter(p => !p.name.toLowerCase().includes('paddy'))
                                                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            {products.filter(p => !p.name.toLowerCase().includes('paddy')).length === 0 &&
                                                products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                            }
                                        </select>
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Milling Charge (Labor)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="labor_charge"
                                            value={logData.labor_charge || ''}
                                            onChange={handleInputChange}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Rice Bags *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="rice_bags_produced"
                                            value={logData.rice_bags_produced}
                                            onChange={handleInputChange}
                                            required
                                            min="0"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Rice Weight (KG)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="rice_weight_produced"
                                            value={logData.rice_weight_produced}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Bran (Kura) Bags</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="byproduct_bran_bags"
                                            value={logData.byproduct_bran_bags || ''}
                                            onChange={handleInputChange}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Husk (Tush) Bags</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            name="byproduct_husk_bags"
                                            value={logData.byproduct_husk_bags || ''}
                                            onChange={handleInputChange}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>

                                <div className="form-group mb-4">
                                    <label className="form-label">Internal Note</label>
                                    <textarea
                                        className="form-input"
                                        name="note"
                                        rows="2"
                                        value={logData.note}
                                        onChange={handleInputChange}
                                        placeholder="e.g. Yield is good, standard bran weight, high quality output rice."
                                    ></textarea>
                                </div>

                                <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Logging...' : 'Confirm Production'}
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

export default MillingLogs;
