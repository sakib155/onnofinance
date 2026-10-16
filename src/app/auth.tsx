import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'

type Auth = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile(data as Profile | null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // defer: calling Supabase inside this callback can deadlock the auth client
      setTimeout(() => loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        refreshProfile: () => loadProfile(session),
        signOut: async () => {
          await supabase.auth.signOut()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

// What each role may do. The database enforces the same rules; this only hides what can't be used.
export const permissions = {
  editParties: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  editSetup: ['ADMIN', 'ACCOUNTANT'],
  trade: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  deleteDocs: ['ADMIN', 'ACCOUNTANT'],
  returns: ['ADMIN', 'ACCOUNTANT'],
  money: ['ADMIN', 'ACCOUNTANT'],
  books: ['ADMIN', 'ACCOUNTANT', 'VIEWER'],
  reopenBatch: ['ADMIN', 'ACCOUNTANT'],
  admin: ['ADMIN'],
} satisfies Record<string, Role[]>

export type Permission = keyof typeof permissions

export function useCan() {
  const { profile } = useAuth()
  return (p: Permission) => Boolean(profile?.is_active && (permissions[p] as Role[]).includes(profile.role))
}
