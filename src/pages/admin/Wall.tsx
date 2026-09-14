import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { APP_ORIGIN, db } from '../../lib/firebase'
import { ms, useBooths, useBoothStats, useCollection, useEvent, useEventStats } from '../../lib/data'
import { Crest, DataErrors, Icon, fmt } from '../../components/ui'
import { QR } from '../../components/QR'
import { fullscreenElement, isStandalone, onFullscreenChange, requestFullscreen } from '../../lib/fullscreen'
import { FestivalBackdrop, ScrapLabel } from '../auth/parts'
import { useLocale } from '../../lib/locale'
import type { DrawName } from './Draw'

/** Big enough to scan from the middle of a hall, small enough to leave the board room. */
function qrPx() {
  if (typeof window === 'undefined') return 260
  return Math.round(Math.max(180, Math.min(window.innerWidth * 0.17, window.innerHeight * 0.30)))
}

/** How long the draw holds the screen before the live stats come back. */
const REVEAL_MS = 60_000
/** The beat between the button being pressed and the name landing. */
const SUSPENSE_MS = 1600

/** §6.1 — presentation mode for a hall screen: dark navy, oversized figures, auto-rotating. */
export default function Wall() {
  const { t, pick } = useLocale()
  const ev = useEventStats()
  const event = useEvent()
  const booths = useBooths()
  const { data: bstats } = useBoothStats()

  /*
   * §6.7 asks for a draw "suitable for projection", and this is the surface already pointed at the
   * projector. The console at /admin/draw runs the draw; the reveal arrives here on the listener,
   * holds the screen for a minute and hands it back.
   *
   * Only a draw that has just happened takes over. Opening this screen an hour later would
   * otherwise replay the last one as though it were news.
   */
  const draws = useCollection<{ names: DrawName[]; poolSize: number; createdAt: unknown }>(
    query(collection(db, 'draws'), orderBy('createdAt', 'desc'), limit(1)), [], 'the stage draw',
  ).data
  const latest = draws[0]
  const [reveal, setReveal] = useState<typeof latest | null>(null)
  const [suspense, setSuspense] = useState(false)
  useEffect(() => {
    if (!latest) return
    const at = ms(latest.createdAt)
    const age = at ? Date.now() - at : Infinity
    if (age > REVEAL_MS) return
    setReveal(latest)
    setSuspense(age < SUSPENSE_MS)
    const beat = setTimeout(() => setSuspense(false), Math.max(0, SUSPENSE_MS - age))
    const over = setTimeout(() => setReveal(null), REVEAL_MS - age)
    return () => { clearTimeout(beat); clearTimeout(over) }
  }, [latest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Full screen is an explicit button (and the F key), not a click anywhere: the old page-wide
  // handler gave no hint it existed and threw an unhandled rejection when the browser refused.
  // Same story as the booth screen: an iPad shown the hall screen has no Fullscreen API on iOS
  // before iPadOS 13, and an iPhone never does. Two of the three hints are the booth screen's
  // own, reused rather than reworded.
  /*
   * The QR is the whole point of the screen for a visitor walking past, so it is sized off the
   * viewport rather than fixed: a 320px square is a postage stamp on a 4K projector. Recomputed
   * on resize because entering full screen changes the viewport under it.
   */
  const [qrSize, setQrSize] = useState(() => qrPx())
  useEffect(() => {
    const on = () => setQrSize(qrPx())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const [fs, setFs] = useState(() => !!fullscreenElement() || isStandalone())
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => onFullscreenChange(() => setFs(!!fullscreenElement() || isStandalone())), [])
  const goFull = useCallback(async () => {
    const failure = await requestFullscreen()
    setHint(failure === null ? null
      : failure === 'ios' ? t('wall.fsIos')
      : failure === 'unsupported' ? t('booth.fsUnavailable')
      : t('booth.fsBlocked'))
  }, [t])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) goFull() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goFull])

  const board = booths.map((b) => ({ ...b, stamps: bstats.find((s) => s.id === b.id)?.stamps ?? 0 })).sort((a, b) => b.stamps - a.stamps)
  const max = Math.max(1, ...board.map((b) => b.stamps))
  /*
   * Five, not seventy-eight. The full ranking belongs to the admin dashboard; here it ran off the
   * bottom of the screen and under the footer, and seventy rows reading 0 is the opposite of the
   * impression an entrance screen exists to give. Hidden entirely until something has happened.
   */
  const top = board.filter((b) => b.stamps > 0).slice(0, 5)

  /*
   * The counters are sharded increments, so a deleted test visitor decrements a total that is
   * already zero and the hall screen shows "-6 visitors" to the whole room. Clamped here because
   * this is the screen the public reads; the real repair is Purge event data → event counters in
   * the Event admin, which is also what clears a test run before the festival opens.
   */
  const show = (n: number) => fmt(Math.max(0, n))

  return (
    <>
    {/* The landing screen's own sky, clouds, rocket and paper campus — the first thing a visitor
        sees at the door should look like the poster and the app they are about to open, not like
        an operations dashboard. */}
    <FestivalBackdrop />
    <main className="on-stage relative flex h-dvh flex-col overflow-hidden p-[3.5vw] text-ink">
      <header className="flex shrink-0 items-start justify-between gap-[2vw]">
        <ScrapLabel tone="ink" tilt={-2}>{t('v.landing.university')}</ScrapLabel>
        {/* Both controls vanish in full screen, which is where this screen spends the festival. */}
        {!fs && (
          <div className="flex shrink-0 items-center gap-[0.8vw]">
            <Link to="/admin" className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1.2vw] py-[0.7vh] text-[1.1vw]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[1.1vw] w-[1.1vw]"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>{t('wall.adminConsole')}
            </Link>
            <button className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1.2vw] py-[0.7vh] text-[1.1vw]" onClick={goFull}>
              {Icon.fullscreen}Full screen
            </button>
          </div>
        )}
      </header>
      <DataErrors className="mt-[1.5vh] text-[1.1vw]" />
      {reveal ? (
        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="stamp-text text-[1.4vw] text-action">
            {t(suspense ? 'wall.drawing' : reveal.names.length === 1 ? 'wall.winner' : 'wall.winners')}
          </div>
          {suspense ? (
            <Crest className="mt-[5vh] h-[16vw] w-[16vw] animate-pulse text-action" />
          ) : reveal.names.length === 0 ? (
            <p className="mt-[6vh] text-[3vw] text-ink-soft">{t('wall.nobodyEligible')}</p>
          ) : (
            <>
              <ol className="mt-[4vh] flex flex-col gap-[3vh]">
                {reveal.names.map((n, i) => (
                  /* Staggered, so a row of five names arrives one at a time rather than as a block. */
                  <li key={n.uid} className="winner-in" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="fig text-[6vw] leading-none">{n.displayName}</div>
                    <div className="mt-[1vh] font-mono text-[1.8vw] tracking-[0.2em] text-action">{n.passportNo}</div>
                  </li>
                ))}
              </ol>
              <div className="stamp-text mt-[6vh] text-[1.2vw] text-ink-soft">{t('wall.drawnFrom', { n: fmt(reveal.poolSize) })}</div>
            </>
          )}
        </section>
      ) : (
      /*
       * An entrance screen, not a dashboard.
       *
       * What stood here was the operations view: three counters and all 78 booths ranked, which
       * ran off the bottom of the screen and under the footer, and which says nothing to somebody
       * walking through the door. A visitor needs three things — what this is, how to start, and
       * a reason to bother. The counters stay, small, because a live number is what makes it look
       * worth joining; the booth board is reduced to the five busiest, which is the part that
       * reads as a hall with something happening in it.
       */
      <section className="mt-[1vh] grid min-h-0 flex-1 grid-cols-[1.05fr_0.95fr] items-center gap-[3vw]">
        <div className="flex min-h-0 flex-col justify-center">
          <img src="/brand/logo-festival-tagline.webp" alt={pick(event.nameEn, event.nameTh)} className="w-[min(38vw,720px)]" />
          <div className="mt-[2.5vh]"><ScrapLabel tone="orange" tilt={1.75} className="!text-[1.3vw]">{t('v.landing.badge')}</ScrapLabel></div>
          <p className="mt-[2vh] max-w-[36vw] text-[1.7vw] font-medium leading-snug text-ink">{t('v.landing.pitch')}</p>

          <ol className="mt-[3vh] flex flex-wrap gap-[1.2vw]">
            {[t('wall.step1'), t('wall.step2'), t('wall.step3')].map((step, i) => (
              <li key={step} className="glass flex items-center gap-[0.8vw] px-[1.2vw] py-[1.1vh]">
                <span className="fig grid h-[2.4vw] w-[2.4vw] shrink-0 place-items-center rounded-full bg-action text-[1.2vw] text-white">{i + 1}</span>
                <span className="text-[1.25vw] font-semibold">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-[3vh] flex gap-[1.5vw]">
            {[[t('wall.visitors'), ev.totals.visitors], [t('wall.stamps'), ev.totals.stamps], [t('wall.prizes'), ev.totals.redeemed]].map(([l, v]) => (
              <div key={l as string} className="glass px-[1.6vw] py-[1.2vh]">
                <div className="fig text-[3vw] leading-none text-action">{show(v as number)}</div>
                <div className="stamp-text mt-[0.4vh] text-[0.95vw] text-ink-soft">{l as string}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col items-center justify-center gap-[2vh]">
          {/* The one thing a visitor at the door has to be able to act on. */}
          <div className="glass flex flex-col items-center gap-[1.2vh] px-[2.5vw] py-[2.5vh]">
            <div className="stamp-text text-center text-[1.25vw] text-ink">{t('wall.joinHere')}</div>
            <QR value={APP_ORIGIN} size={qrSize} />
            <div className="fig text-[1.3vw] text-ink">{APP_ORIGIN.replace(/^https?:\/\//, '')}</div>
          </div>

          {/* Only when the hall has actually done something — five rows of zeros is not news. */}
          {top.length > 0 && (
            <div className="glass w-full px-[1.6vw] py-[1.2vh]">
              <div className="stamp-text text-[0.95vw] text-ink-soft">{t('wall.busiest')}</div>
              <ol className="mt-[0.8vh] flex flex-col gap-[0.6vh]">
                {top.map((b, i) => (
                  <li key={b.id} className="flex items-center gap-[0.8vw] text-[1.15vw]">
                    <span className="w-[1.2vw] shrink-0 text-right text-ink-soft">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{pick(b.nameEn, b.nameTh)}</span>
                    <div className="h-[0.9vw] w-[7vw] shrink-0 rounded bg-ink/10">
                      <div className="h-full rounded" style={{ width: `${(b.stamps / max) * 100}%`, background: i === 0 ? 'var(--color-orange-500)' : b.accentColor }} />
                    </div>
                    <span className="fig w-[2.5vw] shrink-0 text-right">{fmt(b.stamps)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>
      )}
      {/*
        * Nothing under the poster in full screen.
        *
        * The footer carried two lines that both had to go: one repeated what the QR card already
        * says a foot above it, and the other explained the Esc key to a hall of visitors. Both
        * sat over the paper campus, where the artwork made them unreadable anyway. What is left
        * is the operator's own hint, and it shows only out of full screen — the same rule the two
        * buttons in the header follow, so the projected screen is the poster and nothing else.
        */}
      {!fs && (
        <footer className="stamp-text mt-[2vh] shrink-0 text-right text-[1vw] text-ink-soft">
          {hint ?? t('wall.pressF')}
        </footer>
      )}
    </main>
    </>
  )
}
