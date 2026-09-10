import { useCallback, useEffect, useRef, useState } from 'react'
import { stampMarks } from '../../lib/eventText'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth, useSignOut } from '../../lib/auth'
import { api, friendlyError } from '../../lib/api'
import { useBooth, useBoothStat, useBooths, useEvent, useEventStats } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { QR } from '../../components/QR'
import { BoothCard } from '../../components/BoothCard'
import { OrganizerBar } from '../../components/OrganizerBar'
import { BoothWatermark, StageGround } from '../../components/OrganizerPage'
import { onStage } from '../../lib/onStage'
import { DataErrors, Icon, IconButton, LiveDot, Notice, Spinner, fmt } from '../../components/ui'
import { APP_ORIGIN } from '../../lib/firebase'
import { buildPayload, computeToken, counterFor, formatManualCode, msUntilRotation } from '../../../shared/token'
import { dayOf, type BoothDoc } from '../../../shared/model'

interface Session { boothId: string; booth: BoothDoc; secret: string; period: number; skew: number }

type WakeLockSentinel = { release(): Promise<void>; released?: boolean }
type WakeNavigator = Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinel> } }

/** The last good session survives a reload (not a closed browser) so venue Wi-Fi cannot take the codes down. */
const cacheKey = (id: string | undefined) => `booth-session:${id ?? 'mine'}`
function readCache(id: string | undefined): Session | null {
  try { const raw = sessionStorage.getItem(cacheKey(id)); return raw ? (JSON.parse(raw) as Session) : null } catch { return null }
}
function writeCache(id: string | undefined, s: Session) {
  try { sessionStorage.setItem(cacheKey(id), JSON.stringify(s)) } catch { /* private mode */ }
}

const REFRESH_EVERY = 15 * 60_000
const REFRESH_MIN_GAP = 60_000

