import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { authError } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { AuthShell, Notice, Field } from './parts'

type Mode = 'verifyEmail' | 'resetPassword' | 'recoverEmail' | 'verifyAndChangeEmail'
type Phase = 'working' | 'form' | 'done' | 'error'

const MIN_PASSWORD = 8

/**
 * One page behind all three Firebase Auth mails. Point every template's action URL at
 * `<origin>/auth/action` (Console → Authentication → Templates → the pencil → "customise
 * action URL") and the visitor stays inside the passport instead of bouncing to
 * `firebaseapp.com/__/auth/action`. Leave it unset and Firebase's own page handles it —
 * everything still works, it just looks like someone else's site.
 */
export default function Action() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { reloadUser } = useAuth()
  const mode = params.get('mode') as Mode | null
  const code = params.get('oobCode') ?? ''
  const continueUrl = params.get('continueUrl')

  const [phase, setPhase] = useState<Phase>('working')
  const [err, setErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    async function run() {
      if (!mode || !code) { setErr('This link is incomplete. Open it straight from the email.'); setPhase('error'); return }
      try {
        if (mode === 'resetPassword') {
          const addr = await verifyPasswordResetCode(auth, code)
          if (!alive) return
          setEmail(addr); setPhase('form')
          return
        }
        if (mode === 'recoverEmail') {
          // Someone changed the address on this account; this link puts the old one back.
          const info = await checkActionCode(auth, code)
          await applyActionCode(auth, code)
          if (!alive) return
          setEmail(info.data.email ?? '')
          setPhase('done')
          return
        }
        // verifyEmail and verifyAndChangeEmail are both just "apply it".
        const info = await checkActionCode(auth, code).catch(() => null)
        await applyActionCode(auth, code)
        if (!alive) return
        setEmail(info?.data.email ?? auth.currentUser?.email ?? '')
        await reloadUser().catch(() => undefined)
        // Keep users/{uid}.contact in step with the address the account now carries.
        if (auth.currentUser) await api.syncAccount({}).catch(() => undefined)
        setPhase('done')
      } catch (e) {
        if (!alive) return
        setErr(authError(e)); setPhase('error')
      }
    }
    void run()
    return () => { alive = false }
  }, [mode, code, reloadUser])

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password.length < MIN_PASSWORD) { setErr(`Pick a password of at least ${MIN_PASSWORD} characters.`); return }
    if (password !== confirm) { setErr('The two passwords do not match.'); return }
    setBusy(true)
    try {
      await confirmPasswordReset(auth, code, password)
      setPhase('done')
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  // continueUrl is absolute and on our own origin, but never trust a query parameter with a
  // raw navigation — take the path only, and fall back to the start of the app.
  const goOn = () => {
    let path = '/'
    try { if (continueUrl) path = new URL(continueUrl, window.location.origin).pathname } catch { /* keep '/' */ }
    nav(path, { replace: true })
  }

  if (phase === 'working') return <Spinner label="Checking your link…" />

  if (phase === 'error') {
    return (
      <AuthShell back="/signin" title="That link did not work" lead={err ?? undefined}>
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-sm text-ink-soft">Links are single-use and expire after an hour. Ask for a fresh one.</p>
          <Link to="/forgot-password" className="btn-gold py-3.5">Send a new reset link</Link>
          <Link to="/signin" className="btn-quiet">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  if (mode === 'resetPassword' && phase === 'form') {
    return (
      <AuthShell back={null} title="Choose a new password" lead={<>For <b className="text-ink">{email}</b>.</>}>
        <form onSubmit={submitPassword} className="mt-6 flex flex-col gap-4">
          <Field label="New password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field label="Confirm new password" type="password" required autoComplete="new-password"
            placeholder="Type it once more" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {err && <Notice tone="red">{err}</Notice>}
          <button className="btn-primary py-3.5 text-lg" disabled={busy}>{busy ? 'Saving…' : 'Save the new password'}</button>
        </form>
      </AuthShell>
    )
  }

  const done = {
    resetPassword: {
      title: 'Password changed',
      lead: <>You can sign in with the new password now.</>,
      cta: <Link to="/signin" state={{ email }} className="btn-gold py-3.5">Sign in</Link>,
    },
    verifyEmail: {
      title: 'Email confirmed',
      // The link is often opened in the mail app's own browser, where nobody is signed in.
      lead: auth.currentUser
        ? <><b className="text-ink">{email}</b> is yours. Your passport is open.</>
        : <><b className="text-ink">{email}</b> is confirmed. Sign in here, or go back to the tab where you signed up — it has already moved on.</>,
      cta: auth.currentUser
        ? <button className="btn-gold py-3.5" onClick={goOn}>Open my passport</button>
        : <Link to="/signin" state={{ email }} className="btn-gold py-3.5">Sign in</Link>,
    },
    verifyAndChangeEmail: {
      title: 'Email address changed',
      lead: <>Your account now signs in as <b className="text-ink">{email}</b>. Firebase signs you out everywhere after the swap — sign back in with the new address.</>,
      cta: <Link to="/signin" state={{ email }} className="btn-gold py-3.5">Sign in</Link>,
    },
    recoverEmail: {
      title: 'Address put back',
      lead: <>Your account signs in as <b className="text-ink">{email}</b> again. If you did not ask for that change, reset your password now — someone else may know it.</>,
      cta: <Link to="/forgot-password" state={{ email }} className="btn-gold py-3.5">Reset my password</Link>,
    },
  }[mode as Mode]

  return (
    <AuthShell back={null} title={done.title} lead={done.lead}>
      <div className="mt-6 flex flex-col gap-3">
        {done.cta}
        <Link to="/" className="btn-quiet">Back to the start</Link>
      </div>
    </AuthShell>
  )
}
