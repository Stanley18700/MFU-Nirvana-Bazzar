import { useState, type FormEvent } from 'react'
import { EmailAuthProvider, linkWithCredential, updatePassword } from 'firebase/auth'
import { useAuth } from '../lib/auth'
import { api, errorMessage } from '../lib/api'
import { Notice } from './ui'

/**
 * `bootstrapAdmin` (§6, `/setup`) upgrades the *anonymous* account of whichever browser claimed
 * it, and is one-shot. So the first admin's access lives in one browser's local storage: clear
 * site data and it is gone, with no way to bootstrap again.
 *
 * Linking an email/password credential onto that same account fixes it without any server call
 * — the uid, the custom claim and the `users/{uid}` document are all untouched, the account
 * simply stops being anonymous and gains a second way in. Renders only while it is needed.
 */
export function PermanentLogin() {
  const { user, role, profile, refreshClaims } = useAuth()
  const [email, setEmail] = useState(profile?.contact?.includes('@') ? profile.contact : '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null)
  const [done, setDone] = useState(false)

  if (!user) return null
  if (done) {
    return (
      <section className="mt-4">
        <Notice tone="green">
          Done — this account now signs in with <b>{email.trim().toLowerCase()}</b> at
          {' '}<code>/signin</code>, on any device. Same account, same role, same history.
          Write the password down somewhere safe: it is the way back in if this browser is cleared.
        </Notice>
      </section>
    )
  }
  // Nothing to fix once the account has a real credential on it.
  if (!user.isAnonymous) return null
  const account = user // narrowed for the handler below

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setMsg({ tone: 'amber', text: 'The two passwords do not match.' }); return }
    if (password.length < 10) { setMsg({ tone: 'amber', text: 'Use at least 10 characters — this login controls the whole event.' }); return }
    setBusy(true); setMsg(null)
    const addr = email.trim().toLowerCase()
    try {
      const cred = EmailAuthProvider.credential(addr, password)
      await linkWithCredential(account, cred)
      // Keep the profile's contact in step so the panel and the audit log agree.
      try { await api.updateUser({ uid: account.uid, contact: addr }) } catch { /* cosmetic only */ }
      await refreshClaims()
      setDone(true)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/email-already-in-use') {
        setMsg({ tone: 'red', text: 'That email already has an account. Sign in with it at /signin instead, or use a different address here.' })
      } else if (code === 'auth/requires-recent-login') {
        // Already linked in this browser; just set the password.
        try { await updatePassword(account, password); setDone(true) } catch (e2) { setMsg({ tone: 'red', text: errorMessage(e2) }) }
      } else {
        setMsg({ tone: 'red', text: (err as Error).message })
      }
    } finally { setBusy(false) }
  }

  return (
    <section className="mt-4 rounded-2xl border-2 border-amber/50 bg-amber/5 p-4">
      <h2 className="stamp-text text-amber">Your {role} access is tied to this browser</h2>
      <p className="mt-2 text-sm text-navy-soft">
        You claimed it at <code>/setup</code>, which upgrades the anonymous account of the browser
        that used the key — and that key only works once. If this browser's site data is cleared
        you lose the panel with no way back in. Add an email and password to make this same account
        permanent: the account, its role and its history are kept, it just gains a way to sign in
        from any device at <code>/signin</code>.
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Email
          <input className="field mt-1" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mfu.ac.th" />
        </label>
        <label className="text-sm">Password
          <input className="field mt-1" type="password" autoComplete="new-password" required minLength={10}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="text-sm">Repeat password
          <input className="field mt-1" type="password" autoComplete="new-password" required minLength={10}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button className="btn-primary" disabled={busy || !email.trim() || !password || !confirm}>
            {busy ? 'Linking…' : 'Make this login permanent'}
          </button>
        </div>
      </form>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </section>
  )
}
