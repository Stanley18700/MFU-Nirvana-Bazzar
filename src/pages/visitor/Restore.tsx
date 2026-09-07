import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth, APP_ORIGIN } from '../../lib/firebase'
import { Notice } from '../../components/ui'

/**
 * §4.1 — restore a passport on a new device.
 *
 * This goes through Firebase Auth's own password-reset email, not the EmailJS mailer, for two
 * reasons. It works with nothing to configure, so a visitor is never told "check your email"
 * when no mail can actually be sent; and because `join` links an email credential onto the
 * visitor's original anonymous account (see lib/linkEmail.ts), resetting the password signs
 * them back into *that* account — the one holding their stamps — rather than a new one.
 */
export default function Restore() {
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await sendPasswordResetEmail(auth, contact.trim().toLowerCase(), {
        url: `${APP_ORIGIN}/signin`,
        handleCodeInApp: false,
      })
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      // Any other outcome would say whether the address is registered (§10 — no enumeration).
      if (code === 'auth/invalid-email') { setErr('That does not look like an email address.'); setBusy(false); return }
      if (code === 'auth/too-many-requests') { setErr('Too many attempts. Wait a few minutes and try again.'); setBusy(false); return }
    }
    setSent(true); setBusy(false)
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-8 page-in">
      <Link to="/" className="text-sm text-navy-soft">← Back</Link>
      <h1 className="mt-3 text-2xl font-bold">Restore my passport</h1>
      <p className="mt-1 text-sm text-navy-soft">
        Registered on another phone, or cleared your browser? Enter the email you registered with.
        We will email you a link to set a password, and signing in with it opens your passport
        here — stamps and points included.
      </p>

      {sent ? (
        <div className="mt-6 flex flex-col gap-3">
          <Notice tone="green">
            If that email has a passport, a link is on its way. Open it, choose a password, then
            come back and sign in.
          </Notice>
          <Link to="/signin" className="btn-primary">Go to sign in</Link>
          <p className="text-xs text-navy-soft">
            Nothing arrived? Check your spam folder, or ask at the welcome desk — staff can look
            you up and re-issue your passport.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="text-sm">Email you registered with
            <input className="field mt-1" type="email" autoComplete="username" required
              placeholder="you@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          {err && <Notice tone="red">{err}</Notice>}
          <button className="btn-primary" disabled={busy || !contact.trim()}>
            {busy ? 'Sending…' : 'Email me a link'}
          </button>
          <p className="text-xs text-navy-soft">
            Registered with a phone number instead? Ask at the welcome desk — staff can look you up.
          </p>
        </form>
      )}
    </main>
  )
}
