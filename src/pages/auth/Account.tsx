import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth, useSignOut } from '../../lib/auth'
import { addPassword, authError, changeEmail, changePassword, hasGoogle, hasPassword, reauthenticate, sendVerification } from '../../lib/authActions'
import { doc } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import { api, errorMessage } from '../../lib/api'
import { ms, useDoc } from '../../lib/data'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { FestivalBackdrop } from './parts'
import { useLocale } from '../../lib/locale'
import { ROLE_LABEL } from '../../lib/labels'

const MIN_PASSWORD = 8

/**
 * Signed-in account settings: the address on the account, the password, and the way out.
 *
 * Two grounds. On its own route it is a chrome page reached from the account menu, so it carries a
 * back link. Inside the passport it is the Profile tab — the tab bar is the navigation, the page
 * sits on the sky with the rest of the passport, and a back link would be a second way to leave.
 */
export default function Account({ variant = 'page' }: { variant?: 'page' | 'passport' }) {
  const { ready, user, emailVerified, profile, role } = useAuth()
  const loc = useLocation()
  const signOut = useSignOut()
  const { t } = useLocale()

  if (!ready) return <Spinner page />
  if (!user) return <Navigate to="/signin" state={{ from: '/account' }} replace />

  const inPassport = variant === 'passport'
  // `/` routes by role, so it is the role's own home without a second copy of that table here.
  const back = (loc.state as { from?: string } | null)?.from ?? '/'

  return (
    <>
      {/*
        * One account page, one ground. An admin or an organizer opens this on its own route, so it
        * brings the festival backdrop the passport shell already puts behind the Profile tab —
        * `hills={false}` for the same reason the shell uses it, the page runs to the foot.
        *
        * It used to be chrome and glass here and sky and paper there: the same settings, in two
        * visual systems, depending only on which door you came through.
        */}
      {!inPassport && <FestivalBackdrop hills={false} />}
      <main className={inPassport
        ? 'mx-auto max-w-md px-5 pb-8 pt-6 text-ink page-in'
        : 'mx-auto min-h-full max-w-md px-5 pb-16 pt-6 text-ink page-in'}>
        {!inPassport && <div className="mb-4"><BackLink to={back} label={t('account.back')} /></div>}

        <Identity
          name={profile?.displayName ?? user.displayName ?? t('account.signedIn')}
          passportNo={profile?.passportNo}
          role={role}
          email={user.email}
        />

        {/*
          * One sheet of rows, not four cards each holding one grey pill. Nothing was being grouped
          * by those cards — they were a settings list wearing boxes — and four identical
          * full-width buttons gave a routine email edit the same weight as ending the session.
          * Each row now says what it holds and what state it is in, and opens where it stands.
          */}
        <div className="card card-flush mt-5">
          <Row
            title={t('acct.email.title')} value={user.email ?? '—'}
            status={emailVerified ? t('acct.email.ok') : t('acct.email.pending')}
            tone={emailVerified ? 'text-success-text' : 'text-warn-text'}
          >
            {(close) => (
              <>
                <p className="text-xs text-ink-soft">{t('acct.email.note')}</p>
                {!emailVerified && <ResendVerification />}
                <ChangeEmail close={close} />
              </>
            )}
          </Row>

          <Row
            title={t('acct.pw.title')}
            value={hasPassword(user) ? t('acct.pw.noteHas') : t('acct.pw.noteGoogle')}
            status={hasPassword(user) ? undefined : t('acct.pw.none')}
          >
            {(close) => (hasPassword(user) ? <ChangePassword close={close} /> : <AddPassword close={close} />)}
          </Row>

          {/* No disclosure: there is nothing to open. It is two facts, so it is two rows of facts. */}
          <div className="border-t rule px-5 py-4">
            <div className="text-sm font-semibold">{t('acct.methods.title')}</div>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs">
              {([[t('acct.methods.google'), hasGoogle(user)], [t('acct.methods.password'), hasPassword(user)]] as const).map(([label, on]) => (
                <li key={label} className="flex items-center justify-between gap-3">
                  <span className="text-ink">{label}</span>
                  <span className={on ? 'font-medium text-success-text' : 'text-ink-soft'}>{on ? t('acct.methods.on') : t('acct.methods.off')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Out of the sheet: leaving is not another setting, and the two ways of leaving are not
            the same size. Erasure keeps the quietest treatment on the page — it is irreversible. */}
        <div className="mt-6 flex flex-col gap-3">
          {/* `btn-ghost` is a 6%-ink wash, which on the passport's own sky read as a disabled strip rather
              than a control. The raised white pill is the same one the landing page uses for "I already
              have a passport" — plainly pressable, and still quieter than anything primary. */}
          <button className="btn-quiet w-full py-3 text-base font-semibold text-ink shadow-raised" onClick={() => void signOut()}>{t('acct.leaving.signOut')}</button>
          <p className="text-center text-xs text-ink-soft">{t('acct.leaving.note')}</p>
          <div className="mt-3 flex justify-center"><EraseData /></div>
        </div>
      </main>
    </>
  )
}

/**
 * Who you are, on whichever ground the page is standing on.
 *
 * A printed board on the sky, the same object the Cover opens with, so the page belongs to the
 * passport rather than reading as a generic settings screen — and so an organizer's account page
 * and a visitor's are recognisably the same page.
 */
function Identity({ name, passportNo, role, email, className = '' }: {
  name: string
  passportNo?: string
  role: string | null
  email: string | null
  className?: string
}) {
  const body = (
    <>
      <div className="stamp-text text-foil">Mae Fah Luang University</div>
      <div className="mt-1 truncate text-2xl font-bold text-white">{name}</div>
      {passportNo
        ? <div className="mt-1 font-mono text-sm tracking-[0.2em] text-foil">{passportNo}</div>
        : role && <div className="mt-1 text-sm text-on-chrome-soft">{ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}</div>}
      {email && <div className="mt-3 truncate text-xs text-on-chrome-soft">{email}</div>}
    </>
  )
  return (
    <div className={`relative isolate overflow-hidden rounded-[28px] bg-chrome px-5 py-5 shadow-float ${className}`}>
      {/* The cover's own mountains, behind the board at the same strength. */}
      <img
        src="/brand/illus-campus-papercut.webp" alt="" aria-hidden
        className="pointer-events-none absolute -bottom-4 left-0 -z-10 w-full opacity-[0.16]"
        style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 45%)', maskImage: 'linear-gradient(to bottom, transparent, #000 45%)' }}
      />
      {body}
    </div>
  )
}

/**
 * One setting: what it is, what it currently says, and the state it is in — then the controls,
 * where the row stands. `reveal-host` gives it the same drop the disclosures elsewhere have.
 */
function Row({ title, value, status, tone = 'text-ink-soft', children }: {
  title: string
  value?: ReactNode
  status?: string
  tone?: string
  children: (close: () => void) => ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => { if (ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus() } }
  return (
    <details ref={ref} className="reveal-host border-t rule first:border-t-0">
      <summary className="press-row flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-ink/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-700/40">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {value && <span className="mt-0.5 block truncate text-xs text-ink-soft">{value}</span>}
        </span>
        {status && <span className={`shrink-0 text-xs font-medium ${tone}`}>{status}</span>}
        <span aria-hidden className="shrink-0 text-[10px] text-ink-soft transition-transform duration-150 [[open]_&]:rotate-180">▾</span>
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">{children(close)}</div>
    </details>
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

function ChangeEmail({ close }: { close: () => void }) {
  const { t } = useLocale()
  const { user } = useAuth()
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
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.email.new')}</span>
        <input className="field mt-1" type="email" required inputMode="email" autoComplete="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {needsPassword && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.pw.current')}</span>
          <input className="field mt-1" type="password" required autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
      )}
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('acct.email.sending') : t('acct.email.send')}</button>
        <button type="button" className="btn-ghost" onClick={close}>{t('common.cancel')}</button>
      </div>
    </form>
  )
}

function ChangePassword({ close }: { close: () => void }) {
  const { t } = useLocale()
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
      setDone(true); setCurrent(''); setNext(''); setConfirm('')
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  return (
    <>
    {done && <Notice tone="green">{t('acct.pw.changed')}</Notice>}
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.pw.current')}</span>
        <input className="field mt-1" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.pw.new')}</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.pw.confirm')}</span>
        <input className="field mt-1" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('common.saving') : 'Save'}</button>
        <button type="button" className="btn-ghost" onClick={close}>{t('common.cancel')}</button>
      </div>
    </form>
    <Link to="/forgot-password" className="link text-xs text-ink-soft hover:text-ink">{t('acct.pw.forgot')}</Link>
    </>
  )
}

function AddPassword({ close }: { close: () => void }) {
  const { t } = useLocale()
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (next.length < MIN_PASSWORD) { setErr(`Pick a password of at least ${MIN_PASSWORD} characters.`); return }
    setBusy(true)
    try { await addPassword(auth.currentUser!, next); setDone(true); setNext('') }
    catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  if (done) return <Notice tone="green">{t('acct.pw.added')}</Notice>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-soft">{t('acct.pw.new')}</span>
        <input className="field mt-1" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {err && <Notice tone="red">{err}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy ? t('common.saving') : 'Add it'}</button>
        <button type="button" className="btn-ghost" onClick={close}>{t('common.cancel')}</button>
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
