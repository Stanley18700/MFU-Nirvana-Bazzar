import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { stampMarks } from '../../lib/eventText'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth, useSignOut } from '../../lib/auth'
import { api, friendlyError } from '../../lib/api'
import { useBooth, useBoothStat, useBooths, useEvent, useEventStats } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { exitFullscreen, fullscreenElement, isStandalone, onFullscreenChange, requestFullscreen } from '../../lib/fullscreen'
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

/**
 * §5.2 — the countdown traces the frame's own border rather than an inscribed circle, so it
 * reads along every edge instead of hiding behind the corners. It sits just outside the
 * accent ring rather than on top of it, so the booth's accent still dominates the screen
 * (§2.2). `pathLength={1}` normalises the perimeter, so the dash offset is simply the
 * fraction of the period spent.
 */
const FRAME_PAD = 20, ACCENT = 10, GAP = 4, RING = 4, CORNER = 32
const INSET = ACCENT + GAP + RING              // how far the svg extends past the white frame
/** Everything the frame adds around the code, both sides: white padding, accent ring, countdown ring. */
const CHROME = 2 * (FRAME_PAD + INSET)

/** The white frame, the booth's accent ring and the countdown — shared by the screen and the Show code view. */
function QRFrame({ size, accentColor, payload, counter, left, urgent }: {
  size: number; accentColor: string; payload: string; counter: number; left: number; urgent: boolean
}) {
  const box = size + 2 * FRAME_PAD + 2 * INSET
  return (
    <div className="relative">
      <div className="relative rounded-[36px] bg-white p-5" style={{ boxShadow: `0 0 0 ${ACCENT}px ${accentColor}, 0 30px 80px rgba(0,0,0,.45)` }}>
        {/* Keyed on the counter so the swap animation replays on every rotation. */}
        <div key={counter} className="qr-swap">
          <QR value={payload} size={size} />
        </div>
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{ top: -INSET, left: -INSET, width: box, height: box }}
          viewBox={`0 0 ${box} ${box}`} aria-hidden
        >
          <rect
            className="qr-countdown"
            x={RING / 2} y={RING / 2} width={box - RING} height={box - RING}
            rx={CORNER + INSET - RING / 2} fill="none" strokeWidth={RING} strokeLinecap="butt"
            stroke={urgent ? '#DC8A2A' : 'rgba(207,227,234,.8)'}
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - left}
          />
        </svg>
      </div>
    </div>
  )
}

/**
 * What a box actually gives the QR, measured. Only safe where the box is bounded by something
 * other than its own content — the `flex-1 min-h-0` row of a fixed-height stage, or the Show code
 * view's `fixed inset-0` — otherwise the size feeds back into the measurement and shrinks to the
 * floor. `minus` is a sibling whose height comes out of the vertical room (the manual-code block
 * under the frame), together with the box's row gap.
 */
function useAvail(ref: RefObject<HTMLElement | null>, minus: RefObject<HTMLElement | null> | null, enabled: boolean) {
  const [avail, setAvail] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof ResizeObserver === 'undefined') { setAvail(null); return }
    const measure = () => {
      const cs = getComputedStyle(el)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const gap = parseFloat(cs.rowGap) || 0
      const sub = minus?.current?.getBoundingClientRect().height ?? 0
      const next = { w: el.clientWidth - padX, h: el.clientHeight - padY - sub - gap }
      // Same numbers must not mean a new object, or the render this triggers loops.
      setAvail((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (minus?.current) ro.observe(minus.current)
    return () => ro.disconnect()
    // `enabled` and not the token: the box mounts once, but the token rotates every period.
  }, [ref, minus, enabled])
  return avail
}

