import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, FileDown, Edit, Eye } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import InvoicePreview from '../components/InvoicePreview';

const InvoicesList = () => {
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [loading, setLoading] = useState(true);
    const [exportingId, setExportingId] = useState(null);
    const [pdfData, setPdfData] = useState(null);
    const pdfPreviewRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('invoices')
                .select(`
                    *,
                    clients ( company_name, phone, address )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setInvoices(data);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (pdfData && pdfPreviewRef.current) {
            // Give it 800ms for InvoicePreview to fetch settings & logo and render DOM
            const timer = setTimeout(() => {
                generatePdf();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [pdfData]);

    const generatePdf = async () => {
        try {
            const element = pdfPreviewRef.current;
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
                backgroundColor: '#ffffff'
            });

            element.style.height = originalStyle.height;
            element.style.overflow = originalStyle.overflow;

            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

            const rawName = pdfData.data.invoiceNo || 'invoice';
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
            console.error("Error creating PDF:", error);
            alert("Failed to export PDF.");
        } finally {
            setPdfData(null);
            setExportingId(null);
        }
    };

    const handleDownloadPdf = async (invoice) => {
        setExportingId(invoice.id);
        try {
            const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id);
            const { data: payments } = await supabase.from('payments').select('*').eq('invoice_id', invoice.id);

            const mappedData = {
                invoiceNo: invoice.invoice_no,
                invoiceDate: invoice.invoice_date,
                companyName: invoice.clients?.company_name || '',
                phone: invoice.clients?.phone || '',
                address: invoice.clients?.address || '',
                notes: invoice.notes || '',
                author: 'Admin',
                authorRole: 'Role'
            };

            const mappedItems = items ? items.map(item => ({
                id: item.id,
                description: item.description,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount
            })) : [];

            const mappedPayments = payments ? payments.map(p => ({
                id: p.id,
                date: p.payment_date,
                amount: p.amount
            })) : [];

            // Compute totals exactly as they were captured during the draft creation
            const prevDue = parseFloat(invoice.previous_due || 0);
            const subtotal = parseFloat(invoice.subtotal || 0);
            const totalPayments = parseFloat(invoice.paid_total || 0);
            const outstandingDue = parseFloat(invoice.balance_due || 0);

            const totals = { subtotal: subtotal + prevDue, totalPayments, outstandingDue };

            setPdfData({
                data: mappedData,
                items: mappedItems,
                previousDue: prevDue,
                payments: mappedPayments,
                totals: totals
            });

        } catch (error) {
            console.error("Error fetching invoice details for PDF:", error);
            alert("Failed to gather invoice data.");
            setExportingId(null);
        }
    };

    const filteredInvoices = invoices.filter(inv => {
        const clientMatch = inv.clients?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        const noMatch = inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
        const statusMatch = statusFilter === 'ALL' || inv.status === statusFilter;
        return (clientMatch || noMatch) && statusMatch;
    });

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Invoices</h1>
                    <p className="text-muted">Manage all generated invoices and track their status.</p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/invoice-generator')}>
                    <Plus size={18} /> Create Invoice
                </button>
            </header>

            <section className="glass-panel">
                <div className="section-header" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0, width: '300px', position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by invoice # or client..."
                            style={{ paddingLeft: '2.5rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        className="form-input"
                        style={{ width: '150px' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="ALL">All Status</option>
                        <option value="DRAFT">Draft</option>
                        <option value="UNPAID">Unpaid</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="PAID">Paid</option>
                        <option value="OVERDUE">Overdue</option>
                    </select>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Client</th>
                                <th>Date</th>
                                <th>Due Date</th>
                                <th className="text-right">Total</th>
                                <th className="text-right">Balance Due</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredInvoices.map(invoice => {
                                return (
                                    <tr key={invoice.id}>
                                        <td className="font-medium">{invoice.invoice_no}</td>
                                        <td>{invoice.clients?.company_name}</td>
                                        <td>{invoice.invoice_date}</td>
                                        <td>{invoice.due_date}</td>
                                        <td className="text-right">৳ {parseFloat(invoice.invoice_total || 0).toLocaleString()}</td>
                                        <td className="text-right font-medium text-danger">৳ {parseFloat(invoice.balance_due || 0).toLocaleString()}</td>
                                        <td>
                                            <span className={`status-badge ${invoice.status.toLowerCase()}`}>
                                                {invoice.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn-icon" title="View"><Eye size={16} /></button>
                                                <button
                                                    className="btn-icon"
                                                    title="Download PDF"
                                                    onClick={() => handleDownloadPdf(invoice)}
                                                    disabled={exportingId === invoice.id}
                                                    style={{ opacity: exportingId === invoice.id ? 0.5 : 1 }}
                                                >
                                                    <FileDown size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No invoices found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Hidden export container */}
            {pdfData && (
                <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', width: '800px', backgroundColor: 'white' }}>
                    <div ref={pdfPreviewRef}>
                        <InvoicePreview
                            data={pdfData.data}
                            items={pdfData.items}
                            previousDue={pdfData.previousDue}
                            payments={pdfData.payments}
                            totals={pdfData.totals}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicesList;
