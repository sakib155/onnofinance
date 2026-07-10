import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, User, Tag, PlusCircle, X } from 'lucide-react';
import { supabase } from '../utils/supabase';

const PaddyPurchases = () => {
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [purchaseData, setPurchaseData] = useState({
        supplier_id: '',
        product_id: '',
        purchase_date: new Date().toISOString().split('T')[0],
        bags: '',
        bag_weight: 60, // Standard paddy bag weight is usually 60kg, 75kg, or 84kg
        rate: '',
        rate_type: 'PER_MAUND', // PER_MAUND, PER_KG, PER_BAG
        carrying_cost: 0,
        labor_charge: 0,
        paid_amount: 0,
        note: ''
    });

    const [wizardStep, setWizardStep] = useState(1);
    const [purchaseType, setPurchaseType] = useState('PADDY'); // PADDY or RICE

    const [calculatedBill, setCalculatedBill] = useState({
        totalWeight: 0,
        subtotal: 0,
        totalAmount: 0,
        balanceDue: 0
    });

    useEffect(() => {
        fetchPurchases();
        fetchSuppliers();
        fetchProducts();
    }, []);

    const fetchPurchases = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('paddy_purchases')
                .select('*, suppliers(company_name), products(name)')
                .order('purchase_date', { ascending: false });

            if (error) throw error;
            if (data) setPurchases(data);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const { data } = await supabase.from('suppliers').select('id, company_name');
            if (data) setSuppliers(data);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    };

    const fetchProducts = async () => {
        try {
            const { data } = await supabase.from('products').select('id, name, unit, inventory_type');
            if (data) setProducts(data);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    // Calculate amounts dynamically
    useEffect(() => {
        const bags = parseInt(purchaseData.bags || 0);
        const bagWeight = parseFloat(purchaseData.bag_weight || 0);
        const rate = parseFloat(purchaseData.rate || 0);
        const carrying = parseFloat(purchaseData.carrying_cost || 0);
        const labor = parseFloat(purchaseData.labor_charge || 0);
        const paid = parseFloat(purchaseData.paid_amount || 0);

        const totalWeight = bags * bagWeight;
        let subtotal = 0;

        if (purchaseData.rate_type === 'PER_BAG') {
            subtotal = bags * rate;
        } else if (purchaseData.rate_type === 'PER_MAUND') {
            subtotal = (totalWeight / 40.0) * rate; // 1 Maund = 40 KG in Bangladesh/India
        } else { // PER_KG
            subtotal = totalWeight * rate;
        }

        const totalAmount = subtotal + carrying + labor;
        const balanceDue = Math.max(totalAmount - paid, 0);

        setCalculatedBill({
            totalWeight,
            subtotal,
            totalAmount,
            balanceDue
        });

    }, [purchaseData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setPurchaseData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenModal = () => {
        setWizardStep(1);
        setIsAddModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setWizardStep(1);
        setPurchaseData({
            supplier_id: '',
            product_id: '',
            purchase_date: new Date().toISOString().split('T')[0],
            bags: '',
            bag_weight: 60,
            rate: '',
            rate_type: 'PER_MAUND',
            carrying_cost: 0,
            labor_charge: 0,
            paid_amount: 0,
            note: ''
        });
    };

    const handlePurchaseTypeSelect = (type) => {
        setPurchaseType(type);
        setPurchaseData(prev => ({
            ...prev,
            bag_weight: type === 'PADDY' ? 60 : 50,
            rate_type: type === 'PADDY' ? 'PER_MAUND' : 'PER_BAG',
            product_id: ''
        }));
        setWizardStep(2);
    };

    const handleSubmitPurchase = async (e) => {
        e.preventDefault();
        if (!purchaseData.supplier_id) return alert("Please select a supplier.");
        if (!purchaseData.product_id) return alert("Please select a product.");
        if (!purchaseData.bags || purchaseData.bags <= 0) return alert("Please enter bag count.");
        if (!purchaseData.rate || purchaseData.rate <= 0) return alert("Please enter rate.");

        setIsSubmitting(true);
        try {
            // 1. Insert Paddy Purchase Bill
            const purchasePayload = {
                supplier_id: purchaseData.supplier_id,
                purchase_date: purchaseData.purchase_date,
                product_id: purchaseData.product_id,
                bags: parseInt(purchaseData.bags),
                bag_weight: parseFloat(purchaseData.bag_weight),
                total_weight: calculatedBill.totalWeight,
                rate: parseFloat(purchaseData.rate),
                rate_type: purchaseData.rate_type,
                subtotal: calculatedBill.subtotal,
                carrying_cost: parseFloat(purchaseData.carrying_cost || 0),
                labor_charge: parseFloat(purchaseData.labor_charge || 0),
                total_amount: calculatedBill.totalAmount,
                paid_amount: parseFloat(purchaseData.paid_amount || 0),
                balance_due: calculatedBill.balanceDue,
                note: purchaseData.note
            };

            const { data: bill, error: billError } = await supabase
                .from('paddy_purchases')
                .insert([purchasePayload])
                .select()
                .single();

            if (billError) throw billError;

            // 2. If there was a down payment, record a supplier payment as well to keep balance synced
            if (parseFloat(purchaseData.paid_amount) > 0) {
                const { error: payError } = await supabase.from('supplier_payments').insert([{
                    supplier_id: purchaseData.supplier_id,
                    amount: parseFloat(purchaseData.paid_amount),
                    payment_date: purchaseData.purchase_date,
                    method: 'Cash',
                    note: `Initial downpayment for Paddy Purchase Bill #${bill.id.substring(0,8)}`
                }]);
                if (payError) throw payError;
            }

            alert('Paddy Purchase Bill logged and stock updated successfully!');
            handleCloseModal();
            fetchPurchases();
        } catch (error) {
            console.error('Error saving purchase:', error);
            alert('Failed to save purchase bill: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredPurchases = purchases.filter(p => {
        const supName = p.suppliers?.company_name?.toLowerCase() || '';
        const prodName = p.products?.name?.toLowerCase() || '';
        const note = p.note?.toLowerCase() || '';
        const query = searchTerm.toLowerCase();
        return supName.includes(query) || prodName.includes(query) || note.includes(query);
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Purchases & Procurement</h1>
                    <p className="text-muted">Track paddy and rice purchase logs from suppliers, stokers, or other mills.</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenModal}>
                    <Plus size={18} /> Log Purchase Bill
                </button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search purchases..."
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
                                <th>Supplier</th>
                                <th>Item Purchased</th>
                                <th>Bags / Wt</th>
                                <th>Rate Details</th>
                                <th className="text-right">Total Bill</th>
                                <th className="text-right">Paid</th>
                                <th className="text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases.map(p => (
                                <tr key={p.id}>
                                    <td>{new Date(p.purchase_date).toLocaleDateString()}</td>
                                    <td className="font-medium">{p.suppliers?.company_name}</td>
                                    <td>{p.products?.name}</td>
                                    <td>
                                        <div><b>{p.bags}</b> Bags</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{parseFloat(p.total_weight).toLocaleString()} kg</div>
                                    </td>
                                    <td>
                                        <div>৳ {parseFloat(p.rate).toLocaleString()}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                                            {p.rate_type.replace('PER_', 'Per ').toLowerCase()}
                                        </div>
                                    </td>
                                    <td className="font-medium text-right">৳ {parseFloat(p.total_amount).toLocaleString()}</td>
                                    <td className="text-right text-success">৳ {parseFloat(p.paid_amount).toLocaleString()}</td>
                                    <td className="font-medium text-right text-danger">৳ {parseFloat(p.balance_due).toLocaleString()}</td>
                                </tr>
                            ))}
                            {filteredPurchases.length === 0 && (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No paddy purchase bills recorded.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Log Purchase Bill Modal */}
            {isAddModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '650px', borderRadius: '12px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Log Purchase Bill</h2>
                            <button className="btn-icon" onClick={handleCloseModal}><X size={18} /></button>
                        </div>
                        
                        {/* Step indicators */}
                        <div style={{ display: 'flex', background: '#f8fafc', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f5f9', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: wizardStep === 1 ? 'bold' : 'normal', color: wizardStep === 1 ? 'var(--color-primary)' : '#64748b' }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: wizardStep >= 1 ? 'var(--color-primary)' : '#cbd5e1', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>1</span>
                                Choose Item Type
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: wizardStep === 2 ? 'bold' : 'normal', color: wizardStep === 2 ? 'var(--color-primary)' : '#64748b' }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: wizardStep >= 2 ? 'var(--color-primary)' : '#cbd5e1', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>2</span>
                                Enter Bill Details
                            </div>
                        </div>

                        <div className="modal-body" style={{ padding: '1.5rem' }}>
                            {wizardStep === 1 ? (
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', color: '#0f172a' }}>What are you purchasing today?</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        {/* Paddy purchase card */}
                                        <div 
                                            onClick={() => handlePurchaseTypeSelect('PADDY')}
                                            style={{ 
                                                padding: '1.5rem', 
                                                borderRadius: '8px', 
                                                border: '2px solid #e2e8f0', 
                                                cursor: 'pointer', 
                                                textAlign: 'center',
                                                background: '#fff'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                        >
                                            <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🌾</div>
                                            <h4 style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>Raw Paddy</h4>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                Purchase raw paddy harvests from local farmers or raw suppliers.
                                            </p>
                                        </div>

                                        {/* Rice purchase card */}
                                        <div 
                                            onClick={() => handlePurchaseTypeSelect('RICE')}
                                            style={{ 
                                                padding: '1.5rem', 
                                                borderRadius: '8px', 
                                                border: '2px solid #e2e8f0', 
                                                cursor: 'pointer', 
                                                textAlign: 'center',
                                                background: '#fff'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                                        >
                                            <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🍚</div>
                                            <h4 style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>Processed Rice</h4>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                Purchase finished or semi-finished rice varieties from stokers or other mills.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitPurchase}>
                                    <div className="form-grid-2">
                                        <div className="form-group mb-4">
                                            <label className="form-label">Supplier *</label>
                                            <select
                                                className="form-input"
                                                name="supplier_id"
                                                value={purchaseData.supplier_id}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="">-- Select Supplier --</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Item / Product Purchased *</label>
                                            <select
                                                className="form-input"
                                                name="product_id"
                                                value={purchaseData.product_id}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="">-- Select Product --</option>
                                                {products
                                                    .filter(p => purchaseType === 'PADDY' 
                                                        ? p.name.toLowerCase().includes('paddy')
                                                        : !p.name.toLowerCase().includes('paddy'))
                                                    .map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} ({p.unit})
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Purchase Date *</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                name="purchase_date"
                                                value={purchaseData.purchase_date}
                                                onChange={handleInputChange}
                                                required
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Number of Bags (Basta) *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="bags"
                                                value={purchaseData.bags}
                                                onChange={handleInputChange}
                                                required
                                                min="1"
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Weight per Bag (KG) *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="bag_weight"
                                                value={purchaseData.bag_weight}
                                                onChange={handleInputChange}
                                                required
                                                min="1"
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Rate Type *</label>
                                            <select
                                                className="form-input"
                                                name="rate_type"
                                                value={purchaseData.rate_type}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="PER_BAG">Per Bag</option>
                                                <option value="PER_MAUND">Per Maund (40 kg)</option>
                                                <option value="PER_KG">Per KG</option>
                                            </select>
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Purchase Rate (৳) *</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="rate"
                                                value={purchaseData.rate}
                                                onChange={handleInputChange}
                                                required
                                                step="0.01"
                                                min="0"
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Total Net Weight (KG)</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={`${calculatedBill.totalWeight.toLocaleString()} kg (${(calculatedBill.totalWeight / 40).toFixed(2)} Maunds)`}
                                                readOnly
                                                style={{ backgroundColor: '#f3f4f6' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-grid-3" style={{ borderTop: '1px dashed #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Carrying Cost (Carriage)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="carrying_cost"
                                                value={purchaseData.carrying_cost || ''}
                                                onChange={handleInputChange}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Labor Charge (Unloading)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="labor_charge"
                                                value={purchaseData.labor_charge || ''}
                                                onChange={handleInputChange}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="form-group mb-4">
                                            <label className="form-label">Initial Paid Amount (Cash)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                name="paid_amount"
                                                value={purchaseData.paid_amount || ''}
                                                onChange={handleInputChange}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: 'var(--color-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Subtotal Cost:</span>
                                            <span style={{ fontWeight: '600' }}>৳ {calculatedBill.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>Carriage & Labor:</span>
                                            <span>+ ৳ {(parseFloat(purchaseData.carrying_cost || 0) + parseFloat(purchaseData.labor_charge || 0)).toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d1d5db', paddingTop: '6px', fontSize: '1rem', fontWeight: 'bold' }}>
                                            <span>Total Bill Amount:</span>
                                            <span>৳ {calculatedBill.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', color: 'var(--color-danger)', fontSize: '0.85rem' }}>
                                            <span>Net Account Due:</span>
                                            <span>৳ {calculatedBill.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                    <div className="form-group mb-4">
                                        <label className="form-label">Internal Note</label>
                                        <textarea
                                            className="form-input"
                                            name="note"
                                            rows="2"
                                            value={purchaseData.note}
                                            onChange={handleInputChange}
                                            placeholder="e.g. Purchased high quality moisture verified stock."
                                        ></textarea>
                                    </div>

                                    <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(1)}>Back</button>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
                                            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                                {isSubmitting ? 'Logging...' : 'Confirm Bill'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaddyPurchases;
