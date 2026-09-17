import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useEvent, useTiers } from '../lib/data'
import { useFestivalSurvey } from '../lib/festivalSurvey'
import { useLocale } from '../lib/locale'
import { serverNow } from '../lib/serverClock'
import { EVENT_SURVEY_ID, dayOf, minuteOfDay } from '../../shared/model'
import { welcomePending } from './Welcome'

/**
 * Four moments when a visitor is asked for the festival survey, each once.
 *
 *   `gift`      — the surprise offer, at GIFT_AFTER_STAMPS stamps. This is the one aimed at the
 *                 majority who will never reach the gift threshold and so have no other reason
 *                 to answer: it leads with what they get (a spin of the wheel) rather than with
 *                 what we want. Early on purpose — nearly every visitor reaches two stamps,
 *                 where only a fraction reach five and fewer still reach the threshold.
 *   `stamps`    — the first time the passport holds NUDGE_AFTER_STAMPS stamps: they have seen
 *                 enough to have an opinion and are not yet at the prize desk.
 *   `unlock`    — the moment the gift threshold is reached: the survey now stands between them
 *                 and the gift QR (Prize page), so this says so before they walk to the desk.
 *   `afternoon` — once, at NUDGE_AT_MINUTE on an event day, for whoever has stamps and has not
 *                 answered: the organisers' "2 pm reminder", but only to people who are here.
 *
 * Deliberately not random and never on the scan screen (which lives outside this layout):
 * the app already stops the visitor after every stamp for the booth rating, and a sheet that
 * arrives with no reason is dismissed without being read. Each moment fires once per visitor,
 * remembered in this browser; "Later" ends that moment for good rather than snoozing it.
 *
 * The sheet is a bottom card over a scrim, one tap to dismiss — not a modal that traps focus,
 * because nothing here is required at this point. The requirement lives on the Prize page.
 */
export const NUDGE_AFTER_STAMPS = 5
/** 15:00 Bangkok — after the lunch gap, when the afternoon crowd has settled in. */
export const NUDGE_AT_MINUTE = 15 * 60
/** Two stamps: past the first-scan novelty, still early enough that almost everyone gets here. */
export const GIFT_AFTER_STAMPS = 2

type Moment = 'unlock' | 'gift' | 'stamps' | 'afternoon'

