import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { Crest, Notice, Spinner } from '../components/ui'

/**
 * Email and password sign-in, for two audiences.
 *
 * An admin needs a login that is not tied to one browser's anonymous account, because `/setup`
 * upgrades whichever browser used the bootstrap key and the key is one-shot. And a visitor
 * restoring a passport (§4.1) arrives here after setting a password, which signs them back into
 * their original account rather than a new empty one.
 *
 * Booth organizers never see this — they arrive through an emailed invitation (§6.4).
 */
export default function SignIn() {
  const { ready, role, refreshClaims } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'red' | 'green' | 'amber'; text: string } | null>(null)

  if (!ready) return <Spinner label="Checking…" />
  // Already signed in as staff — nothing to do here.
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'organizer') return <Navigate to="/booth" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      // Replaces the anonymous session this page was opened with.
      const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
      const claims = (await cred.user.getIdTokenResult(true)).claims
      await refreshClaims()
      const r = claims.role as string | undefined
      nav(r === 'admin' ? '/admin' : r === 'organizer' ? '/booth' : '/passport', { replace: true })
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setMsg({
        tone: 'red',
        text: code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'That email and password do not match an account.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a few minutes and try again.'
            : (err as Error).message,
      })
    } finally { setBusy(false) }
  }

  async function reset() {
    if (!email.trim()) { setMsg({ tone: 'amber', text: 'Enter your email address first.' }); return }
    setBusy(true); setMsg(null)
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase())
      // Deliberately the same answer either way, so accounts cannot be enumerated (§10).
      setMsg({ tone: 'green', text: 'If that address has an account, a reset link is on its way.' })
    } catch {
      setMsg({ tone: 'green', text: 'If that address has an account, a reset link is on its way.' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-navy" aria-hidden />
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10 text-paper">
        <div className="flex justify-center"><Crest className="h-20 w-20 text-gold" /></div>
        <div className="mt-6 stamp-text text-center text-gold">MFU Go Global</div>
        <h1 className="mt-1 text-center text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-center text-sm text-paper/70">
          Event staff, or a visitor restoring a passport.
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="text-sm">Email
            <input className="field mt-1" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="text-sm">Password
            <input className="field mt-1" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn-gold mt-1" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="text-xs text-paper/60 underline" disabled={busy} onClick={reset}>
            Forgot your password?
          </button>
        </form>

        {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

        <p className="mt-8 text-center text-xs text-paper/50">
          Booth organizers do not need this — open the link in your invitation email instead.
          <br />
          Lost access to your passport? <Link to="/restore" className="underline">Restore it here</Link>
          <br />
          <Link to="/" className="underline">Back to the passport</Link>
        </p>
      </main>
    </>
  )
}
