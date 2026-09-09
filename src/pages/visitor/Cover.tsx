import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useBooths, useEvent, useTiers } from '../../lib/data'
import { useCollection } from '../../lib/data'
import { collection, limit, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { feedbackFormUrl, type FeedbackFormDoc } from '../../../shared/model'
import { eventMark } from '../../lib/eventText'
import { Crest, Spinner, fmt } from '../../components/ui'
import { PaperHills } from '../auth/parts'

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
  const event = useEvent()
  const feedbackForm = useCollection<FeedbackFormDoc>(query(collection(db, 'feedbackForms'), limit(1)), [], 'the feedback form').data[0]
  if (!profile) return <Spinner />
  const points = profile.points ?? 0
  const { sorted, reached, next, pct } = tierProgress(points, tiers)
  const r = 54, c = 2 * Math.PI * r

  return (
    <main className="px-5 pt-6">
      <section className="relative isolate overflow-hidden rounded-[36px] bg-chrome px-6 py-8 text-white shadow-float">
        {/* The passport cover is a printed object: the mountains show through the board, the way
            the design system's guest kit sets them behind it. */}
        <PaperHills className="pointer-events-none absolute -bottom-4 left-[-15%] -z-10 h-40 w-[130%]" opacity={0.18} />
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-foil/20" />
        <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full border border-foil/10" />
        <div className="stamp-text text-foil">Mae Fah Luang University</div>
        <div className="mt-1 text-lg font-semibold tracking-wide">{eventMark(event)}</div>
        <div className="mt-8 flex items-center gap-5">
          <Crest className="h-20 w-20 shrink-0 text-foil" />
          <div className="min-w-0">
            <div className="stamp-text text-on-chrome-soft">Passport</div>
            <div className="truncate text-2xl font-bold">{profile.displayName}</div>
            <div className="font-mono text-sm tracking-widest text-foil">{profile.passportNo}</div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="fig text-5xl text-foil">{fmt(points)}</div>
            <div className="stamp-text text-on-chrome-soft">points · {profile.stampCount ?? 0} of {booths.length} stamps</div>
          </div>
          <div className="relative h-24 w-24 shrink-0 xs:h-32 xs:w-32">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(207,227,234,.15)" strokeWidth="8" />
              <circle cx="64" cy="64" r={r} fill="none" stroke="#F5C63C" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease-out' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="fig text-xl">{next ? next.thresholdPoints - points : '✓'}</div>
                <div className="text-[11px] uppercase tracking-wider text-on-chrome-soft">{next ? 'to go' : 'top tier'}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Tier strip with live remaining stock (event planners' request) — wraps on narrow phones. */}
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          {sorted.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${reached.includes(t) ? 'bg-foil' : 'bg-white/25'}`} />
              <span className={`text-xs ${reached.includes(t) ? 'text-foil' : 'text-on-chrome-soft'}`}>{t.name}</span>
              {t.stockTotal > 0 && (
                <span className={`text-[11px] ${t.stockRemaining <= 0 ? 'text-danger-text' : 'text-on-chrome-soft'}`}>
                  {t.stockRemaining <= 0 ? 'sold out' : `${fmt(t.stockRemaining)} left`}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-on-chrome-soft">
          {next ? <><b>{next.thresholdPoints - points} more points</b> to {next.name} — {next.reward.toLowerCase()}.</> : <>You have reached every tier. Show your Prize page at the desk.</>}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 xs:grid-cols-2">
        <Link to="/scan" className="card flex flex-col gap-1 hover:bg-white">
          <span className="stamp-text text-ink-soft">Next</span>
          <span className="font-semibold">Scan a booth</span>
          <span className="text-xs text-ink-soft">Point your camera at the booth screen</span>
        </Link>
        <Link to="/passport/stamps" className="card flex flex-col gap-1 hover:bg-white">
          <span className="stamp-text text-ink-soft">Route</span>
          <span className="font-semibold">See what's worth most</span>
          <span className="text-xs text-ink-soft">Far-corner booths pay 20 points</span>
        </Link>
        {feedbackForm && (
          <a href={feedbackFormUrl(feedbackForm, profile.passportNo)} target="_blank" rel="noreferrer" className="card flex flex-col gap-1 hover:bg-white xs:col-span-2">
            <span className="stamp-text text-ink-soft">Tell us</span>
            <span className="font-semibold">Give feedback</span>
            <span className="text-xs text-ink-soft">Two minutes, opens in Google Forms</span>
          </a>
        )}
      </section>

    </main>
  )
}
