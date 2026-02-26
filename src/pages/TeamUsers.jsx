import React, { useState, useEffect } from 'react';
import { Shield, Check, X, User } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

const TeamUsers = () => {
    const { isAdmin, user: currentUser } = useAuth();
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isAdmin) {
            fetchTeam();
        } else {
            setLoading(false); // Should be protected by route, but just in case
        }
    }, [isAdmin]);

    const fetchTeam = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;
            if (data) setTeam(data);
        } catch (error) {
            console.error('Error fetching team profiles:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;

            // Update local state
            setTeam(team.map(member =>
                member.id === userId ? { ...member, role: newRole } : member
            ));

        } catch (error) {
            console.error('Error updating role:', error);
            alert('Failed to update user role.');
        }
    };

    const handleToggleActive = async (userId, currentStatus) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_active: !currentStatus })
                .eq('id', userId);

            if (error) throw error;

            // Update local state
            setTeam(team.map(member =>
                member.id === userId ? { ...member, is_active: !currentStatus } : member
            ));

        } catch (error) {
            console.error('Error toggling status:', error);
            alert('Failed to update user status.');
        }
    };

    if (!isAdmin) {
        return (
            <div className="dashboard-container">
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-danger)' }}>
                    <Shield size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                    <h2>Access Denied</h2>
                    <p>You do not have administrative privileges to view this page.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header split-header">
                <div>
                    <h1>Team Access Management</h1>
                    <p className="text-muted">Manage employee roles and system access.</p>
                </div>
            </header>

            <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={20} />
                <span><strong>Note:</strong> To add a new team member, ask them to sign up via the Login screen first. They will appear here for you to assign their role.</span>
            </div>

            <section className="glass-panel">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name / Identifier</th>
                                <th>Joined</th>
                                <th>Role</th>
                                <th>Access Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading team members...</td></tr>
                            ) : team.map(member => {
                                const isSelf = member.id === currentUser?.id;

                                return (
                                    <tr key={member.id} style={{ opacity: member.is_active ? 1 : 0.6 }}>
                                        <td className="font-medium">
                                            {member.full_name || <span className="text-muted">No name set</span>}
                                            {isSelf && <span style={{ marginLeft: '8px', fontSize: '0.75rem', padding: '2px 6px', background: 'var(--color-primary)', color: 'white', borderRadius: '4px' }}>You</span>}
                                        </td>
                                        <td>{new Date(member.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <select
                                                className="form-input"
                                                style={{ width: '130px', padding: '0.25rem', fontSize: '0.85rem' }}
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                disabled={isSelf} // Don't let admin demote themselves by accident easily here
                                            >
                                                <option value="ADMIN">ADMIN</option>
                                                <option value="ACCOUNTS">ACCOUNTS</option>
                                                <option value="VIEWER">VIEWER</option>
                                            </select>
                                        </td>
                                        <td>
                                            {member.is_active ? (
                                                <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 500 }}><Check size={14} /> ACTIVE</span>
                                            ) : (
                                                <span style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 500 }}><X size={14} /> REVOKED</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                className={`btn btn-sm ${member.is_active ? 'btn-danger' : 'btn-success'}`}
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                                onClick={() => handleToggleActive(member.id, member.is_active)}
                                                disabled={isSelf}
                                            >
                                                {member.is_active ? 'Revoke Access' : 'Restore Access'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && team.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No users found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default TeamUsers;
