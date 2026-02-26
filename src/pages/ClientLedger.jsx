import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CreditCard } from 'lucide-react';
import { supabase } from '../utils/supabase';

const ClientLedger = () => {
    const { id } = useParams();
    const [client, setClient] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLedgerData();
    }, [id]);

    const fetchLedgerData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Client Details
            const { data: clientData, error: clientErr } = await supabase
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();
            if (clientErr) throw clientErr;

            // Fetch the v_client_due view to get the current total due easily
            const { data: dueData } = await supabase
                .from('v_client_due')
                .select('current_due')
                .eq('client_id', id)
                .single();

            setClient({
                ...clientData,
                current_due: dueData?.current_due || 0
            });

            // 2. Fetch Invoices
            const { data: invoices, error: invErr } = await supabase
                .from('invoices')
                .select('id, invoice_no, invoice_date, invoice_total')
                .eq('client_id', id);
            if (invErr) throw invErr;

            // 3. Fetch Payments
            const { data: payments, error: payErr } = await supabase
                .from('payments')
                .select('id, payment_date, amount, method, reference, invoices(invoice_no)')
                .eq('client_id', id);
            if (payErr) throw payErr;

            // 4. Merge & Sort Chronologically
            const entries = [];

            // Add Opening Balance as first entry if > 0
            const openingDue = parseFloat(clientData.opening_due || 0);

            invoices.forEach(inv => {
                entries.push({
                    type: 'INVOICE',
                    id: inv.id,
                    date: new Date(inv.invoice_date),
                    displayDate: inv.invoice_date,
                    ref: inv.invoice_no,
                    debit: parseFloat(inv.invoice_total), // Adds to balance
                    credit: 0,
                    description: `Invoice Generated`
                });
            });

            payments.forEach(pay => {
                entries.push({
                    type: 'PAYMENT',
                    date: new Date(pay.payment_date),
                    displayDate: pay.payment_date,
                    ref: pay.reference || 'N/A',
                    debit: 0,
                    credit: parseFloat(pay.amount), // Deducts from balance
                    description: `Payment (${pay.method}) ${pay.invoices ? 'for ' + pay.invoices.invoice_no : ''}`
                });
            });

            entries.sort((a, b) => a.date - b.date);

            // 5. Calculate Running Balance
            let runningBalance = openingDue;
            const finalizedLedger = entries.map(entry => {
                runningBalance = runningBalance + entry.debit - entry.credit;
                return { ...entry, balance: runningBalance };
            });

            // Prepend Opening Balance row to display
            finalizedLedger.unshift({
                type: 'OPENING',
                displayDate: '-',
                ref: '-',
                debit: openingDue > 0 ? openingDue : 0,
                credit: 0,
                description: 'Opening Balance',
                balance: openingDue
            });

            setLedger(finalizedLedger);

        } catch (error) {
            console.error('Error fetching ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="dashboard-container"><div style={{ padding: '2rem' }}>Loading Ledger...</div></div>;
    if (!client) return <div className="dashboard-container"><div style={{ padding: '2rem' }}>Client not found.</div></div>;

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Link to="/clients" className="text-muted" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}><ArrowLeft size={16} style={{ marginRight: '4px' }} /> Back to Clients</Link>
                    </div>
                    <h1>{client.company_name} - Ledger</h1>
                    <p className="text-muted">{client.contact_person} | {client.phone}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>Total Outstanding</p>
                    <h2 style={{ margin: 0, color: parseFloat(client.current_due) > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        ৳ {parseFloat(client.current_due).toLocaleString()}
                    </h2>
                </div>
            </header>

            <section className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Reference</th>
                                <th>Description</th>
                                <th className="text-right">Debit (+)</th>
                                <th className="text-right">Credit (-)</th>
                                <th className="text-right">Running Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledger.map((entry, idx) => (
                                <tr key={idx} style={{ backgroundColor: entry.type === 'OPENING' ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                                    <td>{entry.displayDate}</td>
                                    <td>
                                        {entry.type === 'INVOICE' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)' }}><FileText size={14} /> INVOICE</span>}
                                        {entry.type === 'PAYMENT' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-success)' }}><CreditCard size={14} /> PAYMENT</span>}
                                        {entry.type === 'OPENING' && <span style={{ color: 'var(--color-text-muted)' }}>START</span>}
                                    </td>
                                    <td>
                                        {entry.type === 'INVOICE' ? (
                                            <Link to={`/invoice-edit/${entry.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>
                                                {entry.ref}
                                            </Link>
                                        ) : entry.ref}
                                    </td>
                                    <td>{entry.description}</td>
                                    <td className="text-right font-medium">{entry.debit > 0 ? `৳ ${entry.debit.toLocaleString()}` : '-'}</td>
                                    <td className="text-right font-medium text-success">{entry.credit > 0 ? `৳ ${entry.credit.toLocaleString()}` : '-'}</td>
                                    <td className="text-right font-bold">৳ {entry.balance.toLocaleString()}</td>
                                </tr>
                            ))}
                            {ledger.length <= 1 && parseFloat(client.opening_due) === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No transactions found for this client.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default ClientLedger;
