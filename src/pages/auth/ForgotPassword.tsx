import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authError, sendReset } from '../../lib/authActions'
import { AuthShell, DarkNotice, Field } from './parts'

/** Fires Firebase Auth's "Password reset" template; the link lands on /auth/action. */
export default function ForgotPassword() {
  const loc = useLocation()
  const [email, setEmail] = useState((loc.state as { email?: string } | null)?.email ?? '')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await sendReset(email)
      setSent(true)
    } catch (e) {
      const code = (e as { code?: string }).code
      // Never confirm whether an address is registered — that would let anyone enumerate visitors.
      if (code === 'auth/user-not-found') setSent(true)
      else setErr(authError(e))
    } finally { setBusy(false) }
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
          <p className="text-sm text-paper/60">Nothing after a minute or two? Check the spam folder, then try again.</p>
          <button className="btn-ghost bg-paper/10 text-paper hover:bg-paper/20" onClick={() => setSent(false)}>Send it again</button>
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
