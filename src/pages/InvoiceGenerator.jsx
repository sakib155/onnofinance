import React, { useState, useEffect, useRef } from 'react';
import { Download, Save, Plus, Trash2, CheckCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../utils/supabase';
import './InvoiceGenerator.css';
import InvoicePreview from '../components/InvoicePreview';

const initialLineItem = { description: '', quantity: 1, rate: 0, amount: 0 };
const initialPayment = { date: new Date().toISOString().split('T')[0], amount: 0 };

const InvoiceGenerator = () => {
    const previewRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
    const [clientsList, setClientsList] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');

    const [invoiceData, setInvoiceData] = useState({
        invoiceNo: 'DRAFT',
        invoiceDate: new Date().toISOString().split('T')[0],
        companyName: '',
        phone: '',
        address: '',
        notes: 'Please make payment within the agreed credit period.',
        author: 'Admin',
        authorRole: 'Role'
    });

    const [lineItems, setLineItems] = useState([{ ...initialLineItem, id: Date.now() }]);
    const [previousDue, setPreviousDue] = useState(0);
    const [payments, setPayments] = useState([]);
    const [totals, setTotals] = useState({ subtotal: 0, totalPayments: 0, outstandingDue: 0 });

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const { data } = await supabase.from('clients').select('*');
            if (data) setClientsList(data);
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    useEffect(() => {
        if (selectedClient) {
            const client = clientsList.find(c => c.id === selectedClient);
            if (client) {
                setInvoiceData(prev => ({
                    ...prev,
                    companyName: client.company_name,
                    phone: client.phone || '',
                    address: client.address || ''
                }));
                fetchClientBalance(client.id);
            }
        }
    }, [selectedClient]);

    const fetchClientBalance = async (clientId) => {
        try {
            const { data, error } = await supabase.rpc('get_client_balance', { p_client_id: clientId });
            if (!error && data !== null) {
                setPreviousDue(parseFloat(data));
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
        }
    };

    useEffect(() => {
        calculateTotals();
    }, [lineItems, previousDue, payments]);

    const calculateTotals = () => {
        let itemsTotal = 0;
        const updatedLineItems = lineItems.map(item => {
            const amount = item.quantity * item.rate;
            itemsTotal += amount;
            return { ...item, amount };
        });

        // Check if lineItems actually changed amounts to prevent infinite loop (simplified for now)

        const subtotal = itemsTotal + parseFloat(previousDue || 0);
        const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const outstandingDue = subtotal - totalPayments;

        setTotals({ subtotal, totalPayments, outstandingDue });
    };

    const handeDataChange = (e) => {
        const { name, value } = e.target;
        setInvoiceData(prev => ({ ...prev, [name]: value }));
    };

    const handleLineItemChange = (id, field, value) => {
        setLineItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
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
            // Need to save original overflow/height to snap full content properly
            const originalStyle = {
                height: element.style.height,
                overflow: element.style.overflow
            };

            // Allow html2canvas to capture full height
            element.style.height = 'auto';
            element.style.overflow = 'visible';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // Restore style
            element.style.height = originalStyle.height;
            element.style.overflow = originalStyle.overflow;

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

            const rawName = invoiceData.invoiceNo || 'Draft-Invoice';
            const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '');
            const finalFilename = `Invoice_${safeName}.pdf`;

            // Export as ArrayBuffer Blob with strict PDF MIME type
            const blob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            // Append to body, click, remove, and revoke to clear memory
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
            // 1. Create Draft Header
            const { data: inv, error: invError } = await supabase.from('invoices').insert([{
                client_id: selectedClient,
                invoice_no: `DRAFT-${Date.now()}`,
                invoice_date: invoiceData.invoiceDate,
                due_date: invoiceData.invoiceDate, // Temp, will be updated by finalize
                notes: invoiceData.notes,
                status: 'DRAFT'
            }]).select().single();

            if (invError) throw invError;

            // 2. Add Line Items
            const itemsToInsert = lineItems.map(it => ({
                invoice_id: inv.id,
                description: it.description,
                quantity: it.quantity,
                rate: it.rate
            }));

            const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
            if (itemsError) throw itemsError;

            // 3. Finalize Invoice
            const { error: finalizeError } = await supabase.rpc('finalize_invoice', { p_invoice_id: inv.id });
            if (finalizeError) throw finalizeError;

            // 4. Fetch the finalized invoice to get the real invoiceNo
            const { data: finalInv } = await supabase.from('invoices').select('invoice_no').eq('id', inv.id).single();
            if (finalInv) {
                setInvoiceData(prev => ({ ...prev, invoiceNo: finalInv.invoice_no }));
            }

            alert('Invoice successfully created and finalized!');

        } catch (error) {
            console.error('Error finalizing invoice:', error);
            alert('Failed to save invoice: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="invoice-generator-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Create Invoice</h1>
                    <p className="text-muted">Select client and fill details. Calculations happen automatically.</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleFinalize} disabled={isSaving || !selectedClient}>
                        {isSaving ? 'Processing...' : <><CheckCircle size={18} /> Finalize Invoice</>}
                    </button>
                    <button className="btn btn-primary" onClick={handleExportPDF} disabled={isSaving}>
                        <Download size={18} /> Export PDF
                    </button>
                </div>
            </header>

            <div className="invoice-workspace">
                {/* Editor Form Panel */}
                <section className="invoice-editor glass-panel">
                    <h2 className="section-title">Invoice Details</h2>

                    <div className="form-group mb-4">
                        <label className="form-label">Select Client</label>
                        <select
                            className="form-input"
                            value={selectedClient}
                            onChange={(e) => setSelectedClient(e.target.value)}
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
                        <div className="form-group">
                            <label className="form-label">Company Name</label>
                            <input type="text" className="form-input" name="companyName" value={invoiceData.companyName} readOnly style={{ backgroundColor: '#f3f4f6' }} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input type="text" className="form-input" name="phone" value={invoiceData.phone} onChange={handeDataChange} />
                        </div>
                        <div className="form-group col-span-2">
                            <label className="form-label">Address</label>
                            <input type="text" className="form-input" name="address" value={invoiceData.address} onChange={handeDataChange} />
                        </div>
                    </div>

                    <div className="divider"></div>

                    <h2 className="section-title">Line Items</h2>
                    <div className="line-items-container">
                        <div className="line-items-editor">
                            <div className="grid-header line-item-row">
                                <div>Description</div>
                                <div>Qty</div>
                                <div>Rate</div>
                                <div>Amount</div>
                                <div></div>
                            </div>
                            {lineItems.map(item => (
                                <div key={item.id} className="grid-row line-item-row">
                                    <input type="text" className="form-input" placeholder="Item name" value={item.description} onChange={(e) => handleLineItemChange(item.id, 'description', e.target.value)} />
                                    <input type="number" className="form-input" value={item.quantity} onChange={(e) => handleLineItemChange(item.id, 'quantity', parseFloat(e.target.value))} />
                                    <input type="number" className="form-input" value={item.rate} onChange={(e) => handleLineItemChange(item.id, 'rate', parseFloat(e.target.value))} />
                                    <div className="calculated-amount">{(item.quantity * item.rate).toLocaleString()}</div>
                                    <button className="btn-icon text-danger" onClick={() => removeLineItem(item.id)}><Trash2 size={16} /></button>
                                </div>
                            ))}
                            <div className="add-button-row">
                                <button className="btn btn-secondary btn-sm" onClick={addLineItem}><Plus size={16} /> Add Item</button>
                            </div>
                        </div>
                    </div>

                    <div className="form-group mt-4">
                        <label className="form-label">Previous Due Amount (BDT)</label>
                        <input type="number" className="form-input" value={previousDue} readOnly style={{ backgroundColor: '#f3f4f6' }} />
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>* Automatically calculated based on past invoices & payments.</p>
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
                                    <input type="number" className="form-input" value={payment.amount} onChange={(e) => handlePaymentChange(payment.id, 'amount', parseFloat(e.target.value))} />
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
                    <div className="preview-sticky-container" ref={previewRef}>
                        <InvoicePreview
                            data={invoiceData}
                            items={lineItems}
                            previousDue={previousDue}
                            payments={payments}
                            totals={totals}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
};

export default InvoiceGenerator;
