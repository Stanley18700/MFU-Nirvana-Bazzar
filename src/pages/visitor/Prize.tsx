import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useMyUnlocks, useTiers } from '../../lib/data'
import { api } from '../../lib/api'
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
  const { profile } = useAuth()
  const tiers = useTiers().filter((t) => t.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const unlocks = useMyUnlocks(profile?.id)
  const anyUnlockedUnredeemed = unlocks.some((u) => !u.redeemedAt && !u.voidedAt) || unlocks.some((u) => !!u.voidedAt)
  const code = useRedemptionCode(anyUnlockedUnredeemed)
  if (!profile) return <Spinner />
  const points = profile.points ?? 0

  return (
    <main className="px-5 pt-6">
      <div className="stamp-text text-ink-soft">Prize</div>
      <h1 className="text-2xl font-bold">{fmt(points)} points</h1>

      {anyUnlockedUnredeemed && (
        <section className="relative mt-5 overflow-hidden rounded-3xl border-2 border-foil bg-white p-5 text-center shadow-xl shadow-foil/20">
          <div className="stamp-text text-foil">Entry visa · show this at the prize desk</div>
          <div className="mt-3 flex justify-center">
            {code ? <QR value={`${APP_ORIGIN}/r/${code.payload}`} size={200} /> : <div className="grid aspect-square w-[min(200px,60vw)] place-items-center text-sm text-ink-soft">Preparing your code…</div>}
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
          const lowStock = t.stockTotal > 0 && t.stockRemaining / t.stockTotal < 0.2
          return (
            <li key={t.id} className={`card flex items-center gap-4 ${unlocked ? 'ring-2 ring-foil/70' : 'opacity-80'}`}>
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${redeemed ? 'bg-success text-white' : unlocked ? 'bg-foil text-ink' : 'bg-ink/10 text-ink-soft'}`}>
                {redeemed ? '✓' : <span className="fig text-sm">{t.thresholdPoints}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name} <span className="text-xs font-normal text-ink-soft">· {t.thresholdPoints} pts</span></div>
                <div className="text-sm text-ink-soft">{t.reward}</div>
                {redeemed && <div className="text-xs text-success-text">Collected · thank you</div>}
                {/* Live remaining stock, always visible on every tier (event planners' request).
                    Supersedes the 20%-threshold rule in spec §4.4. */}
                {!redeemed && t.stockTotal > 0 && (t.stockRemaining <= 0
                  ? <div className="text-xs text-danger-text">{t.outOfStockNoteEn || 'This prize has run out'}</div>
                  : <div className={`text-xs ${lowStock ? 'text-warn-text' : 'text-ink-soft'}`}>{fmt(t.stockRemaining)} left</div>)}
                {!unlocked && <div className="text-xs text-ink-soft">{t.thresholdPoints - points} more points</div>}
                {t.grantsDrawEntry && <div className="text-xs text-foil">+ entry to the closing stage draw</div>}
              </div>
            </li>
          )
        })}
      </ul>

      {!anyUnlockedUnredeemed && <div className="mt-6"><Notice>Reach {tiers[0]?.thresholdPoints ?? 50} points and your redemption code appears here.</Notice></div>}
    </main>
  )
}
