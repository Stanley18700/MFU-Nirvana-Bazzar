import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useLocale } from '../../lib/locale'
import { useMyUnlocks, useTiers } from '../../lib/data'
import { minuteToHHMM } from '../../../shared/model'
import { prizeStock, usePrizeSession } from '../../lib/prizeSession'
import { api } from '../../lib/api'
import { setServerTime } from '../../lib/serverClock'
import { QR } from '../../components/QR'
import { Notice, Spinner, fmt } from '../../components/ui'
import { APP_ORIGIN } from '../../lib/firebase'

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
  // `tiers.map((t) => …)` shadows the translator with the tier, so the rows use this alias.
  const { t } = useLocale()
  const t2 = t
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
      <div className="stamp-text text-ink-soft">{t('prize.title')}</div>
      <h1 className="text-2xl font-bold">{t('prize.pointsTitle', { n: fmt(points) })}</h1>

      <TierRoad points={points} tiers={tiers} />
      {anyUnlockedUnredeemed && (
        <section className="relative mt-5 overflow-hidden rounded-3xl border-2 border-foil bg-white p-5 text-center shadow-xl shadow-foil/20">
          <div className="stamp-text text-foil">{t('prize.entryVisa')}</div>
          <div className="mt-3 flex justify-center">
            {code ? <QR value={`${APP_ORIGIN}/r/${code.payload}`} size={200} /> : <div className="grid aspect-square w-[min(200px,60vw)] place-items-center text-sm text-ink-soft">{t('prize.preparing')}</div>}
          </div>
          {/* The desk can also type these two: the code alone cannot name a visitor (§4.4). */}
          <div className="mt-4 font-mono text-sm tracking-widest text-foil">{profile.passportNo}</div>
          <div className="fig mt-1 text-2xl tracking-[0.2em] xs:text-3xl xs:tracking-[0.3em]">{code ? code.code.slice(0, 4) + ' ' + code.code.slice(4) : '···· ····'}</div>
          <div className="mt-2 text-xs text-ink-soft">Refreshes in {code?.secondsLeft ?? '–'} s — a screenshot will not work. If the camera fails, read out both lines.</div>
          <svg className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-foil/50" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="50" cy="50" r="44" className="seal-draw" /><circle cx="50" cy="50" r="36" />
          </svg>
        </section>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {tiers.map((t) => {
          const u = unlocks.find((x) => x.tierId === t.id)
          const unlocked = points >= t.thresholdPoints || (!!u && !u.voidedAt)
          const redeemed = !!u?.redeemedAt && !u?.voidedAt
          const isNext = t.id === nextId
          // Per-session stock where the tier has it, the single event pool where it does not.
          // `closed` is not `gone` — the desk being shut says nothing about whether there are
          // gifts left — so the state is named rather than inferred from a number. The prize
          // desk reads the same three states from the same helper (lib/prizeSession).
          const perSession = typeof t.stockPerSession === 'number'
          const stock = prizeStock(t, activeSession)
          /*
           * Four states that used to look like one. Every tier was the same card with the same four
           * grey lines, so the one you can actually reach next — the only one worth walking for —
           * had no more presence than the one 140 points away.
           */
          return (
            <li key={t.id} className={`card ${redeemed ? 'opacity-70' : ''} ${isNext ? 'ring-2 ring-action' : unlocked && !redeemed ? 'ring-2 ring-foil' : ''}`}>
              {isNext && <div className="stamp-text mb-1 text-action">{t2('prize.next')}</div>}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="min-w-0 truncate font-semibold">{t.name}</h2>
                {/* One state, one phrase, on the right of the row it belongs to — not a fourth
                    grey line under three others. */}
                {redeemed ? <span className="shrink-0 text-xs font-medium text-success-text">{t2('prize.collected')}</span>
                  : unlocked ? <span className="shrink-0 text-xs font-semibold text-foil">{t2('prize.ready')}</span>
                  : isNext ? <span className="shrink-0 text-sm font-semibold text-action">{t2('prize.toGo', { n: fmt(t.thresholdPoints - points) })}</span>
                  : <span className="shrink-0 text-xs tabular-nums text-ink-soft">{t2('prize.pts', { n: t.thresholdPoints })}</span>}
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">{t.reward}</p>
              {t.grantsDrawEntry && <p className="mt-1 text-xs text-foil">{t2('prize.drawEntry')}</p>}
              {/* Stock is the organisers' fact, not yours, so it sits apart from your own gap. */}
              {!redeemed && stock.state !== 'closed' && stock.capacity > 0 && (
                <p className={`mt-2 text-right text-xs ${
                  stock.state === 'gone' ? 'text-danger-text'
                  : stock.low ? 'text-warn-text' : 'text-ink-soft'}`}>
                  {stock.state === 'gone'
                    ? (t.outOfStockNoteEn || t2('prize.outOfStock'))
                    : perSession && activeSession ? t2('prize.leftSession', { n: fmt(stock.remaining), session: activeSession.session.label.toLowerCase() }) : t2('prize.left', { n: fmt(stock.remaining) })}
                </p>
              )}
              {!redeemed && stock.state === 'closed' && (
                <p className="mt-2 text-right text-xs text-ink-soft">
                  {nextSession
                    ? t2('prize.collectFrom', { time: minuteToHHMM(nextSession.session.startMinute) })
                    : t2('prize.deskClosed')}
                </p>
              )}
              {/* Points outlive a session. Someone who qualifies at 11:58 with none left must be
                  told that plainly, or they will assume they missed it and go home. */}
              {!redeemed && unlocked && perSession && stock.state === 'gone' && nextSession && (
                <p className="mt-1 text-right text-xs text-ink-soft">
                  Your points stay — collect from {minuteToHHMM(nextSession.session.startMinute)}.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {!anyUnlockedUnredeemed && <div className="mt-6"><Notice>{t('prize.codeLater')}</Notice></div>}
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
            className={`absolute -translate-x-1/2 text-[11px] tabular-nums ${points >= t.thresholdPoints ? 'font-semibold text-ink' : 'text-ink-soft'}`}
            style={{ left: `${pct(t.thresholdPoints)}%` }}
          >
            {t.thresholdPoints}
          </span>
        ))}
      </div>
    </div>
  )
}
