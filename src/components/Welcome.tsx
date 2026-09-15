import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTiers } from '../lib/data'
import { useLocale } from '../lib/locale'
import { LangToggle } from './ui'

/**
 * What the app is for, said once, in the reader's language.
 *
 * Two audiences, two cards. A visitor who has just registered sees a four-step sheet the first
 * time the passport opens — scan, collect, rate, claim — with the language toggle inside it,
 * because the person who most needs this is the one who cannot yet read the screen around it.
 * "How it works" on the cover brings it back any time. An exhibitor sees a card on their booth
 * screen explaining why the screen must stay on: every scan is a counted visit, quiet booths
 * can be given more points, and the passport steers visitors to the highest-value booth they
 * have not stamped. It stays until they dismiss it.
 *
 * Both are remembered per account in this browser only. Storage can be missing or throw, so
 * a failure to remember means the card shows again — never that the app breaks.
 */

const OPEN_EVENT = 'mfu-welcome-open'
/** Fired when the welcome is dismissed, so anything that waited for it can reconsider. */
const CLOSED_EVENT = 'mfu-welcome-closed'

/**
 * True while this account still has the welcome to see on this device. The survey nudge waits on
 * it: two sheets at once reads as a broken screen, and the nudge marks its moment as spent the
 * instant it opens, so one shown underneath the welcome would be burnt without being read.
 */
export function welcomePending(uid: string | null | undefined): boolean {
  return !!uid && !remembered(`mfu-welcome:${uid}`)
}

/** Reopen the visitor welcome from anywhere (the cover's "How it works" link). */
export function openWelcome() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function VisitorWelcome() {
  const { t } = useLocale()
  const { user, profile } = useAuth()
  const tiers = useTiers().filter((x) => x.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const [open, setOpen] = useState(false)
  const uid = user?.uid ?? null

  // First time this account opens the passport on this phone.
  useEffect(() => {
    if (!uid || !profile) return
    if (!remembered(`mfu-welcome:${uid}`)) setOpen(true)
  }, [uid, profile])

  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  if (!open || !profile) return null
  const threshold = tiers[0]?.thresholdPoints ?? 100
  const close = () => { if (uid) remember(`mfu-welcome:${uid}`); setOpen(false); window.dispatchEvent(new Event(CLOSED_EVENT)) }

  const steps: Array<[string, string, string]> = [
    ['📷', t('v.welcome.s1Title'), t('v.welcome.s1Text')],
    ['🎁', t('v.welcome.s2Title', { n: threshold }), t('v.welcome.s2Text', { n: threshold })],
    ['⭐', t('v.welcome.s3Title'), t('v.welcome.s3Text')],
    ['🧭', t('v.welcome.s4Title'), t('v.welcome.s4Text')],
  ]

  return (
    <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4 sm:items-center" onClick={close}>
      <div role="dialog" aria-label={t('v.welcome.title')}
        className="card card-static sheet-in max-h-[90vh] w-full max-w-md overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="stamp-text text-sky-900">{t('v.welcome.eyebrow')}</div>
            <h2 className="mt-1 text-xl font-bold leading-snug">{t('v.welcome.title')}</h2>
          </div>
          {/* The one place the toggle must be: a reader who cannot follow this sheet cannot
              find the toggle behind it either. */}
          <LangToggle className="seg-floating shrink-0" />
        </div>
        <p className="mt-2 text-sm text-ink-soft">{t('v.welcome.lead')}</p>
        <ol className="mt-4 space-y-3">
          {steps.map(([icon, title, text], i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-100 text-xl" aria-hidden>{icon}</span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{title}</span>
                <span className="block text-sm text-ink-soft">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-ink-soft">{t('v.welcome.free')}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary flex-1 py-3 text-base" onClick={close}>{t('v.welcome.start')}</button>
          <Link to="/scan" className="btn-gold flex-1 py-3 text-base" onClick={close}>{t('v.welcome.scanNow')}</Link>
        </div>
      </div>
    </div>
  )
}

/** A text link for the cover: reopens the sheet above. */
export function HowItWorksLink({ className = '' }: { className?: string }) {
  const { t } = useLocale()
  return (
    <button type="button" className={`text-sm text-ink-soft underline ${className}`} onClick={openWelcome}>
      {t('v.welcome.howItWorks')}
    </button>
  )
}

/**
 * The exhibitor's card: why the booth screen has to stay on. Shown on the booth screen until
 * dismissed on that device — a kiosk tablet is set up once, and the person doing it is the one
 * who needs to read this.
 */
export function OrganizerWelcome({ boothId }: { boothId: string }) {
  const { t } = useLocale()
  const { user } = useAuth()
  const key = `mfu-org-welcome:${user?.uid ?? 'anon'}:${boothId}`
  const [shown, setShown] = useState(() => !remembered(key))
  if (!shown) return null

  const points: Array<[string, string]> = [
    [t('org.welcome.p1Title'), t('org.welcome.p1Text')],
    [t('org.welcome.p2Title'), t('org.welcome.p2Text')],
    [t('org.welcome.p3Title'), t('org.welcome.p3Text')],
    [t('org.welcome.p4Title'), t('org.welcome.p4Text')],
  ]

  return (
    <section className="rounded-2xl border border-sky-800/20 bg-sky-50 p-4 text-ink" aria-label={t('org.welcome.title')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="stamp-text text-sky-900">{t('org.welcome.eyebrow')}</div>
          <h2 className="mt-0.5 text-base font-bold leading-snug">{t('org.welcome.title')}</h2>
        </div>
        <LangToggle className="seg-floating shrink-0" />
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {points.map(([title, text], i) => (
          <li key={i} className="rounded-xl bg-white/80 px-3 py-2">
            <div className="text-sm font-semibold leading-tight">{title}</div>
            <div className="mt-0.5 text-xs text-ink-soft">{text}</div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link to="/booth/stats" className="text-xs underline">{t('org.welcome.stats')}</Link>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { remember(key); setShown(false) }}>{t('org.welcome.dismiss')}</button>
      </div>
    </section>
  )
}

// ---- remembered per account, in this browser ----
function remembered(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}
function remember(key: string) {
  try { localStorage.setItem(key, '1') } catch { /* shows again next time; harmless */ }
}
