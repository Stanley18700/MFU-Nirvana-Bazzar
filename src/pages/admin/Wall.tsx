import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { db } from '../../lib/firebase'
import { ms, useBooths, useBoothStats, useBuckets, useCollection, useEvent, useEventStats } from '../../lib/data'
import { Crest, DataErrors, Icon, fmt } from '../../components/ui'
import { fullscreenElement, isStandalone, onFullscreenChange, requestFullscreen } from '../../lib/fullscreen'
import { StageGround } from '../../components/OrganizerPage'
import { useLocale } from '../../lib/locale'
import type { DrawName } from './Draw'

/** How long the draw holds the screen before the live stats come back. */
const REVEAL_MS = 60_000
/** The beat between the button being pressed and the name landing. */
const SUSPENSE_MS = 1600

/** §6.1 — presentation mode for a hall screen: dark navy, oversized figures, auto-rotating. */
export default function Wall() {
  const { t } = useLocale()
  const ev = useEventStats()
  const event = useEvent()
  const booths = useBooths()
  const { data: bstats } = useBoothStats()
  const buckets = useBuckets(60)
  const [view, setView] = useState<0 | 1>(0)

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

  const hasCurve = buckets.filter((b) => b.total > 0).length >= 3

  // The 15-second rotation stops while a winner is up. Nothing should move under a name being read out.
  useEffect(() => {
    if (reveal || !hasCurve) return
    const id = setInterval(() => setView((v) => (v ? 0 : 1)), 15000)
    return () => clearInterval(id)
  }, [reveal, hasCurve])

  // Full screen is an explicit button (and the F key), not a click anywhere: the old page-wide
  // handler gave no hint it existed and threw an unhandled rejection when the browser refused.
  // Same story as the booth screen: an iPad shown the hall screen has no Fullscreen API on iOS
  // before iPadOS 13, and an iPhone never does. Two of the three hints are the booth screen's
  // own, reused rather than reworded.
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
   * Two hours in, this is a curve. At 09:02 it is one dot in an empty grid, and the screen was
   * handing half of every thirty seconds to it — a hall display showing nothing, twice a minute.
   */
  const timeline = [...buckets].sort((a, b) => (a.startsAt as { toMillis(): number }).toMillis() - (b.startsAt as { toMillis(): number }).toMillis()).map((b) => ({ t: new Date((b.startsAt as { toMillis(): number }).toMillis()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), stamps: b.total }))

  const showCurve = view === 1 && hasCurve

  return (
    <>
    <StageGround />
    <main className="on-stage relative flex h-dvh flex-col overflow-hidden p-[4vw] text-ink">
      <header className="flex items-start justify-between gap-[2vw]">
        {/* The festival's mark leads, as it does on everything else the festival prints. It was on
            the right, where it competed with the two controls for the same corner; identity goes
            first and utility goes last. */}
        <div>
          <img src="/brand/logo-festival.webp" alt={event.nameEn} className="h-[9vh] w-auto" />
          <h1 className="mt-[1.5vh] text-[3vw] font-bold leading-none">{t('wall.title')}</h1>
        </div>
        {/*
         * Both controls disappear in full screen, which is the state this screen spends the
         * festival in: a projector wants the wall, not our buttons. Out of full screen they are
         * the two things a person standing at the laptop needs — and the way back to the console
         * is a labelled button now, not the word "admin" in 1vw type in the footer corner.
         */}
        {/*
         * One right-hand group, so the two controls sit together in the corner instead of adrift
         * in the middle of the row — three children under `justify-between` pushed them there.
         * Identical classes, so they are the same height and weight: neither is the primary
         * action on a screen whose job is to be looked at.
         */}
        <div className="flex shrink-0 items-center gap-[1.5vw]">
          {!fs && (
            <div className="flex items-center gap-[0.8vw]">
              <Link to="/admin" className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1.2vw] py-[0.7vh] text-[1.1vw]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[1.1vw] w-[1.1vw]"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>{t('wall.adminConsole')}
              </Link>
              <button className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1.2vw] py-[0.7vh] text-[1.1vw]" onClick={goFull}>
                {Icon.fullscreen}Full screen
              </button>
            </div>
          )}
        </div>
      </header>
      <DataErrors className="mt-[2vh] text-[1.2vw]" />
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
              <div className="stamp-text mt-[6vh] text-[1.2vw] text-ink-soft">Drawn from {fmt(reveal.poolSize)} entries</div>
            </>
          )}
        </section>
      ) : (
      <>
      <section className="mt-[3vh] grid shrink-0 grid-cols-3 gap-[2vw]">
        {[[t('wall.visitors'), ev.totals.visitors], [t('wall.stamps'), ev.totals.stamps], [t('wall.prizes'), ev.totals.redeemed]].map(([l, v]) => (
          <div key={l as string} className="glass p-[2vw]"><div className="fig text-[7vw] leading-none text-action">{fmt(v as number)}</div><div className="stamp-text mt-[1vh] text-[1.2vw] text-ink-soft">{l as string}</div></div>
        ))}
      </section>
      {/* `min-h-0` is what keeps this honest: without it the flex child is free to grow past the
          screen, which is how a 50vh chart put a scrollbar on a projector. */}
      <section className="mt-[3vh] flex min-h-0 flex-1 flex-col">
        {!showCurve ? (
          <ol className="grid h-full grid-cols-2 content-between gap-x-[3vw] gap-y-[1.2vh]">
            {board.map((b, i) => (
              <li key={b.id} className="flex items-center gap-[1vw] text-[1.6vw]">
                <span className="w-[2vw] text-right text-ink-soft">{i + 1}</span>
                <span className="w-[16vw] truncate">{b.nameEn}</span>
                <div className="h-[1.6vw] flex-1 rounded bg-ink/10"><div className="h-full rounded" style={{ width: `${(b.stamps / max) * 100}%`, background: i === 0 ? 'var(--color-orange-500)' : b.accentColor }} /></div>
                <span className="fig w-[4vw] text-right">{fmt(b.stamps)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="glass min-h-0 flex-1 p-[1.5vw]">
            <ResponsiveContainer>
              <AreaChart data={timeline}>
                <XAxis dataKey="t" tick={{ fill: '#1F5A6B', fontSize: 14 }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={{ fill: '#1F5A6B', fontSize: 14 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Area type="monotone" dataKey="stamps" stroke="#12708A" strokeWidth={3} fill="rgba(18,112,138,.14)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      </>
      )}
      <footer className="stamp-text mt-[2vh] flex shrink-0 items-center justify-between gap-4 text-[1vw] text-ink-soft">
        <span>{t('wall.footerScan')}</span>
        <span>{hint ?? t(fs ? 'wall.escLeaves' : 'wall.pressF')}</span>
      </footer>
    </main>
    </>
  )
}
