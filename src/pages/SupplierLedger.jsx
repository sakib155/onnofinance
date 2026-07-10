import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CreditCard, DollarSign, Calendar, MapPin, User, Mail, Phone, TrendingUp, ShoppingBag } from 'lucide-react';
import { supabase } from '../utils/supabase';

const SupplierLedger = () => {
    const { id } = useParams();
    const [supplier, setSupplier] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [purchasesList, setPurchasesList] = useState([]);
    const [paymentsList, setPaymentsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ledger'); // ledger, purchases, payments

    useEffect(() => {
        fetchLedgerData();
    }, [id]);

    const fetchLedgerData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Supplier Details
            const { data: supplierData, error: supplierErr } = await supabase
                .from('suppliers')
                .select('*')
                .eq('id', id)
                .single();
            if (supplierErr) throw supplierErr;

            // Fetch current due from v_supplier_due
            const { data: dueData } = await supabase
                .from('v_supplier_due')
                .select('current_due')
                .eq('supplier_id', id)
                .single();

            // 2. Fetch Paddy Purchases
            const { data: purchases, error: purchErr } = await supabase
                .from('paddy_purchases')
                .select('id, purchase_date, total_amount, bags, product_id, products(name)')
                .eq('supplier_id', id)
                .order('purchase_date', { ascending: false });
            if (purchErr) throw purchErr;
            setPurchasesList(purchases || []);

            // 3. Fetch Payments
            const { data: payments, error: payErr } = await supabase
                .from('supplier_payments')
                .select('id, payment_date, amount, method, reference, note')
                .eq('supplier_id', id)
                .order('payment_date', { ascending: false });
            if (payErr) throw payErr;
            setPaymentsList(payments || []);

            // Compute summary metrics
            const openingBalance = parseFloat(supplierData.opening_balance || 0);
            const totalProcured = purchases.reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0);
            const totalPaid = payments.reduce((sum, pay) => sum + parseFloat(pay.amount || 0), 0);
            const currentDue = dueData?.current_due || (openingBalance + totalProcured - totalPaid);

            setSupplier({
                ...supplierData,
                total_procured: totalProcured,
                total_paid: totalPaid,
                current_due: currentDue
            });

            // 4. Merge & Sort Chronologically
            const entries = [];
            purchases.forEach(p => {
                entries.push({
                    type: 'PURCHASE',
                    id: p.id,
                    date: new Date(p.purchase_date),
                    displayDate: p.purchase_date,
                    ref: `Bill #${p.id.substring(0, 8)}`,
                    debit: parseFloat(p.total_amount), // We owe more (debit)
                    credit: 0,
                    description: `Paddy/Rice Purchase (${p.bags} Bags of ${p.products?.name || 'Paddy'})`
                });
            });

            payments.forEach(pay => {
                entries.push({
                    type: 'PAYMENT',
                    id: pay.id,
                    date: new Date(pay.payment_date),
                    displayDate: pay.payment_date,
                    ref: pay.reference || 'N/A',
                    debit: 0,
                    credit: parseFloat(pay.amount), // We paid (credit)
                    description: `Payment Made (${pay.method})`
                });
            });

            entries.sort((a, b) => a.date - b.date);

            // 5. Calculate Running Balance
            let runningBalance = openingBalance;
            const finalizedLedger = entries.map(entry => {
                runningBalance = runningBalance + entry.debit - entry.credit;
                return { ...entry, balance: runningBalance };
            });

            // Prepend Opening Balance
            finalizedLedger.unshift({
                type: 'OPENING',
                displayDate: '-',
                ref: '-',
                debit: openingBalance > 0 ? openingBalance : 0,
                credit: 0,
                description: 'Opening Balance',
                balance: openingBalance
            });

            setLedger(finalizedLedger);

        } catch (error) {
            console.error('Error fetching supplier ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="dashboard-container"><div style={{ padding: '2rem' }}>Loading Supplier Profile...</div></div>;
    if (!supplier) return <div className="dashboard-container"><div style={{ padding: '2rem' }}>Supplier not found.</div></div>;

    const settlementRate = supplier.total_procured > 0 
        ? ((supplier.total_paid / (supplier.total_procured + parseFloat(supplier.opening_balance))) * 100).toFixed(1)
        : (supplier.total_paid > 0 ? '100' : '0.0');

    return (
        <div className="dashboard-container">
            {/* Back link */}
            <div style={{ marginBottom: '1rem' }}>
                <Link to="/suppliers" className="text-muted" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', gap: '4px', fontSize: '0.9rem' }}>
                    <ArrowLeft size={16} /> Back to Suppliers List
                </Link>
            </div>

            {/* Profile Header Block */}
            <section className="glass-panel mb-6" style={{ padding: '1.5rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1.5rem', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 'bold' }}>
                        {supplier.company_name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 4px 0', color: '#0f172a' }}>{supplier.company_name}</h1>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {supplier.contact_person || 'No contact person'}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={14} /> {supplier.phone || 'No phone'}</span>
                            {supplier.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={14} /> {supplier.email}</span>}
                            {supplier.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> {supplier.address}</span>}
                        </div>
                    </div>
                </div>
                
                <div className="glass-panel" style={{ padding: '0.75rem 1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: '180px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>Current Balance Due</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: parseFloat(supplier.current_due) > 0 ? '#ef4444' : '#10b981', marginTop: '4px' }}>
                        ৳ {parseFloat(supplier.current_due).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                        {parseFloat(supplier.current_due) < 0 ? 'Advance Account (Debit)' : 'Payable Account (Credit)'}
                    </div>
                </div>
            </section>

            {/* Profile Statistics row */}
            <section className="stats-grid mb-6">
                <div className="stat-card glass-panel card-blue" style={{ padding: '1rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}><ShoppingBag size={18} /></div>
                    <div className="stat-info">
                        <div className="stat-value">৳ {supplier.total_procured.toLocaleString()}</div>
                        <div className="stat-label">Total Bills Procured</div>
                    </div>
                </div>
                <div className="stat-card glass-panel card-emerald" style={{ padding: '1rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><DollarSign size={18} /></div>
                    <div className="stat-info">
                        <div className="stat-value">৳ {supplier.total_paid.toLocaleString()}</div>
                        <div className="stat-label">Total Payments Settled</div>
                    </div>
                </div>
                <div className="stat-card glass-panel card-amber" style={{ padding: '1rem' }}>
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><TrendingUp size={18} /></div>
                    <div className="stat-info">
                        <div className="stat-value">{settlementRate}%</div>
                        <div className="stat-label">Bills Settlement Rate</div>
                    </div>
                </div>
            </section>

            {/* Profile Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.25rem', gap: '1rem' }}>
                <button 
                    onClick={() => setActiveTab('ledger')}
                    style={{ 
                        padding: '0.75rem 1rem', 
                        fontSize: '0.9rem', 
                        fontWeight: '600', 
                        background: 'none', 
                        border: 'none', 
                        borderBottom: activeTab === 'ledger' ? '3px solid var(--color-primary)' : '3px solid transparent', 
                        color: activeTab === 'ledger' ? 'var(--color-primary)' : '#64748b', 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Ledger Statement
                </button>
                <button 
                    onClick={() => setActiveTab('purchases')}
                    style={{ 
                        padding: '0.75rem 1rem', 
                        fontSize: '0.9rem', 
                        fontWeight: '600', 
                        background: 'none', 
                        border: 'none', 
                        borderBottom: activeTab === 'purchases' ? '3px solid var(--color-primary)' : '3px solid transparent', 
                        color: activeTab === 'purchases' ? 'var(--color-primary)' : '#64748b', 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Purchase Bills ({purchasesList.length})
                </button>
                <button 
                    onClick={() => setActiveTab('payments')}
                    style={{ 
                        padding: '0.75rem 1rem', 
                        fontSize: '0.9rem', 
                        fontWeight: '600', 
                        background: 'none', 
                        border: 'none', 
                        borderBottom: activeTab === 'payments' ? '3px solid var(--color-primary)' : '3px solid transparent', 
                        color: activeTab === 'payments' ? 'var(--color-primary)' : '#64748b', 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Payments Settled ({paymentsList.length})
                </button>
            </div>

            {/* Tab Contents */}
            <section className="glass-panel">
                {activeTab === 'ledger' && (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Reference</th>
                                    <th>Description</th>
                                    <th className="text-right">Debit / Bills (+)</th>
                                    <th className="text-right">Credit / Payments (-)</th>
                                    <th className="text-right">Running Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map((entry, idx) => (
                                    <tr key={idx} style={{ backgroundColor: entry.type === 'OPENING' ? 'rgba(0,0,0,0.01)' : 'transparent' }}>
                                        <td>{entry.displayDate}</td>
                                        <td>
                                            {entry.type === 'PURCHASE' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: '500' }}><ShoppingBag size={14} /> PURCHASE</span>}
                                            {entry.type === 'PAYMENT' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-success)', fontSize: '0.8rem', fontWeight: '500' }}><CreditCard size={14} /> PAYMENT</span>}
                                            {entry.type === 'OPENING' && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>START</span>}
                                        </td>
                                        <td>{entry.ref}</td>
                                        <td>{entry.description}</td>
                                        <td className="text-right font-medium">{entry.debit > 0 ? `৳ ${entry.debit.toLocaleString()}` : '-'}</td>
                                        <td className="text-right font-medium text-success">{entry.credit > 0 ? `৳ ${entry.credit.toLocaleString()}` : '-'}</td>
                                        <td className="text-right font-bold" style={{ color: entry.balance > 0 ? '#ef4444' : '#10b981' }}>
                                            ৳ {entry.balance.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {ledger.length <= 1 && (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No transactions found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'purchases' && (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Bill No</th>
                                    <th>Purchase Date</th>
                                    <th>Item Name</th>
                                    <th>Total Bags</th>
                                    <th className="text-right">Net Bill Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchasesList.map(p => (
                                    <tr key={p.id}>
                                        <td className="font-bold text-primary">Bill #{p.id.substring(0, 8).toUpperCase()}</td>
                                        <td>{new Date(p.purchase_date).toLocaleDateString()}</td>
                                        <td className="font-semibold">{p.products?.name}</td>
                                        <td>{p.bags} bags</td>
                                        <td className="text-right font-bold">৳ {parseFloat(p.total_amount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {purchasesList.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No purchase bills logged.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Payment Date</th>
                                    <th>Method</th>
                                    <th>Reference ID</th>
                                    <th>Description / Note</th>
                                    <th className="text-right">Amount Paid</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paymentsList.map(pay => (
                                    <tr key={pay.id}>
                                        <td>{new Date(pay.payment_date).toLocaleDateString()}</td>
                                        <td className="font-semibold">{pay.method}</td>
                                        <td>{pay.reference || 'N/A'}</td>
                                        <td>{pay.note || <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>None</span>}</td>
                                        <td className="text-right font-bold text-success">৳ {parseFloat(pay.amount).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {paymentsList.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No payments made.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default SupplierLedger;
