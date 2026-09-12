import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithEmail, signInWithGoogle } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { AuthShell, Notice, Divider, Field, GoogleButton } from './parts'
import { useLocale } from '../../lib/locale'

export default function SignIn() {
  const { ready, user } = useAuth()
  const nav = useNavigate()
  const { t } = useLocale()
  const loc = useLocation()
  const { from, email: knownEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [email, setEmail] = useState(knownEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!ready) return <Spinner label={t('home.opening')} page />
  // Landing and the guards know where each role belongs; just get out of the way.
  if (user) return <Navigate to={from ?? '/'} replace />

  async function google() {
    setErr(null); setBusy('google')
    try {
      const cred = await signInWithGoogle()
      if (cred) nav(from ?? '/', { replace: true })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null); setBusy('email')
    try {
      await signInWithEmail(email, password)
      nav(from ?? '/', { replace: true })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  return (
    <AuthShell
      title={t('signin.title')}
      lead={t('signin.lead')}
      foot={<>{t('signin.newHere')} <Link to="/signup" state={{ from, email }} className="link font-semibold text-action">{t('signin.create')}</Link></>}
    >
      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label={t('signin.google')} />
      </div>

      <Divider>{t('signup.or')}</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('signup.email')} type="email" required autoComplete="email" inputMode="email"
          placeholder={t('signup.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <Field label={t('signup.password')} type="password" required autoComplete="current-password"
            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" state={{ email }} className="link text-xs text-ink-soft hover:text-ink">{t('signin.forgot')}</Link>
          </div>
        </div>
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? t('signin.submitting') : t('signin.title')}
        </button>
      </form>
    </AuthShell>
  )
}
