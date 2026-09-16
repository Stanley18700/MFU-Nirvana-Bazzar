import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithGoogle, signUpWithEmail } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { AuthShell, Notice, Divider, Field, GoogleButton } from './parts'

const MIN_PASSWORD = 8

export default function SignUp() {
  const { ready, user, redirectError, clearRedirectError } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { from, email: invitedEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [name, setName] = useState('')
  // An organizer arriving from an invitation must use the invited address; it is pre-filled.
  const [email, setEmail] = useState(invitedEmail ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!ready) return <Spinner label="Opening your passport…" page />
  if (user) return <Navigate to={from ?? '/'} replace />

  async function google() {
    setErr(null); clearRedirectError(); setBusy('google')
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
    if (password !== confirm) { setErr('The two passwords do not match.'); return }
    setBusy('email')
    try {
      await signUpWithEmail(name, email, password)
      nav('/verify-email', { replace: true, state: { from } })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  return (
    <AuthShell
      title="Create your account"
      lead="One account holds your passport for the whole festival. Sign in again on a new phone and every stamp is still there."
      foot={<>Already have one? <Link to="/signin" state={{ from }} className="link font-semibold text-action">Sign in</Link></>}
    >
      {/* Same reason as SignIn: a redirect failure lands on a fresh page load, with no caller
          holding it, so it belongs beside the button rather than in the form's `err`. */}
      {redirectError && <div className="mt-6"><Notice tone="red">{redirectError}</Notice></div>}

      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label="Sign up with Google" />
      </div>

      <Divider>or with an email</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Your name" required maxLength={80} autoComplete="name"
          placeholder="Shown on your passport cover" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" required autoComplete="email" inputMode="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          hint="We send a one-tap link here to confirm the address is yours." />
        <Field label="Password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Confirm password" type="password" required autoComplete="new-password"
          placeholder="Type it once more" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-xs text-ink-soft">
          By continuing you agree to how MFU handles your details — see the{' '}
          <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">privacy notice</a>.
        </p>
      </form>
    </AuthShell>
  )
}
