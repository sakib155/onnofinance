import React, { useState, useEffect } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

const Settings = () => {
    const { isAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [settingsData, setSettingsData] = useState({
        company_name: '',
        company_address: '',
        company_phone: '',
        company_email: '',
        logo_url: '',
        invoice_prefix: 'INV',
        invoice_padding: 6
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) throw error;
            if (data) {
                setSettingsData({
                    company_name: data.company_name || '',
                    company_address: data.company_address || '',
                    company_phone: data.company_phone || '',
                    company_email: data.company_email || '',
                    logo_url: data.logo_url || '',
                    invoice_prefix: data.invoice_prefix || 'INV',
                    invoice_padding: data.invoice_padding || 6
                });
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!isAdmin) return alert("Only administrators can update settings.");

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('settings')
                .update({
                    company_name: settingsData.company_name,
                    company_address: settingsData.company_address,
                    company_phone: settingsData.company_phone,
                    company_email: settingsData.company_email,
                    logo_url: settingsData.logo_url,
                    invoice_prefix: settingsData.invoice_prefix,
                    invoice_padding: parseInt(settingsData.invoice_padding) || 6,
                    updated_at: new Date().toISOString()
                })
                .eq('id', 1);

            if (error) throw error;
            alert('Settings updated successfully.');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to update settings. See console.');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="dashboard-container"><div style={{ padding: '2rem' }}>Loading Settings...</div></div>;
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Settings</h1>
                    <p className="text-muted">Manage company details, branding, and invoice configuration.</p>
                </div>
            </header>

            {!isAdmin && (
                <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={20} />
                    <span><strong>Read-Only Access:</strong> You are viewing these settings as an Accounts/Viewer. Only Administrators can save changes.</span>
                </div>
            )}

            <section className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div className="section-header" style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Company Profile</h2>
                </div>

                <form onSubmit={handleSave} className="settings-form">
                    <div className="form-group mb-4">
                        <label className="form-label">Company Name</label>
                        <input
                            type="text"
                            className="form-input"
                            value={settingsData.company_name}
                            onChange={e => setSettingsData({ ...settingsData, company_name: e.target.value })}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group mb-4">
                            <label className="form-label">Phone</label>
                            <input
                                type="text"
                                className="form-input"
                                value={settingsData.company_phone}
                                onChange={e => setSettingsData({ ...settingsData, company_phone: e.target.value })}
                                disabled={!isAdmin}
                            />
                        </div>
                        <div className="form-group mb-4">
                            <label className="form-label">Email</label>
                            <input
                                type="email"
                                className="form-input"
                                value={settingsData.company_email}
                                onChange={e => setSettingsData({ ...settingsData, company_email: e.target.value })}
                                disabled={!isAdmin}
                            />
                        </div>
                    </div>

                    <div className="form-group mb-4">
                        <label className="form-label">Official Address</label>
                        <textarea
                            className="form-input"
                            rows="3"
                            value={settingsData.company_address}
                            onChange={e => setSettingsData({ ...settingsData, company_address: e.target.value })}
                            disabled={!isAdmin}
                        ></textarea>
                    </div>

                    <div className="form-group mb-4">
                        <label className="form-label">Logo URL</label>
                        <input
                            type="url"
                            className="form-input"
                            placeholder="https://example.com/logo.png"
                            value={settingsData.logo_url}
                            onChange={e => setSettingsData({ ...settingsData, logo_url: e.target.value })}
                            disabled={!isAdmin}
                        />
                        <small className="help-text">Direct link to an image. Will be used on your generated invoices.</small>
                    </div>

                    <div className="section-header" style={{ marginTop: '3rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Invoice Configuration</h2>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group mb-4">
                            <label className="form-label">Invoice Prefix</label>
                            <input
                                type="text"
                                className="form-input"
                                value={settingsData.invoice_prefix}
                                onChange={e => setSettingsData({ ...settingsData, invoice_prefix: e.target.value })}
                                disabled={!isAdmin}
                                required
                            />
                        </div>
                        <div className="form-group mb-4">
                            <label className="form-label">Zero-Padding (Digits)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={settingsData.invoice_padding}
                                onChange={e => setSettingsData({ ...settingsData, invoice_padding: e.target.value })}
                                min="3"
                                max="10"
                                disabled={!isAdmin}
                                required
                            />
                            <small className="help-text">e.g. padding=6 generates {settingsData.invoice_prefix}-000001</small>
                        </div>
                    </div>

                    {isAdmin && (
                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                {isSaving ? 'Saving...' : <><Save size={18} style={{ marginRight: '6px' }} /> Save Changes</>}
                            </button>
                        </div>
                    )}
                </form>
            </section>
        </div>
    );
};

export default Settings;
