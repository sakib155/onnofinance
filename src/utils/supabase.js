import { createClient } from '@supabase/supabase-js';

// Get keys from env file (created by user)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'; // Fallback for local testing visually if no env
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storageKey: 'onno-finance-auth-v2'
    }
});
