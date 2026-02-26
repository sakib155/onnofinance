// Simulating a backend database to allow us to build the UI
// structured identically to the Supabase schema provided

export const mockClients = [
    {
        id: 'c1',
        company_name: 'Xecta Ltd',
        contact_person: 'Azwad Sakib Purno',
        phone: '+8801729099077',
        address: 'House 63, L2, Road 4, Block C, Banani, Dhaka, 1213',
        payment_terms_days: 15,
        opening_due: 0,
    },
    {
        id: 'c2',
        company_name: 'Acme Corp',
        contact_person: 'John Doe',
        phone: '+1 555-010-2938',
        address: '123 Business Rd, Metropolis',
        payment_terms_days: 30,
        opening_due: 15000,
    }
];

export const mockInvoices = [
    {
        id: 'inv1',
        invoice_no: 'INV-000001',
        client_id: 'c1',
        invoice_date: '2026-02-26',
        due_date: '2026-03-13',
        notes: 'Please make payment within 15 days.',
        subtotal: 5163850,
        previous_due: 2636600,
        total_amount: 5163850,
        status: 'PARTIAL',
        is_locked: true
    }
];

export const mockPayments = [
    {
        id: 'p1',
        client_id: 'c1',
        invoice_id: 'inv1',
        payment_date: '2026-02-26',
        amount: 1000000,
        method: 'Bank Transfer',
        reference: 'TRX-99238',
        note: 'Initial deposit'
    }
];
