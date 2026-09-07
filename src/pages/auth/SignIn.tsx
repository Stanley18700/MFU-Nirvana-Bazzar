import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithEmail, signInWithGoogle } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { AuthShell, DarkNotice, Divider, Field, GoogleButton } from './parts'

export default function SignIn() {
  const { ready, user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { from, email: knownEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [email, setEmail] = useState(knownEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!ready) return <Spinner label="Opening your passport…" />
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
      title="Sign in"
      lead="Your passport, stamps and points follow the account — sign in on any phone and they are all there."
      foot={<>New here? <Link to="/signup" state={{ from, email }} className="font-semibold text-gold underline">Create an account</Link></>}
    >
      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label="Continue with Google" />
      </div>

      <Divider>or</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" type="email" required autoComplete="email" inputMode="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <Field label="Password" type="password" required autoComplete="current-password"
            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" state={{ email }} className="text-xs text-paper/60 underline hover:text-paper">Forgot your password?</Link>
          </div>
        </div>
        {err && <DarkNotice tone="red">{err}</DarkNotice>}
        <button className="btn-gold py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
