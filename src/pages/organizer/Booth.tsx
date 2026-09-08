import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, friendlyError } from '../../lib/api'
import { useBooth, useBoothStat, useBooths, useEventStats } from '../../lib/data'
import { QR } from '../../components/QR'
import { BoothCard } from '../../components/BoothCard'
import { OrganizerBar } from '../../components/OrganizerBar'
import { DarkNotice, DataErrors, Spinner, fmt } from '../../components/ui'
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
  const { role, boothId: claimBooth, user, signOut } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') ?? undefined : claimBooth ?? undefined
  const [session, setSession] = useState<Session | null>(() => readCache(boothId))
  const [err, setErr] = useState<string | null>(null)
  const [token, setToken] = useState<{ counter: number; token: string; payload: string } | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [offline, setOffline] = useState(!navigator.onLine)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const lastFetch = useRef(0)
  const nav = useNavigate()
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
    if (!el.requestFullscreen) { setFsHint('Full screen is not available in this browser — press F11.'); return }
    el.requestFullscreen().then(() => setFsHint(null)).catch(() => setFsHint('Full screen was blocked — press F11 (⌃⌘F on a Mac).'))
  }

  // The QR is sized from the viewport, so it must follow a rotation or a resize.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const resize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize)
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize) }
  }, [])

  const stat = useBoothStat(session?.boothId ?? null)
  const ev = useEventStats()
  const boothCount = useBooths().length
  // The live booth document: an admin switching this booth off, or changing its days, shows up here.
  const live = useBooth(session?.boothId).data

  if (err && !session) {
    return (
      <main className="grid min-h-full place-items-center bg-navy-deep p-8 text-paper">
        <div className="flex w-full max-w-md flex-col gap-4">
          <div className="stamp-text text-gold">Booth screen</div>
          <h1 className="text-2xl font-bold">This screen could not start</h1>
          <DarkNotice tone="red">{err}</DarkNotice>
          <p className="text-sm text-paper/70">
            Signed in as <b className="text-paper">{user?.email ?? 'this account'}</b>.
            {role === 'organizer' && !claimBooth && <> No booth is linked to it yet — ask the admin to assign one, then open this page again.</>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-gold" onClick={() => { setErr(null); void load(true) }}>Try again</button>
            <button className="btn-dark" onClick={async () => { await signOut(); nav('/', { replace: true }) }}>Sign out</button>
          </div>
        </div>
      </main>
    )
  }
  if (!session || !token) return <main className="min-h-full bg-navy-deep text-paper"><Spinner label="Starting booth screen…" /></main>

  const b = live ?? session.booth
  // Fit inside the white frame (p-5) + accent ring (10px) + section padding (px-4) — ~96px total.
  const size = Math.max(160, Math.round(Math.min(vp.w - 96, vp.h * 0.5, 520)))
  const fresh = !offline && !stat.fromCache && !ev.fromCache
  const dot = offline ? '#E0533D' : (stat.fromCache || ev.fromCache) ? '#D4762A' : '#1E8A6E'
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
  const box = size + 2 * FRAME_PAD + 2 * inset
  const left = Math.max(0, Math.min(1, msLeft / (session.period * 1000)))
  const urgent = msLeft <= 3000

  return (
    <>
    <main className="booth-screen relative flex min-h-full flex-col bg-navy-deep text-paper print:hidden">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-[4vw] pt-[3vh]">
        <div className="min-w-0">
          <div className="stamp-text text-[0.55em]" style={{ color: b.accentColor }}>{b.location} · This badge is worth {b.points} points</div>
          <h1 className="mt-1 text-[1.6em] font-bold leading-tight">{b.nameEn}</h1>
          <div className="text-[0.6em] text-paper/60">{b.hostUnit}</div>
        </div>
        {/* Controls are sized in rem, not the kiosk em, so they stay readable on a phone and modest on a TV. */}
        {/* On a phone this takes the full width under the title; on a table screen it sits to the right. */}
        <div className="flex w-full min-w-0 flex-col items-start gap-1.5 text-sm sm:w-auto sm:max-w-[60%] sm:items-end">
          <div className="flex items-center gap-2 text-paper/70">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: dot }} aria-hidden />
            <span>{offline ? 'Offline — codes still valid' : fresh ? 'Live' : 'Reconnecting — codes still valid'}</span>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-1 sm:justify-end">
            {!fs && <button onClick={goFull} className="btn-dark btn-sm">Full screen</button>}
            {!fs && <button onClick={() => window.print()} className="btn-dark btn-sm" title="Print a table card for this booth">Print card</button>}
            <OrganizerBar boothId={session.boothId} dark compact />
          </div>
        </div>
      </header>
      <div className="mx-[4vw] mt-2 flex flex-col gap-2 text-sm">
        <DataErrors dark />
        {notice && <DarkNotice>{notice}</DarkNotice>}
        {fsHint && <DarkNotice tone="amber">{fsHint}</DarkNotice>}
        {live && !live.active && <DarkNotice tone="red">This booth was switched off by the admin — visitor scans are refused until it is switched back on.</DarkNotice>}
        {live?.active && offToday && <DarkNotice tone="amber">Not scheduled today on the visitors' stamp map — codes still work if someone scans.</DarkNotice>}
      </div>

      <section className="flex flex-1 flex-col items-center justify-center gap-[3vh] px-4">
        <div className="relative rounded-[2rem] bg-white p-5" style={{ boxShadow: `0 0 0 ${ACCENT}px ${b.accentColor}, 0 30px 80px rgba(0,0,0,.5)` }}>
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
              stroke={urgent ? '#D4762A' : 'rgba(233,229,220,.8)'}
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - left}
            />
          </svg>
        </div>
        <div className="text-center">
          <div className="stamp-text text-[0.55em] text-paper/60">Manual code</div>
          <div key={token.counter} className="code-swap fig text-[2em] tracking-[0.15em] sm:text-[2.4em] sm:tracking-[0.25em]" style={{ color: b.accentColor }}>
            {formatManualCode(token.token)}
          </div>
          <div className="text-[0.5em] text-paper/50">
            Rotates in <span className="tabular-nums">{Math.ceil(msLeft / 1000)}</span> s
          </div>
        </div>
      </section>

      <footer className="grid grid-cols-3 gap-2 border-t border-white/10 px-[4vw] py-[2.5vh] sm:gap-4">
        <div><div className="fig text-[1.8em]">{fmt(stat.data?.stamps)}</div><div className="stamp-text text-[0.5em] text-paper/60">Visitors here</div></div>
        <div><div className="fig text-[1.8em]">{fmt(ev.totals.stamps)}</div><div className="stamp-text text-[0.5em] text-paper/60">Event total</div></div>
        <div className="text-right">
          <div className="fig text-[1.8em]">{stat.data?.rank ? `#${stat.data.rank}` : '–'}</div>
          <div className="stamp-text text-[0.5em] text-paper/60">Rank of {boothCount || '–'} booths</div>
        </div>
      </footer>
    </main>
    {/* Only exists on paper: a static card, since the rotating QR above cannot be printed. */}
    <div className="hidden print:block"><BoothCard booth={b} origin={APP_ORIGIN} period={session.period} /></div>
    </>
  )
}
