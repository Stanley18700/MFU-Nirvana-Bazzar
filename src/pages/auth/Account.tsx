import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, useSignOut } from '../../lib/auth'
import { addPassword, authError, changeEmail, changePassword, hasGoogle, hasPassword, reauthenticate, sendVerification } from '../../lib/authActions'
import { doc } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { ms, useDoc } from '../../lib/data'
import { Notice, Spinner } from '../../components/ui'
import { useLocale } from '../../lib/locale'

const MIN_PASSWORD = 8

/**
 * Signed-in account settings: the address on the account, the password, and the way out.
 *
 * Two grounds. On its own route it is a chrome page reached from the account menu, so it carries a
 * back link. Inside the passport it is the Profile tab — the tab bar is the navigation, the page
 * sits on the sky with the rest of the passport, and a back link would be a second way to leave.
 */
export default function Account({ variant = 'page' }: { variant?: 'page' | 'passport' }) {
  const { ready, user, emailVerified, profile } = useAuth()
  const loc = useLocation()
  const signOut = useSignOut()
  const { t } = useLocale()

  if (!ready) return <Spinner />
  if (!user) return <Navigate to="/signin" state={{ from: '/account' }} replace />

  const inPassport = variant === 'passport'
  // `/` routes by role, so it is the role's own home without a second copy of that table here.
  const back = (loc.state as { from?: string } | null)?.from ?? '/'

  return (
    <>
      {!inPassport && <div className="fixed inset-0 -z-10 bg-chrome" aria-hidden />}
      <main className={inPassport
        ? 'mx-auto max-w-md px-5 pb-8 pt-6 text-ink page-in'
        : 'on-chrome mx-auto min-h-full max-w-md px-5 pb-16 pt-8 page-in'}>
      {!inPassport && (
        <div className="flex items-center justify-between gap-3">
          <Link to={back} className="btn-quiet btn-sm">← {t('account.back')}</Link>
        </div>
      )}
      <h1 className={`text-2xl font-bold ${inPassport ? '' : 'mt-3'}`}>{t('account.title')}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {profile?.displayName ?? user.displayName ?? t('account.signedIn')}
        {profile?.passportNo && <> · <span className="font-mono tracking-widest">{profile.passportNo}</span></>}
      </p>

      <Section title={t('acct.email.title')} note={
        <>{t('acct.email.note')}{' '}
          {emailVerified
            ? <span className="text-success-text">{t('acct.email.confirmed')}</span>
            : <span className="text-danger-text">{t('acct.email.unconfirmed')}</span>}
        </>
      }>
        <div className="text-sm font-medium break-all">{user.email ?? '—'}</div>
        {!emailVerified && <ResendVerification />}
        <ChangeEmail />
      </Section>

      <Section title={t('acct.pw.title')} note={hasPassword(user)
        ? t('acct.pw.noteHas')
        : t('acct.pw.noteGoogle')}>
        {hasPassword(user) ? <ChangePassword /> : <AddPassword />}
      </Section>

      <Section title={t('acct.methods.title')}>
        <ul className="flex flex-col gap-1 text-sm">
          <li>{hasGoogle(user) ? '✓' : '—'} {t('acct.methods.google')}</li>
          <li>{hasPassword(user) ? '✓' : '—'} {t('acct.methods.password')}</li>
        </ul>
      </Section>

      <Section title={t('acct.leaving.title')} note={t('acct.leaving.note')}>
        <button className="btn-ghost w-full" onClick={() => void signOut()}>{t('acct.leaving.signOut')}</button>
        <EraseData />
      </Section>
    </main>
    </>
  )
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mt-5 flex flex-col gap-3">
      <div>
        <h2 className="stamp-text text-ink-soft">{title}</h2>
        {note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function ResendVerification() {
  const { t } = useLocale()
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {state === 'sent'
        ? <Notice tone="green">{t('acct.email.sent')}</Notice>
        : <button className="btn-ghost" disabled={state === 'busy'} onClick={async () => {
            setState('busy'); setErr(null)
            try { await sendVerification(auth.currentUser!); setState('sent') } catch (e) { setErr(authError(e)); setState('idle') }
          }}>{state === 'busy' ? t('acct.email.sending') : t('acct.email.sendAgain')}</button>}
      {err && <Notice tone="red">{err}</Notice>}
    </div>
  )
}

function ChangeEmail() {
  const { t } = useLocale()
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
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>{t('acct.email.change')}</button>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-ink-soft">{t('acct.email.new')}</span>
        <input className="field mt-1" type="email" required inputMode="email" autoComplete="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {needsPassword && (
        <label className="block">
          <span className="stamp-text text-ink-soft">{t('acct.pw.current')}</span>
          <input className="field mt-1" type="password" required autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      )}
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('acct.email.sending') : t('acct.email.send')}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function ChangePassword() {
  const { t } = useLocale()
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
    if (next !== confirm) { setErr(t('acct.pw.mismatch')); return }
    setBusy(true)
    try {
      await changePassword(auth.currentUser!, current, next)
      setDone(true); setOpen(false); setCurrent(''); setNext(''); setConfirm('')
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {done && <Notice tone="green">{t('acct.pw.changed')}</Notice>}
        <button className="btn-ghost" onClick={() => { setOpen(true); setDone(false) }}>{t('acct.pw.change')}</button>
        <Link to="/forgot-password" className="link text-xs text-ink-soft hover:text-ink">{t('acct.pw.forgot')}</Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-ink-soft">{t('acct.pw.current')}</span>
        <input className="field mt-1" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block">
        <span className="stamp-text text-ink-soft">{t('acct.pw.new')}</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block">
        <span className="stamp-text text-ink-soft">{t('acct.pw.confirm')}</span>
        <input className="field mt-1" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('common.saving') : 'Save'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function AddPassword() {
  const { t } = useLocale()
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

  if (done) return <Notice tone="green">{t('acct.pw.added')}</Notice>
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>{t('acct.pw.add')}</button>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t rule pt-3">
      <label className="block">
        <span className="stamp-text text-ink-soft">{t('acct.pw.new')}</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('common.saving') : 'Add it'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
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
  const { t, locale } = useLocale()
  const { user } = useAuth()
  const { data: req, loading } = useDoc<{ status: string; requestedAt: unknown }>(user ? doc(db, 'erasureRequests', user.uid) : null, [user?.uid], 'your erasure request')
  const [state, setState] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [err, setErr] = useState<string | null>(null)

  if (req) {
    const when = ms(req.requestedAt)
    // The date follows the language too — a Thai reader gets Thai month names.
    const date = when
      ? new Date(when).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })
      : null
    return (
      <Notice tone="amber">
        {t('acct.erase.requested', { date: date ? t('acct.erase.on', { date }) : '' })}
      </Notice>
    )
  }
  if (state === 'idle') return <button className="btn-quiet btn-sm" disabled={loading} onClick={() => setState('confirm')}>{t('acct.erase.ask')}</button>
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
        }}>{state === 'busy' ? t('acct.email.sending') : t('acct.erase.request')}</button>
        <button className="btn-ghost" disabled={state === 'busy'} onClick={() => setState('idle')}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}
