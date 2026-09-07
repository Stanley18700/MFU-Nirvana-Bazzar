import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authError, sendReset } from '../../lib/authActions'
import { useCooldown } from '../../lib/useCooldown'
import { AuthShell, DarkNotice, Field } from './parts'

const COOLDOWN = 45

/** Fires Firebase Auth's "Password reset" template; the link lands on /auth/action. */
export default function ForgotPassword() {
  const loc = useLocation()
  const [email, setEmail] = useState((loc.state as { email?: string } | null)?.email ?? '')
  const [sent, setSent] = useState(false)
  const [again, setAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { left, start } = useCooldown(COOLDOWN)

  /** One send; shared by the form and the "Send it again" button, which used to only reopen the form. */
  async function send(): Promise<boolean> {
    setBusy(true); setErr(null)
    try {
      await sendReset(email)
      start()
      return true
    } catch (e) {
      const code = (e as { code?: string }).code
      // Never confirm whether an address is registered — that would let anyone enumerate visitors.
      if (code === 'auth/user-not-found') { start(); return true }
      setErr(authError(e))
      return false
    } finally { setBusy(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await send()) { setSent(true); setAgain(false) }
  }

  async function resend() {
    setAgain(false)
    if (await send()) setAgain(true)
  }

  return (
    <AuthShell
      back="/signin"
      title="Reset your password"
      lead="Enter the email on your account and we will send a link that lets you set a new password."
      foot={<>Remembered it? <Link to="/signin" className="font-semibold text-gold underline">Sign in</Link></>}
    >
      {sent ? (
        <div className="mt-6 flex flex-col gap-4">
          <DarkNotice tone="green">
            If <b>{email}</b> has an account, a reset link is on its way. It is good for one hour.
          </DarkNotice>
          {again && <DarkNotice tone="green">Sent again.</DarkNotice>}
          {err && <DarkNotice tone="red">{err}</DarkNotice>}
          <p className="text-sm text-paper/60">Nothing after a minute or two? Check the spam folder, then send it again.</p>
          <button className="btn-ghost bg-paper/10 text-paper hover:bg-paper/20" onClick={resend} disabled={busy || left > 0}>
            {busy ? 'Sending…' : left > 0 ? `Send it again in ${left}s` : 'Send it again'}
          </button>
          <p className="text-xs text-paper/45">
            Wrong address?{' '}
            <button className="underline hover:text-paper/70" onClick={() => { setSent(false); setAgain(false); setErr(null) }}>Use a different email</button>.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field label="Email" type="email" required autoComplete="email" inputMode="email"
            placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {err && <DarkNotice tone="red">{err}</DarkNotice>}
          <button className="btn-gold py-3.5 text-lg" disabled={busy}>{busy ? 'Sending…' : 'Send the reset link'}</button>
          <p className="text-xs text-paper/45">Signed up with Google? You have no password to reset — use “Continue with Google” on the sign-in page.</p>
        </form>
      )}
    </AuthShell>
  )
}
