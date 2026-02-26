import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let subscription;

        const initializeAuth = async () => {
            // First sequentially get the initial session
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
            if (session?.user) {
                await fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }

            // After getting the session, subscribe to auth state changes to avoid lock contention
            const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
                setUser(session?.user ?? null);
                if (session?.user) {
                    await fetchProfile(session.user.id);
                } else {
                    setProfile(null);
                    setLoading(false);
                }
            });

            subscription = data.subscription;
        };

        initializeAuth();

        return () => {
            if (subscription) subscription.unsubscribe();
        };
    }, []);

    const fetchProfile = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('full_name, role, is_active')
                .eq('id', userId)
                .single();

            if (error) console.error('Error fetching profile:', error);
            if (data) setProfile(data);
        } finally {
            setLoading(false);
        }
    };

    const signIn = async (email, password) => {
        return await supabase.auth.signInWithPassword({ email, password });
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            signIn,
            signOut,
            loading,
            isAdmin: profile?.role === 'ADMIN',
            isAccounts: profile?.role === 'ACCOUNTS' || profile?.role === 'ADMIN'
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};
