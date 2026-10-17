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

// What each role may do. Mirrors public.perm_roles() in the database, which enforces it;
// the app uses it to show only the menus and buttons a role can use.
const R = {
  all: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
} as const
export const permissions = {
  purchase: [...R.all, 'PURCHASER', 'OPERATOR'],
  sale: [...R.all, 'SALES', 'OPERATOR'],
  production: [...R.all, 'PRODUCTION', 'OPERATOR'],
  stock: [...R.all, 'PRODUCTION', 'OPERATOR'],
  purchaseReturn: [...R.all, 'PURCHASER'],
  saleReturn: [...R.all, 'SALES'],
  parties: [...R.all, 'PURCHASER', 'SALES', 'OPERATOR'],
  deleteDoc: [...R.all],
  reopenBatch: [...R.all],
  money: [...R.all],
  setup: [...R.all],
  books: [...R.all, 'VIEWER'],
  company: ['SUPER_ADMIN', 'ADMIN'],
  audit: ['SUPER_ADMIN', 'ADMIN'],
  deleteMaster: ['SUPER_ADMIN', 'ADMIN'],
  team: ['SUPER_ADMIN'],
} satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof permissions

export function useCan() {
  const { profile } = useAuth()
  return (...ps: Permission[]) =>
    Boolean(profile?.status === 'ACTIVE' && ps.some((p) => (permissions[p] as readonly Role[]).includes(profile.role)))
}