/** §5.1 — the booth screen. Runs all day with nothing to press; keeps rotating offline. */
export default function Booth() {
  const { role, boothId: claimBooth, user } = useAuth()
  const signOutAndGo = useSignOut()
  const [params, setParams] = useSearchParams()
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

  /**
   * Full screen is an explicit press — on a phone the organizer is also using for other things it
   * would be rude — with a hint when the browser refuses, as on the hall screen.
   *
   * iPhone Safari has no Fullscreen API, so the button used to answer a tap with "press F11" on a
   * device with no keyboard. It is hidden there instead, and the hint explains Add to Home Screen,
   * which is the only way to lose Safari's chrome on iOS. Hidden too once the screen already runs
   * without chrome, whether from full screen or from the home-screen icon.
   */
  const [fs, setFs] = useState(() => !!fullscreenElement() || isStandalone())
  const [fsHint, setFsHint] = useState<string | null>(null)
  // Shown unless the screen is already chrome-free. Kept on iOS on purpose: an organizer who taps
  // it wants full screen, and the hint is where they find out how to actually get it.
  const showFullscreenButton = !isStandalone()
  useEffect(() => onFullscreenChange(() => {
    setFs(!!fullscreenElement() || isStandalone())
    void requestWake()
  }), [requestWake])
  const goFull = useCallback(async () => {
    void requestWake()
    const failure = await requestFullscreen()
    setFsHint(failure === null ? null
      : failure === 'ios' ? t('booth.fsIos')
      : failure === 'unsupported' ? t('booth.fsUnavailable')
      : t('booth.fsBlocked'))
  }, [requestWake, t])
  // The hall screen binds F for the same thing; a kiosk with a keyboard gets it here too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) void goFull() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goFull])

  /**
   * Show code: the QR and the manual code alone, edge to edge, for a phone held up to a visitor.
   * A URL param rather than state, so the phone's back gesture closes it, a reload keeps it, and
   * `/booth?show=1` can be pinned to a home screen — which on an iPhone is also the only way to
   * lose Safari's chrome, so it is the same advice `booth.fsIos` gives.
   *
   * Full screen goes through the shared helper and is simply not granted on an iPhone. No hint
   * either way: the point of this view is the big code, and it is the big code regardless.
   */
  const show = params.get('show') === '1'
  const openShow = useCallback(() => {
    setParams((p) => { p.set('show', '1'); return p })
    void requestWake()
    void requestFullscreen()
  }, [setParams, requestWake])
  const closeShow = useCallback(() => {
    void exitFullscreen()
    setParams((p) => { p.delete('show'); return p })
  }, [setParams])
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeShow() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, closeShow])
  useBodyScrollLock(show)

  // True once the QR section is on the page at all — before that there is nothing to measure.
  const screenReady = !!session && !!token

  // The stage's QR row, less the manual-code block under the frame; and the Show code view's box.
  const sectionRef = useRef<HTMLElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const bigRef = useRef<HTMLDivElement>(null)
  const avail = useAvail(sectionRef, codeRef, screenReady)
  const big = useAvail(bigRef, null, screenReady && show)

  // The first-paint fallback before the observer has measured, and the phone's whole basis.
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
   * On a kiosk the QR is sized from the space the section actually has, not from the viewport. The
   * header wraps on a narrow screen and can carry up to four notices below it, so a fraction of
   * `innerHeight` over-estimated what was left and the code drew over the banner. 420 is the cap —
   * past that a table-top code is just bigger, not easier to scan — and 150 the floor, below which
   * a phone camera starts to struggle.
   *
   * A phone is the other way round: the page scrolls (see `.booth-screen` in index.css), so the
   * section is only as tall as its content and measuring it would shrink the code to the floor.
   * The short side of the viewport, less the gutters and the frame, is the whole basis there. The
   * thresholds are the same ones the stylesheet uses for the type scale and the overflow.
   */
  const isPhone = vp.w < 640 || vp.h < 500
  const size = isPhone
    ? Math.max(150, Math.min(Math.min(vp.w, vp.h) - 32 - CHROME, 420))
    : Math.max(150, Math.round(Math.min(
      (avail?.w ?? vp.w - 32) - CHROME,
      (avail?.h ?? vp.h * 0.42) - CHROME,
      420,
    )))
  // The Show code view is bounded by the viewport itself, so measuring it is safe on every device.
  const bigSize = Math.max(150, Math.round(Math.min((big?.w ?? vp.w) - CHROME, (big?.h ?? vp.h) - CHROME, 720)))
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
    <main className="booth-screen relative flex min-h-full flex-col text-ink print:hidden">
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
          // Not on a phone: printing an A4 card from one is nobody's job, and Show code below
          // replaces full screen there. The room they free is what lets the three tabs fit.
          // `showFullscreenButton` drops it again once the screen already runs without chrome.
          <div className="hidden items-center gap-1.5 kiosk:flex">
            {showFullscreenButton && <IconButton icon={Icon.fullscreen} label={t('booth.fullScreen')} onClick={goFull} />}
            <IconButton icon={Icon.print} label={t('booth.printCard')} onClick={() => window.print()} />
          </div>
        )}
      />
      {/* The bar leaves in full screen and a touch screen has no Esc key; a way back for a thumb.
          Pointer-coarse only, so a hall display stays as clean as O-19 asks. Not for a home-screen
          app: `fs` covers that too, and there is no full screen to leave there. */}
      {fs && showFullscreenButton && !show && (
        <div className="fixed right-4 z-40 hidden pointer-coarse:block" style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}>
          <IconButton
            icon={<span aria-hidden className="text-lg leading-none">×</span>}
            label={t('booth.exitFullScreen')}
            onClick={() => { void exitFullscreen() }}
          />
        </div>
      )}
      <header className="px-[4vw] pt-[2vh]">
        <div className="glass flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-[1.2em] py-[0.7em]">
          <div className="min-w-0">
            {/* Eyebrow, title and manual code in the booth's own colour, as the design system has
                them — the swatch dot they used to need is redundant once the line itself is the
                colour. `onChrome` is what makes that safe for the dark-green booths. */}
            <div className="stamp-text text-[length:max(0.55em,0.7rem)]" style={{ color: accentSmall }}>{t('booth.worth', { location: b.location, points: b.points })}</div>
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

      {/* `kiosk:` (wide AND tall, see index.css) rather than `sm:`: a phone on its side is 844px
          wide, and as a `flex-1` row of a 390px-tall stage the code overflowed under the notices. */}
      <section ref={sectionRef} className="relative flex flex-col items-center justify-center gap-[3vh] px-4 py-[max(2vh,1.5rem)] kiosk:min-h-0 kiosk:flex-1 kiosk:py-0">
        <QRFrame size={size} accentColor={b.accentColor} payload={token.payload} counter={token.counter} left={left} urgent={urgent} />
        {/* On glass: a 2em accent-coloured word is the one thing on this screen that must never
            be hard to read from across a hall, and the wave field runs right under it. The
            `max()` floors only bite on a phone, where 0.5em of the scaled base is 8px. */}
        <div ref={codeRef} className="glass px-[2em] py-[0.6em] text-center">
          <div className="stamp-text text-[length:max(0.55em,0.7rem)] text-ink-soft">{t('booth.manualCode')}</div>
          <div key={token.counter} className="code-swap fig text-[2em] tracking-[0.15em] sm:text-[2.4em] sm:tracking-[0.25em]" style={{ color: accent }}>
            {formatManualCode(token.token)}
          </div>
          <div className="text-[length:max(0.5em,0.8rem)] text-ink-soft">
            {t('booth.rotatesIn')} <span className="tabular-nums">{Math.ceil(msLeft / 1000)}</span> {t('booth.seconds')}
          </div>
        </div>
        {/* Phone only: the one thing an organizer does with this screen is hold it up to someone. */}
        <div className="flex w-full max-w-sm flex-col gap-2 kiosk:hidden">
          <button type="button" onClick={openShow} className="btn-primary btn-lg w-full">
            {Icon.fullscreen}{t('booth.showCode')}
          </button>
        </div>
      </section>

      {/*
        * Three glass panels rather than three bare columns, and every one centred: the first two
        * used to sit left and the third right, so the row read as two figures pushed apart. The
        * footer's own top rule is gone — each panel now carries its own edge.
        */}
      <footer className="grid grid-cols-3 gap-2 px-[4vw] pt-[2vh] pb-[calc(2vh_+_env(safe-area-inset-bottom,0px))] sm:gap-4">
        {[
          { value: fmt(stat.data?.stamps), label: t('booth.visitorsHere') },
          { value: fmt(ev.totals.stamps), label: t('booth.eventTotal') },
          { value: stat.data?.rank ? `#${stat.data.rank}` : '–', label: t('booth.rankOf', { count: boothCount || '–' }) },
        ].map((f) => (
          <div key={f.label} className="glass flex min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 py-[1.2vh] text-center">
            <div className="fig text-[1.8em] leading-none">{f.value}</div>
            <div className="stamp-text text-[length:max(0.5em,0.7rem)] leading-tight text-balance text-ink-soft">{f.label}</div>
          </div>
        ))}
      </footer>
    </main>
    {/*
      * Show code. White, not the sky ground: a phone camera locks onto a QR fastest against a flat
      * field, and the organizer is a metre from the visitor, not across a hall. Landscape puts the
      * code and the words side by side so the QR gets the whole short side.
      */}
    {show && (
      <div
        role="dialog" aria-modal="true" aria-label={t('booth.showCode')}
        className="scrim-in fixed inset-0 z-50 flex flex-col gap-4 bg-white text-ink landscape:flex-row print:hidden"
        style={{ padding: 'max(1rem, env(safe-area-inset-top, 0px)) max(1rem, env(safe-area-inset-right, 0px)) max(1rem, env(safe-area-inset-bottom, 0px)) max(1rem, env(safe-area-inset-left, 0px))' }}
      >
        <div ref={bigRef} className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3">
          {/* Only the notice a visitor's scan depends on; the rest waits on the screen behind. */}
          {live && !live.active && <Notice tone="red">{t('booth.switchedOff')}</Notice>}
          <QRFrame size={bigSize} accentColor={b.accentColor} payload={token.payload} counter={token.counter} left={left} urgent={urgent} />
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center gap-2 text-center landscape:w-[38%]">
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: accent }}>{pick(b.nameEn, b.nameTh)}</h1>
          <div className="stamp-text text-ink-soft">{t('booth.manualCode')}</div>
          <div key={token.counter} className="code-swap fig text-[clamp(2.25rem,12vmin,5rem)] tracking-[0.18em]" style={{ color: accent }}>
            {formatManualCode(token.token)}
          </div>
          <div className="text-sm text-ink-soft">
            {t('booth.rotatesIn')} <span className="tabular-nums">{Math.ceil(msLeft / 1000)}</span> {t('booth.seconds')}
          </div>
          {offline && <LiveDot state="offline">{t('status.offlineCodes')}</LiveDot>}
          <div className="mt-2 w-full max-w-sm">
            <button type="button" onClick={closeShow} className="btn-quiet btn-lg w-full">{t('booth.closeCode')}</button>
          </div>
        </div>
      </div>
    )}
    {/* Only exists on paper: a static card, since the rotating QR above cannot be printed. */}
    <div className="hidden print:block"><BoothCard booth={b} origin={APP_ORIGIN} period={session.period} /></div>
    </>
  )
}
