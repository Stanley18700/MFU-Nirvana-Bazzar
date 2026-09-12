import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithGoogle, signUpWithEmail } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { AuthShell, Notice, Divider, Field, GoogleButton } from './parts'
import { useLocale } from '../../lib/locale'

const MIN_PASSWORD = 8

export default function SignUp() {
  const { ready, user } = useAuth()
  const nav = useNavigate()
  const { t } = useLocale()
  const loc = useLocation()
  const { from, email: invitedEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [name, setName] = useState('')
  // An organizer arriving from an invitation must use the invited address; it is pre-filled.
  const [email, setEmail] = useState(invitedEmail ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!ready) return <Spinner label={t('home.opening')} page />
  if (user) return <Navigate to={from ?? '/'} replace />

  async function google() {
    setErr(null); setBusy('google')
    try {
      // A Google address is already proven, so this account skips /verify-email entirely.
      const cred = await signInWithGoogle()
      if (cred) nav(from ?? '/join', { replace: true, state: { from } })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password.length < MIN_PASSWORD) { setErr(`Pick a password of at least ${MIN_PASSWORD} characters.`); return }
    if (password !== confirm) { setErr(t('signup.mismatch')); return }
    setBusy('email')
    try {
      await signUpWithEmail(name, email, password)
      nav('/verify-email', { replace: true, state: { from } })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  return (
    <AuthShell
      title={t('signup.title')}
      lead={t('signup.lead')}
      foot={<>{t('signup.haveOne')} <Link to="/signin" state={{ from }} className="link font-semibold text-action">{t('signup.signIn')}</Link></>}
    >
      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label={t('signup.google')} />
      </div>

      <Divider>{t('signup.or')}</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('signup.name')} required maxLength={80} autoComplete="name"
          placeholder={t('signup.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('signup.email')} type="email" required autoComplete="email" inputMode="email"
          placeholder={t('signup.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)}
          hint={t('signup.emailHint')} />
        <Field label={t('signup.password')} type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={t('signup.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label={t('signup.confirm')} type="password" required autoComplete="new-password"
          placeholder={t('signup.confirmPlaceholder')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? t('signup.submitting') : t('signup.submit')}
        </button>
        <p className="text-xs text-ink-soft">
          {t('signup.privacy')}{' '}
          <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">{t('signup.privacyLink')}</a>.
        </p>
      </form>
    </AuthShell>
  )
}
