import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useBooths, useEvent, useTiers } from '../../lib/data'
import { eventMark } from '../../lib/eventText'
import { Crest, Spinner, fmt } from '../../components/ui'
import { dayOf } from '../../../shared/model'

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
  if (!profile) return <Spinner />
  const points = profile.points ?? 0
  const { sorted, reached, next, pct } = tierProgress(points, tiers)
  const r = 54, c = 2 * Math.PI * r

  /*
   * The one thing the tab bar cannot tell you: which booth to walk to. Worth the most, open today,
   * not yet stamped — the same ordering the Stamps route uses, resolved to a single answer.
   */
  const stamped = new Set(profile.stampedBoothIds ?? [])
  const today = dayOf(new Date())
  const nextBooth = booths
    .filter((b) => !stamped.has(b.id) && (!event.days.includes(today) || b.activeDays.includes(today)))
    .sort((a, b) => b.points - a.points || a.sortOrder - b.sortOrder)[0]

  return (
    <main className="px-5 pt-6">
      <section className="relative isolate overflow-hidden rounded-[36px] bg-chrome/85 px-6 py-8 text-white shadow-float backdrop-blur-xl">
        {/* The passport cover is a printed object: the mountains show through the board, the way
            the design system's guest kit sets them behind it. */}
        {/*
          * The campus at the size and strength the design system's own guest kit gives it — wider
          * than the card, pushed off its left edge, and fading in from a quarter down rather than
          * from halfway. It was 16% of a card-width image masked away until nothing but a haze
          * survived at the very bottom, so the one piece of artwork on the passport's own cover
          * was the thing you could not see.
          */}
        <img
          src="/brand/illus-campus-papercut.webp" alt="" aria-hidden
          className="pointer-events-none absolute -bottom-5 left-[-11%] -z-10 w-[128%] max-w-none opacity-[0.22]"
          style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 26%)', maskImage: 'linear-gradient(to bottom, transparent, #000 26%)' }}
        />
        {/*
          * Blind embossing, the way a real cover carries its border: the card's own colour lifted
          * a few percent. The two gold arcs that were here are in no part of the design system —
          * clipped by the corner they read as a moon, and they were the only foil above the crest,
          * competing with it. An inset frame is also the visa's own language, which draws two.
          */}
        <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[28px] ring-1 ring-inset ring-white/[0.12]" />
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
        {/* Which tiers you have reached, and nothing else. The remaining stock used to sit here
            too — an organiser's fact, three lines long, on the one screen a visitor opens most.
            It is on the Prize tab, beside the tier it belongs to. */}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          {sorted.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${reached.includes(t) ? 'bg-foil' : 'bg-white/25'}`} />
              <span className={`text-xs ${reached.includes(t) ? 'text-foil' : 'text-on-chrome-soft'}`}>{t.name}</span>
            </div>
          ))}
        </div>
        {/* The ring already says how many points to go. This says what they are for. */}
        <p className="mt-3 text-sm text-on-chrome-soft">
          {next ? <>Next up: <b className="text-white">{next.name}</b> — {next.reward.toLowerCase()}.</> : <>You have reached every tier. Show your Prize page at the desk.</>}
        </p>
      </section>

      {/*
        * Two cards used to sit here, one pointing at the scan button three centimetres below it and
        * one pointing at the Stamps tab beside it. A third of the screen spent restating the tab
        * bar. This answers the question the tab bar cannot: where to walk next.
        */}
      <section className="mt-6">
        {nextBooth ? (
          <Link to="/passport/stamps" className="card press-row flex items-center gap-4 hover:bg-white">
            <span className="min-w-0 flex-1">
              <span className="stamp-text block text-ink-soft">Go here next</span>
              <span className="mt-1 block truncate text-lg font-semibold">{nextBooth.nameEn}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-soft">{nextBooth.location}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="fig block text-2xl text-action">{nextBooth.points}</span>
              <span className="stamp-text block text-[10px] text-ink-soft">points</span>
            </span>
          </Link>
        ) : (
          <div className="card text-center text-sm text-ink-soft">
            {stamped.size >= booths.length && booths.length > 0
              ? 'Every booth stamped. Take your passport to the prize desk.'
              : 'Nothing left to collect today — check back tomorrow for the booths that rotate.'}
          </div>
        )}
      </section>

    </main>
  )
}
