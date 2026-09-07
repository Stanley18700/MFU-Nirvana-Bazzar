import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useBooths, useTiers } from '../../lib/data'
import { Crest, Spinner, fmt } from '../../components/ui'

export function tierProgress<T extends { id: string; name: string; thresholdPoints: number }>(points: number, tiers: T[]) {
  const sorted = [...tiers].sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const reached = sorted.filter((t) => points >= t.thresholdPoints)
  const next: T | null = sorted.find((t) => points < t.thresholdPoints) ?? null
  const prevThreshold = reached.length ? reached[reached.length - 1].thresholdPoints : 0
  const pct = next ? Math.min(1, (points - prevThreshold) / (next.thresholdPoints - prevThreshold)) : 1
  return { sorted, reached, next, pct }
}

export default function Cover() {
  const { profile } = useAuth()
  const tiers = useTiers().filter((t) => t.active)
  const booths = useBooths()
  if (!profile) return <Spinner />
  const points = profile.points ?? 0
  const { sorted, reached, next, pct } = tierProgress(points, tiers)
  const r = 54, c = 2 * Math.PI * r

  return (
    <main className="px-5 pt-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-8 text-paper shadow-2xl shadow-navy/30">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-gold/20" />
        <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full border border-gold/10" />
        <div className="stamp-text text-gold">Mae Fah Luang University</div>
        <div className="mt-1 text-lg font-semibold tracking-wide">MFU GO GLOBAL · 2026</div>
        <div className="mt-8 flex items-center gap-5">
          <Crest className="h-20 w-20 shrink-0 text-gold" />
          <div className="min-w-0">
            <div className="stamp-text text-paper/60">Passport</div>
            <div className="truncate text-2xl font-bold">{profile.displayName}</div>
            <div className="font-mono text-sm tracking-widest text-gold">{profile.passportNo}</div>
          </div>
        </div>
        <div className="mt-8 flex items-end justify-between">
          <div>
            <div className="fig text-5xl text-gold">{fmt(points)}</div>
            <div className="stamp-text text-paper/60">points · {profile.stampCount ?? 0} of {booths.length} stamps</div>
          </div>
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(233,229,220,.15)" strokeWidth="8" />
              <circle cx="64" cy="64" r={r} fill="none" stroke="#C8A24A" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease-out' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="fig text-xl">{next ? next.thresholdPoints - points : '✓'}</div>
                <div className="text-[10px] uppercase tracking-wider text-paper/60">{next ? 'to go' : 'top tier'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2">
          {sorted.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${reached.includes(t) ? 'bg-gold' : 'bg-paper/25'}`} />
              <span className={`text-xs ${reached.includes(t) ? 'text-gold' : 'text-paper/50'}`}>{t.name}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-paper/80">
          {next ? <><b>{next.thresholdPoints - points} more points</b> to {next.name} — {next.reward.toLowerCase()}.</> : <>You have reached every tier. Show your Prize page at the desk.</>}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Link to="/scan" className="card flex flex-col gap-1 hover:bg-paper-2/80">
          <span className="stamp-text text-navy-soft">Next</span>
          <span className="font-semibold">Scan a booth</span>
          <span className="text-xs text-navy-soft">Point your camera at the booth screen</span>
        </Link>
        <Link to="/passport/stamps" className="card flex flex-col gap-1 hover:bg-paper-2/80">
          <span className="stamp-text text-navy-soft">Route</span>
          <span className="font-semibold">See what's worth most</span>
          <span className="text-xs text-navy-soft">Far-corner booths pay 20 points</span>
        </Link>
      </section>
    </main>
  )
}