/** §5.1 — the booth screen. Runs all day with nothing to press; keeps rotating offline. */
export default function Booth() {
  const { role, boothId: claimBooth, user } = useAuth()
  const signOutAndGo = useSignOut()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') ?? undefined : claimBooth ?? undefined
  const [session, setSession] = useState<Session | null>(() => readCache(boothId))
  const [err, setErr] = useState<string | null>(null)
  const [token, setToken] = useState<{ counter: number; token: string; payload: string } | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [offline, setOffline] = useState(!navigator.onLine)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const { t, pick } = useLocale()
  const lastFetch = useRef(0)
  const loc = useLocation()
  // ScanLanding sends an organizer here when they scan a booth code with their own phone.
  const notice = (loc.state as { notice?: string } | null)?.notice ?? null

  /**
   * Fetch the secret and period. The first load may fail the screen; a refresh never does — a
   * refresh failure just means the codes keep coming from what we already hold. A refresh is how
   * an admin's *Rotate secret* or a period change reaches the screen without a reload.
   */
  const load = useCallback(async (initial: boolean) => {
    if (!initial && Date.now() - lastFetch.current < REFRESH_MIN_GAP) return
    lastFetch.current = Date.now()
    try {
      const r = await api.boothSession(boothId ? { boothId } : {})
      const next: Session = { boothId: r.boothId, booth: r.booth as unknown as BoothDoc, secret: r.secret, period: r.period, skew: r.serverTime - Date.now() }
      writeCache(boothId, next)
      setErr(null)
      setSession((cur) => cur && cur.boothId === next.boothId && cur.secret === next.secret && cur.period === next.period ? { ...cur, booth: next.booth, skew: next.skew } : next)
    } catch (e) {
      if (initial) setErr(friendlyError(e))
    }
  }, [boothId])

  useEffect(() => {
    let cancelled = false
    const cached = readCache(boothId)
    setSession(cached && (!boothId || cached.boothId === boothId) ? cached : null)
    setErr(null)
    void (async () => { if (!cancelled) await load(!cached) })()
    return () => { cancelled = true }
  }, [boothId, load])

  // §5.2 — tokens are computed locally from the secret and a server-time offset.
  useEffect(() => {
    if (!session) return
    let timer: ReturnType<typeof setTimeout>
    let stop = false
    const rotate = async () => {
      const now = Date.now() + session.skew
      const counter = counterFor(now, session.period)
      const t = await computeToken(session.secret, session.boothId, counter)
      if (stop) return
      setToken({ counter, token: t, payload: buildPayload(APP_ORIGIN, session.boothId, counter, t) })
      timer = setTimeout(rotate, msUntilRotation(now, session.period) + 20)
    }
    void rotate()
    const tick = setInterval(() => setMsLeft(msUntilRotation(Date.now() + session.skew, session.period)), 100)
    return () => { stop = true; clearTimeout(timer); clearInterval(tick) }
  }, [session])

  // Wake lock: browsers drop it whenever the tab is hidden, so take it again each time the screen comes back.
  const requestWake = useCallback(async () => {
    try {
      if (wakeLock.current && !wakeLock.current.released) return
      wakeLock.current = await (navigator as WakeNavigator).wakeLock?.request('screen') ?? null
    } catch { /* not supported or denied */ }
  }, [])
  useEffect(() => {
    void requestWake()
    const on = () => setOffline(false), off = () => setOffline(true)
    const visible = () => { if (document.visibilityState === 'visible') { void requestWake(); void load(false) } }
    const online = () => { on(); void load(false) }
    window.addEventListener('online', online); window.addEventListener('offline', off)
    document.addEventListener('visibilitychange', visible)
    const id = setInterval(() => void load(false), REFRESH_EVERY)
    return () => {
      window.removeEventListener('online', online); window.removeEventListener('offline', off)
      document.removeEventListener('visibilitychange', visible)
      clearInterval(id)
      void wakeLock.current?.release().catch(() => undefined)
    }
  }, [requestWake, load])

  // Full screen is an explicit press — on a phone the organizer is also using for other things it
  // would be rude — with a hint when the browser refuses, as on the hall screen.
  const [fs, setFs] = useState(!!document.fullscreenElement)
  const [fsHint, setFsHint] = useState<string | null>(null)
  useEffect(() => {
    const on = () => { setFs(!!document.fullscreenElement); void requestWake() }
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [requestWake])
  function goFull() {
    void requestWake()
    const el = document.documentElement
    if (!el.requestFullscreen) { setFsHint(t('booth.fsUnavailable')); return }
    el.requestFullscreen().then(() => setFsHint(null)).catch(() => setFsHint(t('booth.fsBlocked')))
  }

  // True once the QR section is on the page at all — before that there is nothing to measure.
  const screenReady = !!session && !!token

  /**
   * What the QR section is actually given, measured. `flex-1 min-h-0` means the section's own
   * height is the leftover space rather than its content, so this cannot feed back into itself.
   * The manual-code block below the frame is subtracted along with the section's row gap.
   */
  const sectionRef = useRef<HTMLElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const sec = sectionRef.current
    if (!sec || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const cs = getComputedStyle(sec)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const gap = parseFloat(cs.rowGap) || 0
      const code = codeRef.current?.getBoundingClientRect().height ?? 0
      const next = { w: sec.clientWidth - padX, h: sec.clientHeight - padY - code - gap }
      // Same numbers must not mean a new object, or the render this triggers loops.
      setAvail((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sec)
    if (codeRef.current) ro.observe(codeRef.current)
    return () => ro.disconnect()
    // `screenReady` and not `token`: the section mounts once, but the token rotates every period.
  }, [screenReady])

  // Kept as the first-paint fallback, before the observer has measured.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const resize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize)
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize) }
  }, [])

  const stat = useBoothStat(session?.boothId ?? null)
  const ev = useEventStats()
  const event = useEvent()
  const boothCount = useBooths().length
  // The live booth document: an admin switching this booth off, or changing its days, shows up here.
  const live = useBooth(session?.boothId).data

  if (err && !session) {
    return (
      /* Same ground as the screen it failed to become. It was the old dark chrome, so a booth
         that could not start looked like a different product from one that could. */
      <><StageGround /><main className="on-stage relative grid min-h-full place-items-center p-8 text-ink">
        <div className="card flex w-full max-w-md flex-col gap-4">
          <div className="stamp-text text-ink-soft">{t('nav.booth')}</div>
          <h1 className="text-2xl font-bold">{t('booth.failed')}</h1>
          <Notice tone="red">{err}</Notice>
          <p className="text-sm text-ink-soft">
            Signed in as <b className="text-ink">{user?.email ?? 'this account'}</b>.
            {role === 'organizer' && !claimBooth && <> No booth is linked to it yet — ask the admin to assign one, then open this page again.</>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-gold" onClick={() => { setErr(null); void load(true) }}>{t('booth.retry')}</button>
            {/* An admin lands here whenever they open /booth without a ?boothId; without this the
                only way back to the console is signing out of it. */}
            {role === 'admin' && <Link to="/admin" className="btn-quiet">{t('nav.admin')}</Link>}
            <button className="btn-quiet" onClick={() => void signOutAndGo()}>{t('nav.signOut')}</button>
          </div>
        </div>
      </main></>
    )
  }
  if (!session || !token) return <><StageGround /><main className="relative min-h-full text-ink"><Spinner label={t('booth.starting')} /></main></>

  const b = live ?? session.booth
  const feedState = offline ? 'offline' as const : (stat.fromCache || ev.fromCache) ? 'stale' as const : 'live' as const
  const fresh = feedState === 'live'
  const today = dayOf(new Date())
  const offToday = !!live && Array.isArray(live.activeDays) && live.activeDays.length > 0 && !live.activeDays.includes(today)

  /**
   * §5.2 — the countdown traces the frame's own border rather than an inscribed circle, so it
   * reads along every edge instead of hiding behind the corners. It sits just outside the
   * accent ring rather than on top of it, so the booth's accent still dominates the screen
   * (§2.2). `pathLength={1}` normalises the perimeter, so the dash offset is simply the
   * fraction of the period spent.
   */
  const FRAME_PAD = 20, ACCENT = 10, GAP = 4, RING = 4, CORNER = 32
  const inset = ACCENT + GAP + RING              // how far the svg extends past the white frame

  /**
   * The QR is sized from the space the section actually has, not from the viewport. The header
   * wraps on a narrow screen and can carry up to four notices below it, so a fraction of
   * `innerHeight` over-estimated what was left and the code drew over the banner. `chrome` is
   * everything the frame adds around the code: the white padding, the accent ring and the
   * countdown ring, on both sides. 420 is the cap — past that a table-top code is just bigger,
   * not easier to scan — and 150 the floor, below which a phone camera starts to struggle.
   */
  const chrome = 2 * (FRAME_PAD + inset)
  const size = Math.max(150, Math.round(Math.min(
    (avail?.w ?? vp.w - 32) - chrome,
    (avail?.h ?? vp.h * 0.42) - chrome,
    420,
  )))
  const box = size + 2 * FRAME_PAD + 2 * inset
  const left = Math.max(0, Math.min(1, msLeft / (session.period * 1000)))
  const urgent = msLeft <= 3000
  // Display sizes: the booth name is 1.6em of a viewport-scaled base and the manual code 2em.
  const accent = onStage(b.accentColor, true)
  const accentSmall = onStage(b.accentColor)

  return (
    <>
    {/* The ground is a backdrop rather than a fill on `main`, or `main` paints over it. */}
    <StageGround />
    {/* The booth's visa in the corner it used to hold, darkening the field rather than lightening
        it — on a sky ground a luminosity blend disappears. */}
    <BoothWatermark booth={b} marks={stampMarks(event)} />
    <main className="booth-screen relative flex min-h-full flex-col overflow-hidden text-ink print:hidden">
      {/*
       * Outside the header, not inside it: the bar is the top row of the screen on every organizer
       * page, so it must not inherit this one's padding — that is what put the kiosk's tabs at a
       * different x from the other three tabs'. `large` scales it with the display, because
       * everything else here is sized against the viewport and a rem-sized bar reads as a misprint
       * beside a 42px title on a hall screen.
       */}
      <OrganizerBar
        boothId={session.boothId} compact large
        actions={!fs && (
          <div className="flex items-center gap-1.5">
            <IconButton icon={Icon.fullscreen} label={t('booth.fullScreen')} onClick={goFull} />
            <IconButton icon={Icon.print} label={t('booth.printCard')} onClick={() => window.print()} />
          </div>
        )}
      />
      <header className="px-[4vw] pt-[2vh]">
        <div className="glass flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-[1.2em] py-[0.7em]">
          <div className="min-w-0">
            {/* Eyebrow, title and manual code in the booth's own colour, as the design system has
                them — the swatch dot they used to need is redundant once the line itself is the
                colour. `onChrome` is what makes that safe for the dark-green booths. */}
            <div className="stamp-text text-[0.55em]" style={{ color: accentSmall }}>{t('booth.worth', { location: b.location, points: b.points })}</div>
            <h1 className="mt-1 text-[1.6em] font-extrabold leading-[1.08]" style={{ color: accent }}>{pick(b.nameEn, b.nameTh)}</h1>
            <div className="text-[0.6em] text-ink-soft">{b.hostUnit}</div>
          </div>
          <LiveDot state={feedState}>
            {offline ? t('status.offlineCodes') : fresh ? t('status.live') : t('status.reconnectingCodes')}
          </LiveDot>
        </div>
      </header>
      <div className="mx-[4vw] mt-2 flex flex-col gap-2 text-sm">
        <DataErrors />
        {notice && <Notice>{notice}</Notice>}
        {fsHint && <Notice tone="amber">{fsHint}</Notice>}
        {live && !live.active && <Notice tone="red">{t('booth.switchedOff')}</Notice>}
        {live?.active && offToday && <Notice tone="amber">{t('booth.notToday')}</Notice>}
      </div>

      <section ref={sectionRef} className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vh] px-4">
        <div className="relative">
        <div className="relative rounded-[36px] bg-white p-5" style={{ boxShadow: `0 0 0 ${ACCENT}px ${b.accentColor}, 0 30px 80px rgba(0,0,0,.45)` }}>
          {/* Keyed on the counter so the swap animation replays on every rotation. */}
          <div key={token.counter} className="qr-swap">
            <QR value={token.payload} size={size} />
          </div>
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ top: -inset, left: -inset, width: box, height: box }}
            viewBox={`0 0 ${box} ${box}`} aria-hidden
          >
            <rect
              className="qr-countdown"
              x={RING / 2} y={RING / 2} width={box - RING} height={box - RING}
              rx={CORNER + inset - RING / 2} fill="none" strokeWidth={RING} strokeLinecap="butt"
              stroke={urgent ? '#DC8A2A' : 'rgba(207,227,234,.8)'}
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - left}
            />
          </svg>
        </div>
        </div>
        {/* On glass: a 2em accent-coloured word is the one thing on this screen that must never
            be hard to read from across a hall, and the wave field runs right under it. */}
        <div ref={codeRef} className="glass px-[2em] py-[0.6em] text-center">
          <div className="stamp-text text-[0.55em] text-ink-soft">{t('booth.manualCode')}</div>
          <div key={token.counter} className="code-swap fig text-[2em] tracking-[0.15em] sm:text-[2.4em] sm:tracking-[0.25em]" style={{ color: accent }}>
            {formatManualCode(token.token)}
          </div>
          <div className="text-[0.5em] text-ink-soft">
            {t('booth.rotatesIn')} <span className="tabular-nums">{Math.ceil(msLeft / 1000)}</span> {t('booth.seconds')}
          </div>
        </div>
      </section>

      {/*
        * Three glass panels rather than three bare columns, and every one centred: the first two
        * used to sit left and the third right, so the row read as two figures pushed apart. The
        * footer's own top rule is gone — each panel now carries its own edge.
        */}
      <footer className="grid grid-cols-3 gap-2 px-[4vw] py-[2vh] sm:gap-4">
        {[
          { value: fmt(stat.data?.stamps), label: t('booth.visitorsHere') },
          { value: fmt(ev.totals.stamps), label: t('booth.eventTotal') },
          { value: stat.data?.rank ? `#${stat.data.rank}` : '–', label: t('booth.rankOf', { count: boothCount || '–' }) },
        ].map((f) => (
          <div key={f.label} className="glass flex flex-col items-center justify-center gap-0.5 px-2 py-[1.2vh] text-center">
            <div className="fig text-[1.8em] leading-none">{f.value}</div>
            <div className="stamp-text text-[0.5em] text-ink-soft">{f.label}</div>
          </div>
        ))}
      </footer>
    </main>
    {/* Only exists on paper: a static card, since the rotating QR above cannot be printed. */}
    <div className="hidden print:block"><BoothCard booth={b} origin={APP_ORIGIN} period={session.period} /></div>
    </>
  )
}
