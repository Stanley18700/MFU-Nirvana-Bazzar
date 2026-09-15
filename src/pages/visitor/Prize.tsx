import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { useDoc, useMyUnlocks, useTiers } from '../../lib/data'
import { EVENT_SURVEY_ID, minuteToHHMM, type SurveyDoc } from '../../../shared/model'
import { prizeStock, usePrizeSession } from '../../lib/prizeSession'
import { api } from '../../lib/api'
import { setServerTime } from '../../lib/serverClock'
import { QR } from '../../components/QR'
import { Notice, Spinner, fmt } from '../../components/ui'
import { APP_ORIGIN } from '../../lib/firebase'
import { useLocale } from '../../lib/locale'

function useRedemptionCode(enabled: boolean) {
  const [state, setState] = useState<{ code: string; payload: string; expiresAt: number; period: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const r = await api.redemptionCode({})
        if (stop) return
        setServerTime(r.serverTime)
        const skew = r.serverTime - Date.now()
        const periodMs = r.period * 1000
        const expiresAt = (r.counter + 1) * periodMs - skew
        setState({ code: r.code, payload: r.payload, expiresAt, period: r.period })
        timer = setTimeout(load, Math.max(500, expiresAt - Date.now() + 150))
      } catch (e) {
        console.warn(e)
        timer = setTimeout(load, 5000)
      }
    }
    void load()
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => { stop = true; clearTimeout(timer); clearInterval(tick) }
  }, [enabled])
  return state ? { ...state, secondsLeft: Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) } : null
}

