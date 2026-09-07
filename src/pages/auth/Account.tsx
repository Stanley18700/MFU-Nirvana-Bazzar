import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { addPassword, authError, changeEmail, changePassword, hasGoogle, hasPassword, reauthenticate, sendVerification } from '../../lib/authActions'
import { doc } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { ms, useDoc } from '../../lib/data'
import { Notice, Spinner } from '../../components/ui'

const MIN_PASSWORD = 8

/** Signed-in account settings: the address on the account, the password, and the way out. */
export default function Account() {
  const { ready, user, emailVerified, profile, role, signOut } = useAuth()
  const nav = useNavigate()

  if (!ready) return <Spinner />
  if (!user) return <Navigate to="/signin" state={{ from: '/account' }} replace />

  const home = role === 'admin' ? '/admin' : role === 'organizer' ? '/booth' : '/passport'

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-8 page-in">
      <Link to={home} className="text-sm text-navy-soft">← Back</Link>
      <h1 className="mt-3 text-2xl font-bold">Your account</h1>
      <p className="mt-1 text-sm text-navy-soft">
        {profile?.displayName ?? user.displayName ?? 'Signed in'}
        {profile?.passportNo && <> · <span className="font-mono tracking-widest">{profile.passportNo}</span></>}
      </p>

      <Section title="Email address" note={
        <>Signing in and every notice go to this address.{' '}
          {emailVerified
            ? <span className="text-jade">Confirmed.</span>
            : <span className="text-vermilion">Not confirmed yet.</span>}
        </>
      }>
        <div className="text-sm font-medium break-all">{user.email ?? '—'}</div>
        {!emailVerified && <ResendVerification />}
        <ChangeEmail />
      </Section>

      <Section title="Password" note={hasPassword(user)
        ? 'Used together with your email to sign in.'
        : 'You sign in with Google. Add a password if you also want to sign in without it.'}>
        {hasPassword(user) ? <ChangePassword /> : <AddPassword />}
      </Section>

      <Section title="Sign-in methods">
        <ul className="flex flex-col gap-1 text-sm">
          <li>{hasGoogle(user) ? '✓' : '—'} Google</li>
          <li>{hasPassword(user) ? '✓' : '—'} Email and password</li>
        </ul>
      </Section>

      <Section title="Leaving" note="Signing out keeps your passport safe on the server. Sign back in on any phone to open it again.">
        <button className="btn-ghost w-full" onClick={async () => { await signOut(); nav('/', { replace: true }) }}>Sign out</button>
        <EraseData />
      </Section>
    </main>
  )
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mt-5 flex flex-col gap-3">
      <div>
        <h2 className="stamp-text text-navy-soft">{title}</h2>
        {note && <p className="mt-1 text-xs text-navy-soft">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function ResendVerification() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {state === 'sent'
        ? <Notice tone="green">Confirmation link sent. Tap it, then reopen this page.</Notice>
        : <button className="btn-ghost" disabled={state === 'busy'} onClick={async () => {
            setState('busy'); setErr(null)
            try { await sendVerification(auth.currentUser!); setState('sent') } catch (e) { setErr(authError(e)); setState('idle') }
          }}>{state === 'busy' ? 'Sending…' : 'Send the confirmation link again'}</button>}
      {err && <Notice tone="red">{err}</Notice>}
    </div>
  )
}

function ChangeEmail() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const needsPassword = hasPassword(user)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      // Reauthenticate first: Firebase rejects an address change on a stale session, and the
      // helper picks the right proof — the password for a password account, the Google popup otherwise.
      await reauthenticate(auth.currentUser!, current || undefined)
      await changeEmail(auth.currentUser!, email)
      setSent(true)
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  if (sent) {
    return (
      <Notice tone="green">
        We sent a confirmation link to <b>{email}</b>. The account keeps its current address until that link is tapped —
        so a typo cannot lock you out. You will be signed out once it changes.
      </Notice>
    )
  }
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>Change my email address</button>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-navy-soft">New email</span>
        <input className="field mt-1" type="email" required inputMode="email" autoComplete="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {needsPassword && (
        <label className="block">
          <span className="stamp-text text-navy-soft">Current password</span>
          <input className="field mt-1" type="password" required autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      )}
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Sending…' : 'Send the confirmation'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (next.length < MIN_PASSWORD) { setErr(`Pick a password of at least ${MIN_PASSWORD} characters.`); return }
    if (next !== confirm) { setErr('The two passwords do not match.'); return }
    setBusy(true)
    try {
      await changePassword(auth.currentUser!, current, next)
      setDone(true); setOpen(false); setCurrent(''); setNext(''); setConfirm('')
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {done && <Notice tone="green">Password changed.</Notice>}
        <button className="btn-ghost" onClick={() => { setOpen(true); setDone(false) }}>Change my password</button>
        <Link to="/forgot-password" className="text-xs text-navy-soft underline">Forgotten it? Send a reset link instead</Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-navy-soft">Current password</span>
        <input className="field mt-1" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block">
        <span className="stamp-text text-navy-soft">New password</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block">
        <span className="stamp-text text-navy-soft">Confirm new password</span>
        <input className="field mt-1" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function AddPassword() {
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (next.length < MIN_PASSWORD) { setErr(`Pick a password of at least ${MIN_PASSWORD} characters.`); return }
    setBusy(true)
    try { await addPassword(auth.currentUser!, next); setDone(true); setOpen(false); setNext('') }
    catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  if (done) return <Notice tone="green">Password added. You can now sign in with your email as well as with Google.</Notice>
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>Add a password</button>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-navy-soft">New password</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Add it'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

/**
 * §10 — the PDPA erasure request. The request document is read back, so a filed request is
 * shown (with its date) instead of the button on every device, and a failed call is reported
 * rather than dressed up as success.
 */
function EraseData() {
  const { user } = useAuth()
  const { data: req, loading } = useDoc<{ status: string; requestedAt: unknown }>(user ? doc(db, 'erasureRequests', user.uid) : null, [user?.uid], 'your erasure request')
  const [state, setState] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [err, setErr] = useState<string | null>(null)

  if (req) {
    const when = ms(req.requestedAt)
    const date = when ? new Date(when).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : null
    return (
      <Notice tone="amber">
        Erasure requested{date ? ` on ${date}` : ''}. The organisers will delete your account; you can keep using your passport until then.
      </Notice>
    )
  }
  if (state === 'idle') return <button className="text-xs text-navy-soft underline" disabled={loading} onClick={() => setState('confirm')}>Ask for my data to be deleted</button>
  return (
    <div className="flex flex-col gap-2">
      <Notice tone="amber">
        What happens next: the organisers see your request in the admin console and delete your registration,
        your stamps and your sign-in account. Booth totals stay — they hold nothing about you. You will be
        signed out when it is done. This cannot be undone.
      </Notice>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-danger flex-1" disabled={state === 'busy'} onClick={async () => {
          setState('busy'); setErr(null)
          try { await api.requestErasure({}) } catch (e) { setErr(errorMessage(e)); setState('confirm') }
        }}>{state === 'busy' ? 'Sending…' : 'Request erasure'}</button>
        <button className="btn-ghost" disabled={state === 'busy'} onClick={() => setState('idle')}>Cancel</button>
      </div>
    </div>
  )
}
