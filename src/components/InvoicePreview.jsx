import React from 'react';
import './InvoicePreview.css';

const InvoicePreview = ({ data, items, previousDue, payments, totals, recentPayments = [] }) => {
    return (
        <div id="invoice-a4" className="a4">
            {/* Full-width company header */}
            <div className="headerLogo">
                <img src="/header.svg" alt="Company Header" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>

            {/* Invoice title + meta below header */}
            <div className="titleBlock">
                <div className="title">SALES INVOICE / CHALLAN</div>
                <div className="meta">
                    <div><span>Invoice No:</span> {data.invoiceNo}</div>
                    <div><span>Invoice Date:</span> {data.invoiceDate}</div>
                    <div><span>Challan No:</span> {data.challanNo || 'N/A'}</div>
                    {data.gatePassNo && <div><span>Gate Pass:</span> {data.gatePassNo}</div>}
                </div>
            </div>

            <div className="mill-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', fontSize: '0.85rem' }}>
                <div className="clientBlock" style={{ margin: 0 }}>
                    <div className="blockTitle" style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px', marginBottom: '6px' }}>Bill To</div>
                    <div className="clientName" style={{ fontWeight: '600', fontSize: '1rem', color: '#111827' }}>{data.companyName || 'Select Client Below...'}</div>
                    <div className="clientInfo">{data.address}</div>
                    <div className="clientInfo">{data.phone}</div>
                </div>

                <div className="transportBlock" style={{ padding: '8px 12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                    <div className="blockTitle" style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px', marginBottom: '6px' }}>Delivery & Transport</div>
                    {data.truckNo && <div><span>Truck No:</span> <b>{data.truckNo}</b></div>}
                    {data.driverName && <div><span>Driver:</span> {data.driverName} {data.driverPhone ? `(${data.driverPhone})` : ''}</div>}
                    {data.brokerName && <div><span>Broker/Agent:</span> {data.brokerName}</div>}
                    {!data.truckNo && !data.driverName && <div className="text-muted" style={{ fontStyle: 'italic' }}>No vehicle details specified</div>}
                </div>
            </div>

            <div className="tableWrap">
                <table className="items">
                    <thead>
                        <tr>
                            <th>Rice Variant / Description</th>
                            <th className="num">Bags</th>
                            <th className="num">Weight</th>
                            <th className="num">Total Wt (kg)</th>
                            <th>Rate Type</th>
                            <th className="num">Rate (BDT)</th>
                            <th className="num">Amount (BDT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const gross = parseFloat(item.bags || 0) * parseFloat(item.bag_weight || 0);
                            return (
                                <tr key={item.id || index}>
                                    <td style={{ fontWeight: '500' }}>{item.description || '...'}</td>
                                    <td className="num">{parseInt(item.bags || 0).toLocaleString()}</td>
                                    <td className="num">{parseFloat(item.bag_weight || 0)} kg</td>
                                    <td className="num">{gross.toLocaleString()} kg</td>
                                    <td style={{ textTransform: 'capitalize', fontSize: '0.75rem', color: '#4b5563' }}>
                                        {item.rate_type ? item.rate_type.replace('PER_', 'Per ').toLowerCase() : 'Per Bag'}
                                    </td>
                                    <td className="num">{parseFloat(item.rate || 0).toLocaleString()}</td>
                                    <td className="num" style={{ fontWeight: '600' }}>
                                        {parseFloat(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Calculations Section */}
                        <tr className="rowMuted" style={{ borderTop: '2px solid #e5e7eb' }}>
                            <td colSpan="5">Rice Sales Subtotal</td>
                            <td></td>
                            <td className="num">{parseFloat(totals.itemsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        
                        {parseFloat(totals.laborCharge || 0) > 0 && (
                            <tr className="rowMuted">
                                <td colSpan="5">Add: Labor / Loading Fee (Coolie)</td>
                                <td></td>
                                <td className="num">+{parseFloat(totals.laborCharge).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        )}

                        {parseFloat(totals.transportCost || 0) > 0 && (
                            <tr className="rowMuted">
                                <td colSpan="5">Add: Transport / Truck Rent</td>
                                <td></td>
                                <td className="num">+{parseFloat(totals.transportCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        )}

                        {parseFloat(totals.commission || 0) > 0 && (
                            <tr className="rowMuted" style={{ color: 'var(--color-danger)' }}>
                                <td colSpan="5">Deduct: Broker/Arot Commission</td>
                                <td></td>
                                <td className="num">-{parseFloat(totals.commission).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        )}

                        <tr className="rowTotal">
                            <td colSpan="5">Current Invoice Total (Net)</td>
                            <td></td>
                            <td className="num" style={{ color: '#111827' }}>৳ {parseFloat(totals.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>

                        <tr className="rowMuted">
                            <td colSpan="5">Add: Previous Outstanding Account Due</td>
                            <td></td>
                            <td className="num">৳ {parseFloat(previousDue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>

                        <tr className="rowGrand">
                            <td colSpan="5">Total Outstanding Receivable</td>
                            <td></td>
                            <td className="num">৳ {parseFloat(totals.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {payments.length > 0 && (
                <>
                    <div className="paymentsTitle" style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#374151', margin: '20px 0 8px 0' }}>Payments Received (This Invoice)</div>
                    <div className="tableWrap">
                        <table className="payments">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th className="num">Amount (BDT)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((payment, index) => (
                                    <tr key={payment.id || index}>
                                        <td>{new Date(payment.date || payment.payment_date).toLocaleDateString()}</td>
                                        <td className="num">৳ {parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                                <tr className="rowGrand">
                                    <td>Total Payments Received</td>
                                    <td className="num">৳ {parseFloat(totals.totalPayments).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="dueLine" style={{ marginTop: '15px', padding: '12px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="dueText" style={{ fontSize: '1rem', color: '#991b1b', fontWeight: '600' }}>
                    Net Outstanding Dues (Running Balance):
                </div>
                <div style={{ fontSize: '1.25rem', color: '#991b1b', fontWeight: '700' }}>
                    BDT {parseFloat(totals.outstandingDue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>

            {recentPayments && recentPayments.length > 0 && parseFloat(previousDue) > 0 && (
                <div className="recentPayments" style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Recent Client Payments (Mini-Ledger)</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #d1d5db', color: '#6b7280', textAlign: 'left' }}>
                                <th style={{ padding: '4px 0' }}>Date</th>
                                <th style={{ padding: '4px 0' }}>Method / Ref</th>
                                <th style={{ padding: '4px 0', textAlign: 'right' }}>Amount (BDT)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentPayments.map((rp, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '4px 0' }}>{new Date(rp.payment_date).toLocaleDateString()}</td>
                                    <td style={{ padding: '4px 0' }}>{rp.method || 'Cash'} {rp.reference ? `(${rp.reference})` : ''}</td>
                                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '500' }}>৳ {parseFloat(rp.amount).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="notes" style={{ marginTop: '20px' }}>
                <div className="blockTitle" style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#6b7280', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px', marginBottom: '4px' }}>Notes &amp; Terms</div>
                <div className="noteText" style={{ color: '#4b5563', fontSize: '0.8rem' }}>{data.notes}</div>
            </div>

            <div className="signature" style={{ marginTop: '30px' }}>
                <div className="sigLine"></div>
                <div className="sigName">{data.author}</div>
                <div className="sigRole">{data.authorRole}</div>
            </div>
        </div>
    );
};

export default InvoicePreview;