export default function Prize() {
  const { t } = useLocale()
  const { profile } = useAuth()
  const tiers = useTiers().filter((t) => t.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const unlocks = useMyUnlocks(profile?.id)
  const { active: activeSession, next: nextSession } = usePrizeSession()
  const anyUnlockedUnredeemed = unlocks.some((u) => !u.redeemedAt && !u.voidedAt) || unlocks.some((u) => !!u.voidedAt)
  const code = useRedemptionCode(anyUnlockedUnredeemed)
  if (!profile) return <Spinner />
  const points = profile.points ?? 0

  // The first tier still out of reach is the one this page is actually about.
  const nextId = tiers.find((t) => points < t.thresholdPoints && !unlocks.some((u) => u.tierId === t.id && !u.voidedAt))?.id

  return (
    <main className="px-5 pt-6">
      <div className="stamp-text text-ink-soft">{t('v.prize.title')}</div>
      <h1 className="text-2xl font-bold">{t('v.prize.points', { n: fmt(points) })}</h1>

      <TierRoad points={points} tiers={tiers} />
      <FeedbackCard />
      {anyUnlockedUnredeemed && (
        <section className="relative mt-5 overflow-hidden rounded-3xl border-2 border-foil bg-white p-5 text-center shadow-xl shadow-foil/20">
          <div className="stamp-text text-foil">{t('v.prize.visa')}</div>
          <div className="mt-3 flex justify-center">
            {code ? <QR value={`${APP_ORIGIN}/r/${code.payload}`} size={200} /> : <div className="grid aspect-square w-[min(200px,60vw)] place-items-center text-sm text-ink-soft">{t('v.prize.preparing')}</div>}
          </div>
          {/* The desk can also type these two: the code alone cannot name a visitor (§4.4). */}
          <div className="mt-4 font-mono text-sm tracking-widest text-foil">{profile.passportNo}</div>
          <div className="fig mt-1 text-2xl tracking-[0.2em] xs:text-3xl xs:tracking-[0.3em]">{code ? code.code.slice(0, 4) + ' ' + code.code.slice(4) : '···· ····'}</div>
          <div className="mt-2 text-xs text-ink-soft">{t('v.prize.refresh', { n: code?.secondsLeft ?? '–' })}</div>
          <svg className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-foil/50" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="50" cy="50" r="44" className="seal-draw" /><circle cx="50" cy="50" r="36" />
          </svg>
        </section>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {/* `tier`, not `t` — `t` is the translator now, and the old name shadowed it. */}
        {tiers.map((tier) => {
          const u = unlocks.find((x) => x.tierId === tier.id)
          const unlocked = points >= tier.thresholdPoints || (!!u && !u.voidedAt)
          const redeemed = !!u?.redeemedAt && !u?.voidedAt
          const isNext = tier.id === nextId
          // Per-session stock where the tier has it, the single event pool where it does not.
          // `closed` is not `gone` — the desk being shut says nothing about whether there are
          // gifts left — so the state is named rather than inferred from a number. The prize
          // desk reads the same three states from the same helper (lib/prizeSession).
          const perSession = typeof tier.stockPerSession === 'number'
          const stock = prizeStock(tier, activeSession)
          /*
           * `session.label` is admin-set and single-language, so a Thai reader was getting
           * "…ในรอบmorning" — an English word dropped into Thai copy, which is the one thing the
           * typed dictionary exists to prevent. The two default windows are known ids and can be
           * named properly; anything an organiser adds by hand still falls back to their wording.
           */
          const sessionName = !activeSession ? ''
            : activeSession.session.id === 'am' ? t('v.prize.sessionAm')
            : activeSession.session.id === 'pm' ? t('v.prize.sessionPm')
            : activeSession.session.label.toLowerCase()
          /*
           * Four states that used to look like one. Every tier was the same card with the same four
           * grey lines, so the one you can actually reach next — the only one worth walking for —
           * had no more presence than the one 140 points away.
           */
          return (
            <li key={tier.id} className={`card ${redeemed ? 'opacity-70' : ''} ${isNext ? 'ring-2 ring-action' : unlocked && !redeemed ? 'ring-2 ring-foil' : ''}`}>
              {isNext && <div className="stamp-text mb-1 text-action">{t('v.prize.next')}</div>}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="min-w-0 truncate font-semibold">{tier.name}</h2>
                {/* One state, one phrase, on the right of the row it belongs to — not a fourth
                    grey line under three others. */}
                {redeemed ? <span className="shrink-0 text-xs font-medium text-success-text">{t('v.prize.collected')}</span>
                  : unlocked ? <span className="shrink-0 text-xs font-semibold text-foil">{t('v.prize.ready')}</span>
                  : isNext ? <span className="shrink-0 text-sm font-semibold text-action">{t('v.prize.toGo', { n: fmt(tier.thresholdPoints - points) })}</span>
                  : <span className="shrink-0 text-xs tabular-nums text-ink-soft">{t('v.stamps.pts', { n: tier.thresholdPoints })}</span>}
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">{tier.reward}</p>
              {tier.grantsDrawEntry && <p className="mt-1 text-xs text-foil">{t('v.prize.drawEntry')}</p>}
              {/*
                * Stock is the organisers' fact, not yours, so it sits apart from your own gap —
                * but on its own row under a rule, not as a fourth grey line in the corner. As
                * `text-xs text-right text-ink-soft` it was the faintest thing on the card, and
                * "how many are left" is the question people open this page to ask.
                *
                * It also renders while the desk is shut, which it did not before. `closed` used
                * to replace the number with "Collect from 09:00", and since a closed desk is
                * every hour outside 09:00–16:00 and every day before the 16th, the count was
                * missing for most of the festival's life — including all of the run-up, when
                * people are deciding whether it is worth coming.
                */}
              {!redeemed && stock.capacity > 0 && (
                <div className="mt-3 border-t rule pt-2.5">
                  {stock.state === 'closed' ? (
                    <p className="text-sm text-ink-soft">
                      {perSession
                        ? nextSession
                          ? t('v.prize.allowanceClosed', { n: fmt(stock.capacity), time: minuteToHHMM(nextSession.session.startMinute) })
                          : t('v.prize.allowanceEnded', { n: fmt(stock.capacity) })
                        : nextSession
                          ? t('v.prize.collectFrom', { time: minuteToHHMM(nextSession.session.startMinute) })
                          : t('v.prize.deskClosed')}
                    </p>
                  ) : (
                    <>
                      <p className={`text-sm font-medium ${
                        stock.state === 'gone' ? 'text-danger-text'
                        : stock.low ? 'text-warn-text' : 'text-ink'}`}>
                        {stock.state === 'gone'
                          ? (tier.outOfStockNoteEn || t('v.prize.runOut'))
                          : perSession && activeSession
                            ? t('v.prize.leftOfSession', { n: fmt(stock.remaining), capacity: fmt(stock.capacity), session: sessionName })
                            : t('v.prize.leftOf', { n: fmt(stock.remaining), capacity: fmt(stock.capacity) })}
                      </p>
                      {/* The bar repeats the sentence above, it never replaces it: it is the
                          glanceable half, and the number has to survive a screen reader and a
                          colour-blind eye on its own. Fill tokens, not the `-text` ones — the
                          palette's rule is that fills never carry type (index.css:73). */}
                      <div
                        role="progressbar"
                        aria-label={t('v.prize.stockLabel')}
                        aria-valuemin={0}
                        aria-valuemax={stock.capacity}
                        aria-valuenow={stock.state === 'gone' ? 0 : stock.remaining}
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            stock.state === 'gone' ? 'bg-danger' : stock.low ? 'bg-warn' : 'bg-reward'}`}
                          style={{ width: stock.state === 'gone' ? '0%' : `${Math.max(4, Math.round((stock.remaining / stock.capacity) * 100))}%` }}
                        />
                      </div>
                    </>
                  )}
                  {/* Points outlive a session. Someone who qualifies at 11:58 with none left must
                      be told that plainly, or they will assume they missed it and go home. */}
                  {unlocked && perSession && stock.state === 'gone' && nextSession && (
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {t('v.prize.pointsStay', { time: minuteToHHMM(nextSession.session.startMinute) })}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!anyUnlockedUnredeemed && <div className="mt-6"><Notice>{t('v.prize.codeLater')}</Notice></div>}
    </main>
  )
}

/**
 * Where you are against every threshold at once.
 *
 * The page led with a points total and then described the distance to the next prize in words, as
 * the fourth line of a card. A road shows all three goals and your position on it in one glance,
 * which is the question this tab exists to answer — and it is not the Cover's ring repeated,
 * because the ring can only ever describe the next tier.
 */
function TierRoad({ points, tiers }: { points: number; tiers: Array<{ id: string; thresholdPoints: number }> }) {
  const top = tiers[tiers.length - 1]?.thresholdPoints ?? 0
  if (!top) return null
  const pct = (v: number) => Math.max(0, Math.min(100, (v / top) * 100))
  return (
    /* Inset by half a marker so the first and last dots, and their numbers, stay on the page. */
    <div className="mt-5 px-3">
      <div className="relative h-2 rounded-full bg-ink/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-action transition-[width] duration-500 ease-out" style={{ width: `${pct(points)}%` }} />
        {tiers.map((t) => {
          const done = points >= t.thresholdPoints
          return (
            <span
              key={t.id} aria-hidden
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${done ? 'border-action bg-foil' : 'border-ink/25 bg-white'}`}
              style={{ left: `${pct(t.thresholdPoints)}%` }}
            />
          )
        })}
      </div>
      <div className="relative mt-2 h-4">
        {tiers.map((t) => (
          <span
            key={t.id}
            /* `whitespace-nowrap` is load-bearing on the last one. An absolutely positioned box
               shrinks to fit the room left of the container's edge, and at `left: 100%` that room
               is zero — so "100" wrapped to one digit a line, a column of 1 0 0 hanging off the
               end of the ladder. The translate centres it on its dot either way. */
            className={`absolute -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums ${points >= t.thresholdPoints ? 'font-semibold text-ink' : 'text-ink-soft'}`}
            style={{ left: `${pct(t.thresholdPoints)}%` }}
          >
            {t.thresholdPoints}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The festival's feedback survey, on the page a visitor opens to collect a prize.
 *
 * In the app, not a link out. The form this replaces was a Google Form that asked for a Google
 * sign-in, which would have shut out every General Public visitor at the one moment they were
 * being asked what they thought — and would have sent them to another site to say it. Here the
 * visitor is already signed in, the questions are the same ones, and the answers land next to
 * everything else the festival knows.
 *
 * Above the entry visa, never in front of it. The prize is already earned; a survey standing
 * between a visitor and it would read as a toll, and answers given to get past a toll are not
 * worth having.
 *
 * `surveys/{EVENT_SURVEY_ID}` is read straight from Firestore — any signed-in visitor may read
 * a survey, and this renders on a page they are already waiting on. Nothing shows until it is
 * published, so an unfinished form cannot reach anybody.
 */
function FeedbackCard() {
  const { t } = useLocale()
  const { user } = useAuth()
  const { data: survey } = useDoc<SurveyDoc>(doc(db, 'surveys', EVENT_SURVEY_ID), [])
  const { data: taken } = useDoc(user ? doc(db, 'surveyTaken', `${user.uid}_${EVENT_SURVEY_ID}`) : null, [user?.uid])

  const count = survey?.questions?.length ?? 0
  if (!survey?.active || count === 0) return null

  if (taken) {
    return (
      <section className="mt-5 rounded-3xl border border-sky-800/15 bg-sky-100/60 p-4 text-center">
        <div className="stamp-text text-sky-900">{t('v.survey.thanks')}</div>
        <p className="mt-1 text-sm text-ink-soft">{t('v.prize.feedbackDone')}</p>
      </section>
    )
  }

  return (
    <section className="mt-5 rounded-3xl border border-sky-800/20 bg-sky-100 p-5">
      {/* Both languages on this card whichever way the toggle is set: it is the one thing every
          visitor is asked, and the pair reads as an invitation rather than a wall of the other
          language. The toggle decides which comes first. */}
      <div className="stamp-text text-sky-900">{t('v.prize.feedbackEyebrow')}</div>
      <h2 className="mt-1 font-semibold leading-snug">
        {t('v.prize.feedbackTitle')}
        <span className="block text-ink-soft">{t('v.prize.feedbackTitleTh')}</span>
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        {t('v.prize.feedbackLead', { n: count })}
        <span className="mt-1 block">{t('v.prize.feedbackLeadTh', { n: count })}</span>
      </p>
      <Link to={`/survey/${EVENT_SURVEY_ID}`} className="btn-primary mt-3 w-full">
        {t('v.prize.feedbackCta')}
      </Link>
    </section>
  )
}