export function SurveyNudge() {
  const { t } = useLocale()
  const { user, profile } = useAuth()
  const event = useEvent()
  const tiers = useTiers().filter((x) => x.active)
  const fs = useFestivalSurvey()
  const loc = useLocation()
  const [open, setOpen] = useState<Moment | null>(null)
  // Bumped when the welcome closes, so the moment we declined to show is reconsidered at once.
  const [welcomeGone, setWelcomeGone] = useState(0)
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 30_000)
    return () => clearInterval(id)
  }, [])

  const uid = user?.uid ?? null
  const stamps = profile?.stampCount ?? 0
  const points = profile?.points ?? 0
  const threshold = tiers.length ? Math.min(...tiers.map((x) => x.thresholdPoints)) : Infinity
  const day = dayOf(new Date(now))
  const afternoon = event.days.includes(day) && minuteOfDay(new Date(now)) >= NUDGE_AT_MINUTE
  // The Prize page is already making the case in full; a second sheet on top of it is noise.
  const onPrize = loc.pathname.startsWith('/passport/prize')

  useEffect(() => {
    if (open || onPrize || !uid || fs.loading || !fs.live || fs.taken || stamps < 1) return
    if (welcomePending(uid)) return
    const due: Moment | null = points >= threshold ? 'unlock'
      : stamps >= GIFT_AFTER_STAMPS && !seen(uid, 'gift') ? 'gift'
      : stamps >= NUDGE_AFTER_STAMPS ? 'stamps'
      : afternoon ? 'afternoon'
      : null
    if (!due || seen(uid, due)) return
    // Marked the moment it is shown: whatever they do with it, this moment does not come back.
    mark(uid, due)
    setOpen(due)
  }, [open, onPrize, uid, fs.loading, fs.live, fs.taken, stamps, points, threshold, afternoon, welcomeGone])

  useEffect(() => {
    const on = () => setWelcomeGone((n) => n + 1)
    window.addEventListener('mfu-welcome-closed', on)
    return () => window.removeEventListener('mfu-welcome-closed', on)
  }, [])

  // Answered elsewhere (or unpublished) while the sheet was up.
  useEffect(() => { if (open && (fs.taken || !fs.live)) setOpen(null) }, [open, fs.taken, fs.live])

  if (!open) return null
  const gift = open === 'gift'
  const lead = open === 'unlock' ? t('v.nudge.unlock')
    : gift ? t('v.nudge.gift', { q: fs.count })
    : open === 'stamps' ? t('v.nudge.stamps', { n: stamps, q: fs.count })
    : t('v.nudge.afternoon', { q: fs.count })
  const title = gift ? t('v.nudge.giftTitle') : t('v.nudge.title')

  return (
    <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-4" onClick={() => setOpen(null)}>
      <div role="dialog" aria-label={title}
        className="card card-static sheet-in max-h-[90dvh] w-full max-w-md overflow-y-auto bg-white p-5"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}>
        {gift && <div className="text-center text-4xl" aria-hidden>🎁</div>}
        <div className={`stamp-text text-sky-900 ${gift ? 'mt-2 text-center' : ''}`}>
          {gift ? t('v.nudge.giftEyebrow') : t('v.prize.feedbackEyebrow')}
        </div>
        <h2 className={`mt-1 text-lg font-semibold leading-snug ${gift ? 'text-center' : ''}`}>{title}</h2>
        <p className={`mt-2 text-sm text-ink-soft ${gift ? 'text-center' : ''}`}>{lead}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={() => setOpen(null)}>{t('v.nudge.later')}</button>
          {/*
            * `?from=gift` is what arms the short hold on the survey's own way out. Only this CTA
            * sets it: someone who chooses the survey from the cover row or the Prize card asked
            * for it themselves and is never held.
            */}
          <Link to={gift ? `/survey/${EVENT_SURVEY_ID}?from=gift` : `/survey/${EVENT_SURVEY_ID}`}
            className={`${gift ? 'btn-gold' : 'btn-primary'} flex-1`} onClick={() => setOpen(null)}>
            {gift ? t('v.nudge.giftTake') : t('v.nudge.answer')}
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * A slim row on the passport cover that stays until the survey is answered — the standing
 * invitation between the three moments above. Once answered it points at the boarding pass.
 */
export function SurveyBanner({ className = '' }: { className?: string }) {
  const { t } = useLocale()
  const { profile } = useAuth()
  const fs = useFestivalSurvey()
  if (fs.loading || !fs.live || !profile || (profile.stampCount ?? 0) < 1) return null
  if (fs.taken) {
    return (
      <Link to="/passport/prize" className={`card press-row flex items-center gap-3 border border-sky-800/15 bg-sky-100/70 hover:bg-sky-100 ${className}`}>
        <span className="text-2xl" aria-hidden>🎫</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('v.cover.passBanner')}</span>
          <span className="block text-xs text-ink-soft">{t('v.cover.passBannerSub')}</span>
        </span>
        <span className="text-ink-soft" aria-hidden>›</span>
      </Link>
    )
  }
  return (
    <Link to={`/survey/${EVENT_SURVEY_ID}`} className={`card press-row flex items-center gap-3 border border-sky-800/20 bg-sky-100 hover:bg-sky-50 ${className}`}>
      <span className="text-2xl" aria-hidden>📝</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('v.cover.rateBanner')}</span>
        <span className="block text-xs text-ink-soft">{t('v.cover.rateBannerSub', { q: fs.count })}</span>
      </span>
      <span className="text-ink-soft" aria-hidden>›</span>
    </Link>
  )
}

// ---- once-per-visitor memory, in this browser ----
// Storage can be missing or throw (private mode, blocked site data); the in-memory copy keeps
// the promise "once" for the length of this session even then.
const session = new Set<string>()
const key = (uid: string, m: Moment) => `mfu-survey-nudge:${uid}:${m}`

function seen(uid: string, m: Moment): boolean {
  const k = key(uid, m)
  if (session.has(k)) return true
  try { return localStorage.getItem(k) === '1' } catch { return false }
}

function mark(uid: string, m: Moment) {
  const k = key(uid, m)
  session.add(k)
  try { localStorage.setItem(k, '1') } catch { /* remembered for this session only */ }
}
