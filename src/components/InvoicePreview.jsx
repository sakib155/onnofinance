import React from 'react';
import './InvoicePreview.css';

const InvoicePreview = ({ data, items, previousDue, payments, totals }) => {
    return (
        <div id="invoice-a4" className="a4">
            {/* Full-width company header */}
            <div className="headerLogo">
                <img src="/header.svg" alt="Company Header" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>

            {/* Invoice title + meta below header */}
            <div className="titleBlock">
                <div className="title">INVOICE</div>
                <div className="meta">
                    <div><span>Invoice No:</span> {data.invoiceNo}</div>
                    <div><span>Invoice Date:</span> {data.invoiceDate}</div>
                    <div><span>Due Date:</span> {data.invoiceDate}</div>
                </div>
            </div>


            <div className="clientBlock">
                <div className="blockTitle">Bill To</div>
                <div className="clientName">{data.companyName || 'Select Client Below...'}</div>
                <div className="clientInfo">{data.address}</div>
                <div className="clientInfo">{data.phone}</div>
            </div>

            <div className="tableWrap">
                <table className="items">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th className="num">Quantity</th>
                            <th className="num">Rate (BDT)</th>
                            <th className="num">Amount (BDT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={item.id || index}>
                                <td>{item.description || '...'}</td>
                                <td className="num">{parseFloat(item.quantity).toLocaleString()}</td>
                                <td className="num">{parseFloat(item.rate).toLocaleString()}</td>
                                <td className="num">{parseFloat(item.amount).toLocaleString()}</td>
                            </tr>
                        ))}
                        <tr className="rowMuted">
                            <td>Previous Due</td>
                            <td></td><td></td>
                            <td className="num">{parseFloat(previousDue).toLocaleString()}</td>
                        </tr>
                        <tr className="rowTotal">
                            <td>Subtotal</td>
                            <td></td><td></td>
                            <td className="num">{parseFloat(totals.subtotal).toLocaleString()}</td>
                        </tr>
                        <tr className="rowGrand">
                            <td>Total Receivable</td>
                            <td></td><td></td>
                            <td className="num">{parseFloat(totals.subtotal).toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {payments.length > 0 && (
                <>
                    <div className="paymentsTitle">Payments Received</div>
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
                                        <td className="num">{parseFloat(payment.amount).toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr className="rowGrand">
                                    <td>Total Payments</td>
                                    <td className="num">{parseFloat(totals.totalPayments).toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="dueLine">
                <div className="dueText">Total Outstanding Due: <b>BDT {parseFloat(totals.outstandingDue).toLocaleString()}</b></div>
            </div>

            <div className="notes">
                <div className="blockTitle">Notes &amp; Payment Instructions</div>
                <div className="noteText">{data.notes}</div>
            </div>

            <div className="signature">
                <div className="sigLine"></div>
                <div className="sigName">{data.author}</div>
                <div className="sigRole">{data.authorRole}</div>
            </div>
        </div>
    );
};

export default InvoicePreview;
