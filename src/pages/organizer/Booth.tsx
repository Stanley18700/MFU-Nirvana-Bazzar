import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { useBoothStat, useBooths, useEventStats } from '../../lib/data'
import { QR } from '../../components/QR'
import { Notice, Spinner, fmt } from '../../components/ui'
import { APP_ORIGIN } from '../../lib/firebase'
import { buildPayload, computeToken, counterFor, formatManualCode, msUntilRotation } from '../../../shared/token'
import type { BoothDoc } from '../../../shared/model'

interface Session { boothId: string; booth: BoothDoc; secret: string; period: number; skew: number }

/** §5.1 — the booth screen. Runs all day with nothing to press; keeps rotating offline. */
export default function Booth() {
  const { role, boothId: claimBooth } = useAuth()
  const [params] = useSearchParams()
  const boothId = role === 'admin' ? params.get('boothId') ?? undefined : claimBooth ?? undefined
  const [session, setSession] = useState<Session | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [token, setToken] = useState<{ counter: number; token: string; payload: string } | null>(null)
  const [msLeft, setMsLeft] = useState(0)
  const [offline, setOffline] = useState(!navigator.onLine)
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    api.boothSession(boothId ? { boothId } : {})
      .then((r) => { if (!cancelled) setSession({ boothId: r.boothId, booth: r.booth as unknown as BoothDoc, secret: r.secret, period: r.period, skew: r.serverTime - Date.now() }) })
      .catch((e) => setErr(errorMessage(e)))
    return () => { cancelled = true }
  }, [boothId])

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

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // The QR is sized from the viewport, so it must follow a rotation or a resize.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const resize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize)
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize) }
  }, [])

  // Keeping the screen awake is always welcome; going fullscreen is not, on a phone the
  // organizer is also using for other things — so it needs an explicit press.
  const requestWake = async () => {
    try { wakeLock.current = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* not supported */ }
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen() } catch { /* denied */ }
  }
  useEffect(() => {
    void (async () => {
      try { wakeLock.current = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* not supported */ }
    })()
    return () => { void wakeLock.current?.release().catch(() => undefined) }
  }, [])

  const stat = useBoothStat(session?.boothId ?? null)
  const ev = useEventStats()
  const boothCount = useBooths().length

  if (err) return <main className="grid min-h-full place-items-center bg-navy-deep p-8"><div className="max-w-md"><Notice tone="red">{err}</Notice><Link className="btn-ghost mt-4 text-paper" to="/">Home</Link></div></main>
  if (!session || !token) return <main className="min-h-full bg-navy-deep text-paper"><Spinner label="Starting booth screen…" /></main>

  const b = session.booth
  // Fit inside the white frame (p-5) + accent ring (10px) + section padding (px-4) — ~96px total.
  const size = Math.max(160, Math.round(Math.min(vp.w - 96, vp.h * 0.5, 520)))
  const fresh = !offline && !stat.fromCache && !ev.fromCache
  const dot = offline ? '#E0533D' : (stat.fromCache || ev.fromCache) ? '#D4762A' : '#1E8A6E'

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
    <main className="booth-screen relative flex min-h-full flex-col bg-navy-deep text-paper">
      <header className="flex items-start justify-between gap-3 px-[4vw] pt-[3vh]">
        <div className="min-w-0">
          <div className="stamp-text text-[0.55em]" style={{ color: b.accentColor }}>{b.location} · This badge is worth {b.points} points</div>
          <h1 className="mt-1 text-[1.6em] font-bold leading-tight">{b.nameEn}</h1>
          <div className="text-[0.6em] text-paper/60">{b.hostUnit}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[0.5em] text-paper/60">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: dot }} />
          <span className="hidden xs:inline">{offline ? 'Offline — codes still valid' : fresh ? 'Live' : 'Reconnecting — codes still valid'}</span>
          <button onClick={requestWake} className="rounded border border-white/20 px-2 py-1 text-paper/70" title="Full screen">⛶</button>
        </div>
      </header>

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
          <div className="stamp-text text-[0.5em] text-paper/60">Rank of {boothCount || '–'} booths · <Link to="/booth/stats" className="underline">stats</Link></div>
        </div>
      </footer>
    </main>
  )
}
