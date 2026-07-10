import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, History, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const InventoryList = () => {
    const { profile } = useAuth();
    const isAccountsOrAdmin = ['ADMIN', 'ACCOUNTS'].includes(profile?.role);
    
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [productData, setProductData] = useState({
        name: '',
        sku: '',
        unit: 'Bag (50kg)',
        unit_price: '',
        cost_price: '',
        inventory_type: 'FINISHED_GOOD'
    });

    const [stockData, setStockData] = useState({
        change_amount: '',
        transaction_type: 'PURCHASE', // PURCHASE, SALE, ADJUSTMENT
        note: ''
    });

    const units = ['Bag (50kg)', 'Bag (25kg)', 'KG', 'Metric Ton (MT)'];

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            if (data) setProducts(data);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenProductModal = (prod = null) => {
        if (prod) {
            setSelectedProduct(prod);
            setProductData({
                name: prod.name,
                sku: prod.sku || '',
                unit: prod.unit,
                unit_price: prod.unit_price,
                cost_price: prod.cost_price,
                inventory_type: prod.inventory_type || 'FINISHED_GOOD'
            });
        } else {
            setSelectedProduct(null);
            setProductData({
                name: '',
                sku: '',
                unit: 'Bag (50kg)',
                unit_price: '',
                cost_price: '',
                inventory_type: 'FINISHED_GOOD'
            });
        }
        setIsProductModalOpen(true);
    };

    const handleCloseProductModal = () => {
        setIsProductModalOpen(false);
    };

    const handleOpenStockModal = (prod, defaultType = 'PURCHASE') => {
        setSelectedProduct(prod);
        setStockData({
            change_amount: '',
            transaction_type: defaultType,
            note: ''
        });
        setIsStockModalOpen(true);
    };

    const handleCloseStockModal = () => {
        setIsStockModalOpen(false);
    };

    const handleSaveProduct = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = {
                name: productData.name,
                sku: productData.sku,
                unit: productData.unit,
                unit_price: parseFloat(productData.unit_price || 0),
                cost_price: parseFloat(productData.cost_price || 0),
                inventory_type: productData.inventory_type
            };

            if (selectedProduct) {
                // Update
                payload.updated_at = new Date().toISOString();
                const { error } = await supabase.from('products').update(payload).eq('id', selectedProduct.id);
                if (error) throw error;
            } else {
                // Insert
                payload.created_by = profile.id;
                const { error } = await supabase.from('products').insert([payload]);
                if (error) throw error;
            }
            
            handleCloseProductModal();
            fetchProducts();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Failed to save product: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveStock = async (e) => {
        e.preventDefault();
        const amount = parseFloat(stockData.change_amount);
        if (!amount || amount <= 0) return alert("Amount must be greater than 0");

        setIsSubmitting(true);
        try {
            // Calculate new stock
            let newStock = parseFloat(selectedProduct.current_stock || 0);
            const isDeduct = ['SALE', 'DEDUCT', 'LOSS', 'ERROR'].includes(stockData.transaction_type);
            
            if (isDeduct) {
                newStock -= amount;
            } else {
                newStock += amount;
            }

            // 1. Update product stock
            const { error: prodErr } = await supabase
                .from('products')
                .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                .eq('id', selectedProduct.id);

            if (prodErr) throw prodErr;

            // 2. Log transaction
            const formattedNote = ['LOSS', 'ERROR'].includes(stockData.transaction_type) 
                ? `[${stockData.transaction_type}] ${stockData.note || ''}`.trim() 
                : stockData.note;

            const { error: logErr } = await supabase.from('stock_transactions').insert([{
                product_id: selectedProduct.id,
                change_amount: isDeduct ? -amount : amount,
                transaction_type: ['DEDUCT', 'LOSS', 'ERROR'].includes(stockData.transaction_type) ? 'ADJUSTMENT' : stockData.transaction_type,
                note: formattedNote,
                created_by: profile.id
            }]);

            if (logErr) throw logErr;

            handleCloseStockModal();
            fetchProducts();
        } catch (error) {
            console.error('Error updating stock:', error);
            alert('Failed to update stock: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredProducts = products.filter(p => {
        return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
               (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Inventory & Products</h1>
                    <p className="text-muted">Manage your Rice catalog and track live warehouse stock levels.</p>
                </div>
                {isAccountsOrAdmin && (
                    <button className="btn btn-primary" onClick={() => handleOpenProductModal()}>
                        <Plus size={18} /> Add Product
                    </button>
                )}
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search rice variants or SKU..."
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
                                <th>Product Name</th>
                                <th>Type</th>
                                <th>Unit</th>
                                <th>Current Stock</th>
                                <th className="text-right">Selling Rate</th>
                                <th className="text-right">Cost / Owner Price</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map(prod => (
                                <tr key={prod.id}>
                                    <td className="font-medium">
                                        {prod.name}
                                        {prod.sku && <div style={{fontSize: '0.75rem', color:'var(--color-text-muted)'}}>SKU: {prod.sku}</div>}
                                    </td>
                                    <td>
                                        <span className="status-badge" style={{
                                            textTransform: 'capitalize',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: prod.inventory_type === 'RAW_MATERIAL' ? 'rgba(59, 130, 246, 0.1)' :
                                                        prod.inventory_type === 'SEMI_FINISHED' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            color: prod.inventory_type === 'RAW_MATERIAL' ? '#3b82f6' :
                                                   prod.inventory_type === 'SEMI_FINISHED' ? '#f59e0b' : '#10b981',
                                            border: prod.inventory_type === 'RAW_MATERIAL' ? '1px solid rgba(59, 130, 246, 0.2)' :
                                                    prod.inventory_type === 'SEMI_FINISHED' ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                                        }}>
                                            {prod.inventory_type ? prod.inventory_type.replace('_', ' ').toLowerCase() : 'finished good'}
                                        </span>
                                    </td>
                                    <td><span className="status-badge" style={{background:'#f3f4f6',color:'#4b5563'}}>{prod.unit}</span></td>
                                    <td>
                                        <div style={{
                                            fontWeight: 600, 
                                            color: prod.current_stock <= 0 ? 'var(--color-danger)' : 'var(--color-text)'
                                        }}>
                                            {prod.current_stock}
                                        </div>
                                    </td>
                                    <td className="text-right">৳ {parseFloat(prod.unit_price).toLocaleString()}</td>
                                    <td className="text-right text-muted">৳ {parseFloat(prod.cost_price).toLocaleString()}</td>
                                    <td className="text-right">
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button className="btn-icon text-success" title="Add Stock (Purchase)" onClick={() => handleOpenStockModal(prod, 'PURCHASE')}>
                                                <ArrowUpCircle size={16} />
                                            </button>
                                            <button className="btn-icon text-danger" title="Deduct Stock (Wastage / Loss / Error)" onClick={() => handleOpenStockModal(prod, 'DEDUCT')}>
                                                <ArrowDownCircle size={16} />
                                            </button>
                                            {isAccountsOrAdmin && (
                                                <button className="btn-icon" title="Edit Product" onClick={() => handleOpenProductModal(prod)}>
                                                    <Edit2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredProducts.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No products found. Add your first rice variant!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* PRODUCT MODAL */}
            {isProductModalOpen && (
                <div className="modal-overlay" onClick={handleCloseProductModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedProduct ? 'Edit Product' : 'Add New Product'}</h2>
                            <button className="btn-icon" onClick={handleCloseProductModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleSaveProduct}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Product Name / Variant *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={productData.name}
                                        onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                                        placeholder="e.g. Miniket Premium"
                                        required
                                    />
                                </div>
                                <div className="form-grid-3">
                                    <div className="form-group mb-4">
                                        <label className="form-label">SKU / Code</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={productData.sku}
                                            onChange={(e) => setProductData({ ...productData, sku: e.target.value })}
                                            placeholder="MK-01"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Inventory Type *</label>
                                        <select
                                            className="form-input"
                                            value={productData.inventory_type}
                                            onChange={(e) => setProductData({ ...productData, inventory_type: e.target.value })}
                                            required
                                        >
                                            <option value="RAW_MATERIAL">Raw Material</option>
                                            <option value="SEMI_FINISHED">Semi-Finished</option>
                                            <option value="FINISHED_GOOD">Finished Good</option>
                                        </select>
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Unit of Measure *</label>
                                        <select
                                            className="form-input"
                                            value={productData.unit}
                                            onChange={(e) => setProductData({ ...productData, unit: e.target.value })}
                                            required
                                        >
                                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-grid-2">
                                    <div className="form-group mb-4">
                                        <label className="form-label">Default Selling Rate (৳)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={productData.unit_price}
                                            onChange={(e) => setProductData({ ...productData, unit_price: e.target.value })}
                                            step="0.01"
                                        />
                                    </div>
                                    <div className="form-group mb-4">
                                        <label className="form-label">Default Cost / Purchase Rate (৳)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={productData.cost_price}
                                            onChange={(e) => setProductData({ ...productData, cost_price: e.target.value })}
                                            step="0.01"
                                        />
                                    </div>
                                </div>
                                {!selectedProduct && (
                                    <p className="text-muted" style={{fontSize: '0.8rem'}}>
                                        Note: You can add initial stock balances through the Stock Update button after creating the product.
                                    </p>
                                )}
                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseProductModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Saving...' : 'Save Product'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* STOCK MODAL */}
            {isStockModalOpen && selectedProduct && (
                <div className="modal-overlay" onClick={handleCloseStockModal}>
                    <div className="modal-container" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Update Stock: {selectedProduct.name}</h2>
                            <button className="btn-icon" onClick={handleCloseStockModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="info-box mb-4" style={{padding: '1rem', background:'var(--color-background)', borderRadius:'8px', border:'1px solid var(--color-border)'}}>
                                <p><strong>Current Stock:</strong> {selectedProduct.current_stock} {selectedProduct.unit}</p>
                            </div>
                            <form onSubmit={handleSaveStock}>
                                <div className="form-group mb-4">
                                    <label className="form-label">Action *</label>
                                    <select
                                        className="form-input"
                                        value={stockData.transaction_type}
                                        onChange={(e) => setStockData({ ...stockData, transaction_type: e.target.value })}
                                    >
                                        <option value="PURCHASE">Add Stock (Purchase / Received)</option>
                                        <option value="DEDUCT">Deduct Stock (Return / General Adjustment)</option>
                                        <option value="LOSS">Deduct Stock (Loss / Loose / Wastage)</option>
                                        <option value="ERROR">Deduct Stock (Correction / Error)</option>
                                    </select>
                                    {stockData.transaction_type === 'PURCHASE' && (
                                        <p className="text-muted" style={{fontSize:'0.75rem'}}>Add manual procurement. Normal sales automatically deduct stock when finalized.</p>
                                    )}
                                    {['DEDUCT', 'LOSS', 'ERROR'].includes(stockData.transaction_type) && (
                                        <p className="text-muted" style={{fontSize:'0.75rem'}}>This will decrease stock and automatically adjust purchase tracking records.</p>
                                    )}
                                </div>
                                <div className="form-group mb-4">
                                    <label className="form-label">Quantity to Add/Deduct ({selectedProduct.unit}) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={stockData.change_amount}
                                        onChange={(e) => setStockData({ ...stockData, change_amount: e.target.value })}
                                        step="0.001"
                                        min="0.001"
                                        required
                                    />
                                </div>
                                <div className="form-group mb-4">
                                    <label className="form-label">Note / Reference</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={stockData.note}
                                        onChange={(e) => setStockData({ ...stockData, note: e.target.value })}
                                        placeholder="e.g., Bill #992 or Warehouse adjustment"
                                    />
                                </div>
                                <div className="modal-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={handleCloseStockModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Updating...' : 'Confirm Stock'}
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

export default InventoryList;
