import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Ledger } from './Ledger.tsx'
import { isConfigured, supabase } from './supabase.ts'

// Read at load, because the Supabase client clears the address once it has used the link.
const authLink = new URLSearchParams(location.hash.slice(1))

export function App() {
  const [recovering, setRecovering] = useState(authLink.get('type') === 'recovery')
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [member, setMember] = useState<boolean | null>(null)
  const [memberError, setMemberError] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let live = true
    supabase.rpc('is_ledger_member').then(({ data, error }) => {
      if (!live) return
      setMemberError(Boolean(error))
      setMember(data === true)
    })
    return () => {
      live = false
      setMember(null)
    }
  }, [userId])

  if (!isConfigured) return <Notice title="Connect Supabase">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.</Notice>
  if (session === undefined) return <Notice title="Onno Ledger">Loading…</Notice>
  if (!session) return <Login />
  if (recovering) return <NewPassword email={session.user.email ?? ''} onDone={() => setRecovering(false)} />
  if (member === null) return <Notice title="Onno Ledger">Checking your access…</Notice>
  if (memberError)
    return (
      <Notice title="The ledger could not load">
        Check your connection and reload. If this keeps happening, make sure setup.sql has been run on the project.
        <SignOut />
      </Notice>
    )
  if (!member)
    return (
      <Notice title="Your account is not on the ledger team">
        You are signed in as {session.user.email}. Ask the owner to add this email to the team.
        <SignOut />
      </Notice>
    )
  return <Ledger email={session.user.email ?? ''} />
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="center">
      <div className="panel narrow">
        <h1>{title}</h1>
        <div className="sub">{children}</div>
      </div>
    </main>
  )
}

function SignOut() {
  return (
    <p>
      <button type="button" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </p>
  )
}

function NewPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== again) return setError('The two passwords do not match.')
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <p className="sub">For {email}.</p>
        <label>
          New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        </label>
        <label>
          New password again
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={6} autoComplete="new-password" />
        </label>
        {error && <p className="status err" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          Save new password
        </button>
      </form>
    </main>
  )
}

function Login() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(authLink.get('error_description') ?? '')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchTo = (next: typeof mode) => {
    setMode(next)
    setError('')
    setInfo('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      setBusy(false)
      if (error) setError(error.message)
      else setInfo('If this email has an account, a reset link is on its way. Check spam too.')
      return
    }
    const res =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else if (mode === 'signup' && !res.data.session) setInfo('Check your email and open the confirmation link, then sign in.')
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <h1>Onno Ledger</h1>
        <p className="sub">{mode === 'forgot' ? 'Enter your email and we will send a link to choose a new password.' : 'Rice sales, profit and margin by month.'}</p>
        <label>
          Email
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>
        )}
        {error && <p className="status err" role="alert">{error}</p>}
        {info && <p className="status" role="status">{info}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'signin' && (
          <p className="sub">
            <button type="button" className="link" onClick={() => switchTo('forgot')}>
              Forgot password?
            </button>
          </p>
        )}
        <p className="sub">
          {mode === 'signin' ? 'First time here?' : mode === 'signup' ? 'Already have an account?' : 'Remembered it?'}{' '}
          <button type="button" className="link" onClick={() => switchTo(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </main>
  )
}
