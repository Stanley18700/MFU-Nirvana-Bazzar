import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Notice } from '../../components/ui'

/** §4.1 — restore a passport on a new device via an emailed sign-in link. */
export default function Restore() {
  const nav = useNavigate()
  const { refreshClaims } = useAuth()
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return
    const email = window.localStorage.getItem('restoreEmail') || window.prompt('Confirm the email you used to register') || ''
    if (!email) return
    setBusy(true)
    signInWithEmailLink(auth, email, window.location.href)
      .then(async () => { await refreshClaims(); nav('/passport', { replace: true }) })
      .catch((e) => setErr(errorMessage(e)))
      .finally(() => setBusy(false))
  }, [nav, refreshClaims])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      try { window.localStorage.setItem('restoreEmail', contact.trim().toLowerCase()) } catch { /* private mode */ }
      await api.requestRestore({ contact: contact.trim() })
      setSent(true)
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-8 page-in">
      <Link to="/" className="text-sm text-navy-soft">← Back</Link>
      <h1 className="mt-3 text-2xl font-bold">Restore my passport</h1>
      <p className="mt-1 text-sm text-navy-soft">Registered on another phone? Enter the email you used and we will send a link that opens your passport here, stamps included.</p>
      {sent ? (
        <div className="mt-6"><Notice tone="green">If that contact has a passport, a link is on its way. Open it on this phone.</Notice></div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <input className="field" type="email" required placeholder="you@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
          {err && <Notice tone="red">{err}</Notice>}
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send me the link'}</button>
          <p className="text-xs text-navy-soft">Registered with a phone number? Ask at the welcome desk — staff can look you up.</p>
        </form>
      )}
    </main>
  )
}
