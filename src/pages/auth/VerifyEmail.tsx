import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, sendVerification } from '../../lib/authActions'
import { auth } from '../../lib/firebase'
import { Spinner } from '../../components/ui'
import { AuthShell, DarkNotice } from './parts'

const COOLDOWN = 45

/**
 * The waiting room for an unverified email/password account. Firebase Auth's
 * "Email address verification" template sends the link; this page polls until it is clicked,
 * so verifying in the mail app's own browser still unblocks the tab left open here.
 */
export default function VerifyEmail() {
  const { ready, user, emailVerified, reloadUser, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from
  const [left, setLeft] = useState(COOLDOWN)
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checking = useRef(false)

  const check = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    try { await reloadUser() } catch { /* offline — the next tick retries */ } finally { checking.current = false }
  }, [reloadUser])

  useEffect(() => {
    if (!user || emailVerified) return
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [user, emailVerified, check])

  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [left])

  if (!ready) return <Spinner label="Checking your account…" />
  if (!user) return <Navigate to="/signin" replace />
  if (emailVerified) return <Navigate to={from ?? '/'} replace />

  async function resend() {
    setBusy(true); setErr(null); setNote(null)
    try {
      await sendVerification(auth.currentUser!)
      setNote('Sent. Give it a minute, then check your spam folder too.')
      setLeft(COOLDOWN)
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  async function useAnother() {
    await signOut()
    nav('/signup', { replace: true })
  }

  return (
    <AuthShell
      back={null}
      title="Confirm your email"
      lead={<>We sent a link to <b className="text-paper">{user.email}</b>. Tap it and your passport opens.</>}
    >
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-paper/10 px-4 py-3 text-sm text-paper/70">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-paper/25 border-t-gold" />
          Waiting for you to tap the link — this page moves on by itself.
        </div>

        {note && <DarkNotice tone="green">{note}</DarkNotice>}
        {err && <DarkNotice tone="red">{err}</DarkNotice>}

        <button className="btn-gold py-3.5" onClick={check}>I have tapped it — continue</button>
        <button className="btn-ghost bg-paper/10 text-paper hover:bg-paper/20" onClick={resend} disabled={busy || left > 0}>
          {busy ? 'Sending…' : left > 0 ? `Send it again in ${left}s` : 'Send the link again'}
        </button>

        <p className="pt-2 text-xs text-paper/45">
          Typed the address wrong?{' '}
          <button className="underline hover:text-paper/70" onClick={useAnother}>Start again with another email</button>.
        </p>
      </div>
    </AuthShell>
  )
}
