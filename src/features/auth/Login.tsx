import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { ErrorBox } from '@/components/ui/layout'
import { setLanguage } from '@/i18n'
import { supabase } from '@/lib/supabase'

export function Login() {
  const { t, i18n } = useTranslation()
  const { session } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    const res =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else if (mode === 'signup' && !res.data.session) setInfo(t('auth.checkEmail'))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-2 size-12" />
          <h1 className="text-lg font-semibold text-slate-900">{t('app.name')}</h1>
          <p className="text-sm text-slate-500">{t('app.tagline')}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <Field label={t('auth.fullName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label={t('auth.email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label={t('auth.password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </Field>
          <ErrorBox error={error} />
          {info && <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{info}</div>}
          <Button type="submit" className="w-full" loading={busy}>
            {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm text-slate-500">
          {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <button className="font-medium text-brand-700 hover:underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? t('auth.signUp') : t('auth.signIn')}
          </button>
        </div>
        {mode === 'signup' && <p className="mt-3 text-center text-xs text-slate-500">{t('auth.firstUserAdmin')}</p>}
        <div className="mt-5 flex justify-center gap-3 text-xs">
          <button className={i18n.language === 'en' ? 'font-semibold text-brand-700' : 'text-slate-500'} onClick={() => setLanguage('en')}>
            English
          </button>
          <button className={i18n.language === 'bn' ? 'font-semibold text-brand-700' : 'text-slate-500'} onClick={() => setLanguage('bn')}>
            বাংলা
          </button>
        </div>
      </div>
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Connect your Supabase project</h1>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Create a project at supabase.com.</li>
          <li>
            Open its SQL editor and run <code className="rounded bg-slate-100 px-1">supabase/setup.sql</code> from this repository.
          </li>
          <li>
            Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to <code className="rounded bg-slate-100 px-1">.env</code> and fill in the
            project URL and anon key (Project Settings → API).
          </li>
          <li>Restart the dev server, then sign up. The first account becomes the admin.</li>
        </ol>
      </div>
    </div>
  )
}
