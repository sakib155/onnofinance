import React, { useState, useEffect, useRef } from 'react';
import { Download, Save, Plus, Trash2, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../utils/supabase';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './InvoiceGenerator.css';
import InvoicePreview from '../components/InvoicePreview';

const initialLineItem = { description: '', bags: 0, bag_weight: 50, rate_type: 'PER_BAG', gross_weight: 0, quantity: 0, rate: 0, amount: 0 };
const initialPayment = { date: new Date().toISOString().split('T')[0], amount: 0 };

const InvoiceGenerator = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const isEditing = !!id;

    const previewRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
    const [clientsList, setClientsList] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [previousDue, setPreviousDue] = useState(0);
    const [recentPayments, setRecentPayments] = useState([]);
    const [productsList, setProductsList] = useState([]);

    const [invoiceData, setInvoiceData] = useState({
        invoiceNo: 'DRAFT',
        invoiceDate: new Date().toISOString().split('T')[0],
        companyName: '',
        phone: '',
        address: '',
        notes: 'Please make payment within the agreed credit period.',
        author: profile?.full_name || 'Admin',
        authorRole: profile?.role || 'Admin',
        // New Rice Mill Fields
        truckNo: '',
        driverName: '',
        driverPhone: '',
        challanNo: '',
        gatePassNo: '',
        laborCharge: 0,
        transportCost: 0,
        commission: 0,
        brokerName: ''
    });

    const [lineItems, setLineItems] = useState([{ ...initialLineItem, id: Date.now() }]);
    const [payments, setPayments] = useState([]);
    const [totals, setTotals] = useState({ 
        itemsTotal: 0, 
        laborCharge: 0,
        transportCost: 0,
        commission: 0,
        subtotal: 0, // This is the net invoice total (items + labor + transport - commission)
        grandTotal: 0, // Invoice total + previous due
        totalPayments: 0, 
        outstandingDue: 0 
    });

    useEffect(() => {
        fetchClients();
        fetchProducts();
        if (id) {
            loadInvoice(id);
        }
    }, [id]);

    const fetchProducts = async () => {
        try {
            const { data } = await supabase.from('products').select('*');
            if (data) setProductsList(data);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const loadInvoice = async (invoiceId) => {
        try {
            const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
            if (error) throw error;

            const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId);
            const { data: pays } = await supabase.from('payments').select('*').eq('invoice_id', invoiceId);

            setSelectedClient(inv.client_id);
            setInvoiceData(prev => ({
                ...prev,
                invoiceNo: inv.invoice_no,
                invoiceDate: inv.invoice_date,
                notes: inv.notes || '',
                truckNo: inv.truck_no || '',
                driverName: inv.driver_name || '',
                driverPhone: inv.driver_phone || '',
                challanNo: inv.challan_no || '',
                gatePassNo: inv.gate_pass_no || '',
                laborCharge: parseFloat(inv.labor_charge || 0),
                transportCost: parseFloat(inv.transport_cost || 0),
                commission: parseFloat(inv.commission || 0),
                brokerName: inv.broker_name || ''
            }));

            if (items?.length) {
                setLineItems(items.map(it => ({ 
                    id: it.id, 
                    description: it.description, 
                    quantity: it.quantity, 
                    rate: it.rate, 
                    amount: it.amount, 
                    product_id: it.product_id || '',
                    bags: it.bags || 0,
                    bag_weight: it.bag_weight || 50,
                    rate_type: it.rate_type || 'PER_BAG',
                    gross_weight: it.gross_weight || 0
                })));
            }
            
            if (pays?.length) setPayments(pays.map(p => ({ id: p.id, date: p.payment_date, amount: p.amount })));

            setPreviousDue(parseFloat(inv.previous_due || 0));
        } catch (error) {
            console.error('Error loading config:', error);
            alert('Could not load invoice data.');
            navigate('/invoices');
        }
    };

    const fetchClients = async () => {
        try {
            const { data } = await supabase.from('clients').select('*');
            if (data) setClientsList(data);
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    useEffect(() => {
        if (selectedClient && clientsList.length > 0) {
            const client = clientsList.find(c => c.id === selectedClient);
            if (client) {
                setInvoiceData(prev => ({
                    ...prev,
                    companyName: client.company_name,
                    phone: client.phone || '',
                    address: client.address || ''
                }));
                if (!isEditing) fetchClientBalance(client.id);
            }
        }
    }, [selectedClient, clientsList, isEditing]);

    const fetchClientBalance = async (clientId) => {
        try {
            const { data, error } = await supabase.rpc('get_client_balance', { p_client_id: clientId });
            if (!error && data !== null) {
                setPreviousDue(parseFloat(data));
            }

            const { data: recents, error: recErr } = await supabase
                .from('payments')
                .select('payment_date, amount, method, reference')
                .eq('client_id', clientId)
                .order('payment_date', { ascending: false })
                .limit(3);

            if (!recErr && recents) {
                setRecentPayments(recents);
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
        }
    };

    useEffect(() => {
        calculateTotals();
    }, [lineItems, previousDue, payments, invoiceData.laborCharge, invoiceData.transportCost, invoiceData.commission]);

    const calculateTotals = () => {
        let itemsTotal = 0;
        const updatedLineItems = lineItems.map(item => {
            const gross = parseFloat(item.bags || 0) * parseFloat(item.bag_weight || 0);
            let amount = 0;
            
            if (item.rate_type === 'PER_BAG') {
                amount = parseFloat(item.bags || 0) * parseFloat(item.rate || 0);
            } else if (item.rate_type === 'PER_MAUND') {
                amount = (gross / 40.0) * parseFloat(item.rate || 0);
            } else { // PER_KG
                amount = gross * parseFloat(item.rate || 0);
            }
            
            itemsTotal += amount;
            return { 
                ...item, 
                gross_weight: gross, 
                quantity: gross,
                amount 
            };
        });

        const labor = parseFloat(invoiceData.laborCharge || 0);
        const transport = parseFloat(invoiceData.transportCost || 0);
        const comm = parseFloat(invoiceData.commission || 0);

        const subtotal = itemsTotal + labor + transport - comm;
        const grandTotal = subtotal + parseFloat(previousDue || 0);
        const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const outstandingDue = grandTotal - totalPayments;

        setTotals({ 
            itemsTotal, 
            laborCharge: labor,
            transportCost: transport,
            commission: comm,
            subtotal, 
            grandTotal,
            totalPayments, 
            outstandingDue 
        });
    };

    const handeDataChange = (e) => {
        const { name, value } = e.target;
        setInvoiceData(prev => ({ ...prev, [name]: value }));
    };

    const handleLineItemChange = (id, field, value) => {
        setLineItems(prev => prev.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'product_id' && value) {
                    const product = productsList.find(p => p.id === value);
                    if (product) {
                        updatedItem.description = product.name;
                        updatedItem.rate = product.unit_price;
                        // Auto detect units
                        if (product.unit.includes('50kg')) {
                            updatedItem.bag_weight = 50;
                        } else if (product.unit.includes('25kg')) {
                            updatedItem.bag_weight = 25;
                        }
                    }
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const addLineItem = () => {
        setLineItems([...lineItems, { ...initialLineItem, id: Date.now() }]);
    };

    const removeLineItem = (id) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter(item => item.id !== id));
        }
    };

    const handlePaymentChange = (id, field, value) => {
        setPayments(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const addPayment = () => {
        setPayments([...payments, { ...initialPayment, id: Date.now() }]);
    };

    const removePayment = (id) => {
        setPayments(payments.filter(item => item.id !== id));
    };

    const handleExportPDF = async () => {
        const element = previewRef.current;
        if (!element) return;

        try {
            const originalStyle = {
                height: element.style.height,
                overflow: element.style.overflow
            };

            element.style.height = 'auto';
            element.style.overflow = 'visible';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 794,
                windowWidth: 794
            });

            element.style.height = originalStyle.height;
            element.style.overflow = originalStyle.overflow;

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            
            const pdfWidth = 210; 
            const pageHeight = 297; 
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            const pdf = new jsPDF('p', 'mm', [pdfWidth, pageHeight]);

            let position = 0;
            let heightLeft = pdfHeight;

            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            const rawName = invoiceData.invoiceNo || 'Draft-Invoice';
            const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '');
            const finalFilename = `Invoice_${safeName}.pdf`;

            const blob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert(`Failed to generate PDF: ${error.message || 'Unknown error'}`);
        }
    };

    const handleFinalize = async () => {
        if (!selectedClient) return alert('Please select a client first.');
        if (lineItems.length === 0 || !lineItems[0].description) return alert('Please add at least one valid line item.');

        setIsSaving(true);
        try {
            let currentInvId = id;
            
            const commonInvoiceData = {
                invoice_date: invoiceData.invoiceDate,
                notes: invoiceData.notes,
                truck_no: invoiceData.truckNo,
                driver_name: invoiceData.driverName,
                driver_phone: invoiceData.driverPhone,
                challan_no: invoiceData.challanNo,
                gate_pass_no: invoiceData.gatePassNo,
                labor_charge: parseFloat(invoiceData.laborCharge || 0),
                transport_cost: parseFloat(invoiceData.transportCost || 0),
                commission: parseFloat(invoiceData.commission || 0),
                broker_name: invoiceData.brokerName,
                updated_at: new Date().toISOString()
            };

            if (isEditing) {
                // UPDATE INVOICE
                const { error: updError } = await supabase.from('invoices').update(commonInvoiceData).eq('id', currentInvId);
                if (updError) throw updError;

                // RECREATE ITEMS
                await supabase.from('invoice_items').delete().eq('invoice_id', currentInvId);
                const itemsToInsert = lineItems.map(it => {
                    const item = {
                        invoice_id: currentInvId,
                        description: it.description,
                        quantity: parseFloat(it.bags || 0) * parseFloat(it.bag_weight || 50),
                        rate: parseFloat(it.rate || 0),
                        bags: parseInt(it.bags || 0),
                        bag_weight: parseFloat(it.bag_weight || 50),
                        rate_type: it.rate_type,
                        gross_weight: parseFloat(it.bags || 0) * parseFloat(it.bag_weight || 50)
                    };
                    if (it.product_id) item.product_id = it.product_id;
                    return item;
                });
                await supabase.from('invoice_items').insert(itemsToInsert);

                // RECREATE PAYMENTS
                await supabase.from('payments').delete().eq('invoice_id', currentInvId);
                if (payments.length > 0) {
                    const paysToInsert = payments.map(p => ({
                        client_id: selectedClient,
                        invoice_id: currentInvId,
                        payment_date: p.date,
                        amount: parseFloat(p.amount),
                        method: 'Custom'
                    }));
                    await supabase.from('payments').insert(paysToInsert);
                }

                await supabase.rpc('recalc_invoice', { p_invoice_id: currentInvId });
                alert('Invoice successfully updated!');
                navigate(-1);
            } else {
                // INSERT DRAFT
                const { data: inv, error: invError } = await supabase.from('invoices').insert([{
                    client_id: selectedClient,
                    invoice_no: `DRAFT-${Date.now()}`,
                    invoice_date: invoiceData.invoiceDate,
                    due_date: invoiceData.invoiceDate,
                    notes: invoiceData.notes,
                    status: 'DRAFT',
                    truck_no: invoiceData.truckNo,
                    driver_name: invoiceData.driverName,
                    driver_phone: invoiceData.driverPhone,
                    challan_no: invoiceData.challanNo,
                    gate_pass_no: invoiceData.gatePassNo,
                    labor_charge: parseFloat(invoiceData.laborCharge || 0),
                    transport_cost: parseFloat(invoiceData.transportCost || 0),
                    commission: parseFloat(invoiceData.commission || 0),
                    broker_name: invoiceData.brokerName
                }]).select().single();

                if (invError) throw invError;
                currentInvId = inv.id;

                const itemsToInsert = lineItems.map(it => {
                    const item = {
                        invoice_id: currentInvId,
                        description: it.description,
                        quantity: parseFloat(it.bags || 0) * parseFloat(it.bag_weight || 50),
                        rate: parseFloat(it.rate || 0),
                        bags: parseInt(it.bags || 0),
                        bag_weight: parseFloat(it.bag_weight || 50),
                        rate_type: it.rate_type,
                        gross_weight: parseFloat(it.bags || 0) * parseFloat(it.bag_weight || 50)
                    };
                    if (it.product_id) item.product_id = it.product_id;
                    return item;
                });
                const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
                if (itemsError) throw itemsError;

                const { error: finalizeError } = await supabase.rpc('finalize_invoice', { p_invoice_id: currentInvId });
                if (finalizeError) throw finalizeError;

                if (payments.length > 0) {
                    for (const p of payments) {
                        await supabase.rpc('auto_apply_payment', {
                            p_client_id: selectedClient,
                            p_amount: parseFloat(p.amount),
                            p_date: p.date,
                            p_method: 'Cash',
                            p_ref: '',
                            p_note: 'Auto-applied from Invoice Generator'
                        });
                    }
                }

                const { data: finalInv } = await supabase.from('invoices').select('invoice_no').eq('id', currentInvId).single();
                if (finalInv) setInvoiceData(prev => ({ ...prev, invoiceNo: finalInv.invoice_no }));

                alert('Invoice successfully created and finalized!');
                navigate('/invoices');
            }
        } catch (error) {
            console.error('Error saving invoice:', error);
            alert('Failed to save invoice: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="invoice-generator-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>{isEditing ? 'Edit Invoice' : 'Create Invoice'}</h1>
                    <p className="text-muted">{isEditing ? 'Modify line items and records securely.' : 'Generate Rice mill invoices with automated bag weight math.'}</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleFinalize} disabled={isSaving || !selectedClient}>
                        {isSaving ? 'Processing...' : (isEditing ? <><Save size={18} /> Update Invoice</> : <><CheckCircle size={18} /> Finalize Invoice</>)}
                    </button>
                    <button className="btn btn-primary" onClick={handleExportPDF} disabled={isSaving}>
                        <Download size={18} /> Export PDF
                    </button>
                </div>
            </header>

            <div className="invoice-workspace">
                {/* Editor Form Panel */}
                <section className="invoice-editor glass-panel">
                    <h2 className="section-title">Invoice Settings</h2>

                    <div className="form-group mb-4">
                        <label className="form-label">Select Client *</label>
                        <select
                            className="form-input"
                            value={selectedClient}
                            onChange={(e) => setSelectedClient(e.target.value)}
                            disabled={isEditing}
                        >
                            <option value="">-- Choose Existing Client --</option>
                            {clientsList.map(c => (
                                <option key={c.id} value={c.id}>{c.company_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label className="form-label">Invoice No</label>
                            <input type="text" className="form-input" name="invoiceNo" value={invoiceData.invoiceNo} readOnly style={{ backgroundColor: '#f3f4f6' }} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Date</label>
                            <input type="date" className="form-input" name="invoiceDate" value={invoiceData.invoiceDate} onChange={handeDataChange} />
                        </div>
                    </div>

                    <div className="divider"></div>
                    <h2 className="section-title">Transport & Delivery Info</h2>
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label className="form-label">Challan No</label>
                            <input type="text" className="form-input" name="challanNo" placeholder="e.g. CH-204" value={invoiceData.challanNo} onChange={handeDataChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Gate Pass No</label>
                            <input type="text" className="form-input" name="gatePassNo" placeholder="e.g. GP-802" value={invoiceData.gatePassNo} onChange={handeDataChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Truck / Vehicle No</label>
                            <input type="text" className="form-input" name="truckNo" placeholder="e.g. DHAKA METRO-TA-11-2233" value={invoiceData.truckNo} onChange={handeDataChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Driver Name</label>
                            <input type="text" className="form-input" name="driverName" placeholder="Driver's Full Name" value={invoiceData.driverName} onChange={handeDataChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Driver Phone</label>
                            <input type="text" className="form-input" name="driverPhone" placeholder="Mobile Number" value={invoiceData.driverPhone} onChange={handeDataChange} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Broker / Agent Name</label>
                            <input type="text" className="form-input" name="brokerName" placeholder="e.g. M/S Rahman Trading" value={invoiceData.brokerName} onChange={handeDataChange} />
                        </div>
                    </div>

                    <div className="divider"></div>

                    <h2 className="section-title">Rice Variants (Line Items)</h2>
                    <div className="line-items-container">
                        <div className="line-items-editor">
                            <div className="grid-header line-item-row" style={{ gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.8fr 1.2fr 0.8fr 1fr 40px'}}>
                                <div>Product</div>
                                <div>Description</div>
                                <div>Bags</div>
                                <div>Wt (kg)</div>
                                <div>Rate Type</div>
                                <div>Rate</div>
                                <div>Amount</div>
                                <div></div>
                            </div>
                            {lineItems.map(item => (
                                <div key={item.id} className="grid-row line-item-row" style={{ gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.8fr 1.2fr 0.8fr 1fr 40px', alignItems: 'center'}}>
                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
                                         <select 
                                             className="form-input" 
                                             value={item.product_id || ''} 
                                             onChange={(e) => handleLineItemChange(item.id, 'product_id', e.target.value)}
                                             style={{ padding: '0.25rem', fontSize: '0.8rem' }}
                                         >
                                             <option value="">-- Custom Rice --</option>
                                             {productsList.map(p => (
                                                 <option key={p.id} value={p.id}>{p.name}</option>
                                             ))}
                                         </select>
                                         {item.product_id && (() => {
                                             const prod = productsList.find(p => p.id === item.product_id);
                                             return prod ? (
                                                 <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                                                     Owner Cost: ৳{parseFloat(prod.cost_price).toLocaleString()}
                                                 </span>
                                             ) : null;
                                         })()}
                                     </div>
                                    <input type="text" className="form-input" placeholder="Item details" value={item.description} onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)} />
                                    <input type="number" className="form-input" placeholder="Bags" value={item.bags || ''} onChange={(e) => handleLineItemChange(item.id, 'bags', parseInt(e.target.value) || 0)} />
                                    <input type="number" className="form-input" placeholder="Weight" value={item.bag_weight || ''} onChange={(e) => handleLineItemChange(item.id, 'bag_weight', parseFloat(e.target.value) || 0)} />
                                    <select 
                                        className="form-input" 
                                        value={item.rate_type} 
                                        onChange={(e) => handleLineItemChange(item.id, 'rate_type', e.target.value)}
                                        style={{ padding: '0.25rem', fontSize: '0.8rem' }}
                                    >
                                        <option value="PER_BAG">Per Bag</option>
                                        <option value="PER_MAUND">Per Maund (40kg)</option>
                                        <option value="PER_KG">Per KG</option>
                                    </select>
                                    <input type="number" className="form-input" placeholder="Rate" value={item.rate || ''} onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} />
                                    <div className="calculated-amount" style={{fontWeight:'600'}}>
                                        {(() => {
                                            const gross = (item.bags || 0) * (item.bag_weight || 0);
                                            let amt = 0;
                                            if (item.rate_type === 'PER_BAG') amt = (item.bags || 0) * (item.rate || 0);
                                            else if (item.rate_type === 'PER_MAUND') amt = (gross / 40.0) * (item.rate || 0);
                                            else amt = gross * (item.rate || 0);
                                            return amt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                                        })()}
                                    </div>
                                    <button className="btn-icon text-danger" onClick={() => removeLineItem(item.id)}><Trash2 size={16} /></button>
                                </div>
                            ))}
                            <div className="add-button-row">
                                <button className="btn btn-secondary btn-sm" onClick={addLineItem}><Plus size={16} /> Add Rice Variant</button>
                            </div>
                        </div>
                    </div>

                    <div className="divider"></div>
                    <h2 className="section-title">Fees & Adjustments (BDT)</h2>
                    <div className="form-grid-3">
                        <div className="form-group">
                            <label className="form-label">Labor / Loading Charge (Coolie)</label>
                            <input type="number" className="form-input" name="laborCharge" value={invoiceData.laborCharge || ''} onChange={handeDataChange} placeholder="0" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Transport Cost / Truck Rent</label>
                            <input type="number" className="form-input" name="transportCost" value={invoiceData.transportCost || ''} onChange={handeDataChange} placeholder="0" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Commission (Arot/Agent Fee)</label>
                            <input type="number" className="form-input" name="commission" value={invoiceData.commission || ''} onChange={handeDataChange} placeholder="0" />
                        </div>
                    </div>

                    <div className="form-group mt-4">
                        <label className="form-label">Previous Due Amount (BDT)</label>
                        <input type="number" className="form-input" value={previousDue} readOnly style={{ backgroundColor: '#f3f4f6' }} />
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>* Automatically calculated based on client ledger history.</p>
                    </div>

                    <div className="divider"></div>

                    <h2 className="section-title">Payments Received</h2>
                    <div className="payments-container">
                        <div className="payments-editor">
                            <div className="grid-header payment-grid-header">
                                <div>Date</div>
                                <div>Amount (BDT)</div>
                                <div></div>
                            </div>
                            {payments.map(payment => (
                                <div key={payment.id} className="grid-row payment-row">
                                    <input type="date" className="form-input" value={payment.date} onChange={(e) => handlePaymentChange(payment.id, 'date', e.target.value)} />
                                    <input type="number" className="form-input" value={payment.amount || ''} onChange={(e) => handlePaymentChange(payment.id, 'amount', parseFloat(e.target.value) || 0)} />
                                    <button className="btn-icon text-danger" onClick={() => removePayment(payment.id)}><Trash2 size={16} /></button>
                                </div>
                            ))}
                            <div className="add-button-row">
                                <button className="btn btn-secondary btn-sm" onClick={addPayment}><Plus size={16} /> Add Payment</button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Live Preview Panel */}
                <section className="invoice-preview-wrapper">
                    <div className="preview-scale-wrapper">
                        <div ref={previewRef}>
                            <InvoicePreview
                                data={invoiceData}
                                items={lineItems}
                                previousDue={previousDue}
                                payments={payments}
                                totals={totals}
                                recentPayments={recentPayments}
                            />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default InvoiceGenerator;
