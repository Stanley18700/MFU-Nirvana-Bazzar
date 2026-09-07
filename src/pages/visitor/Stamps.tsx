import { useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useBooths } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { Spinner } from '../../components/ui'
import { EVENT_DAYS, dayOf, type BoothDoc } from '../../../shared/model'

function tiltFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(h) % 9) - 4) * 1.5 // -6 … +6 degrees, stable per booth
}

function dayLabel(day: string) {
  const i = (EVENT_DAYS as readonly string[]).indexOf(day)
  return i >= 0 ? `Day ${i + 1}` : day
}

export default function Stamps() {
  const { profile } = useAuth()
  const booths = useBooths()
  const [open, setOpen] = useState<(BoothDoc & { id: string }) | null>(null)
  const today = dayOf(new Date())

  const { collected, remaining } = useMemo(() => {
    const have = new Set(profile?.stampedBoothIds ?? [])
    const collected = booths.filter((b) => have.has(b.id))
    // §4.2 — uncollected sorted by value so the 20-point booths lead; this is what turns points into a route.
    const remaining = booths.filter((b) => !have.has(b.id)).sort((a, b) => b.points - a.points || a.sortOrder - b.sortOrder)
    return { collected, remaining }
  }, [booths, profile])

  if (!profile) return <Spinner />
  const remainingPoints = remaining.reduce((s, b) => s + b.points, 0)

  return (
    <main className="px-5 pt-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="stamp-text text-navy-soft">Stamps</div>
          <h1 className="text-2xl font-bold">{collected.length} of {booths.length}</h1>
        </div>
        <div className="text-right text-sm text-navy-soft">{remainingPoints} points still on the floor</div>
      </header>

      {remaining.length > 0 && (
        <section className="mt-6">
          <h2 className="stamp-text text-navy-soft">Still to collect · highest value first</h2>
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {remaining.map((b) => {
              const notToday = !b.activeDays.includes(today) && (EVENT_DAYS as readonly string[]).includes(today)
              return (
                <li key={b.id}>
                  <button onClick={() => setOpen(b)} className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed rule bg-white/40 p-2 text-center">
                    <Stamp booth={b} collected={false} points={b.points} size={76} />
                    <span className="line-clamp-2 text-xs font-medium leading-tight">{b.nameEn}</span>
                    <span className="stamp-text" style={{ color: b.accentColor }}>{b.points} pts</span>
                    {notToday && <span className="text-[10px] text-amber">{b.activeDays.map(dayLabel).join(' · ')}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="stamp-text text-navy-soft">Collected</h2>
        {collected.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white/40 p-6 text-center text-sm text-navy-soft">No stamps yet. Tap <b>Scan</b> at your first booth.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {collected.map((b) => (
              <li key={b.id}>
                <button onClick={() => setOpen(b)} className="flex w-full flex-col items-center gap-1 rounded-2xl bg-paper-2 p-2 text-center">
                  <Stamp booth={b} collected tilt={tiltFor(b.id)} size={76} />
                  <span className="line-clamp-2 text-xs font-medium leading-tight">{b.nameEn}</span>
                  <span className="text-[10px] text-navy-soft">✓ +{b.points} pts</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy-deep/60 p-4 sm:items-center" onClick={() => setOpen(null)}>
          <div className="card w-full max-w-md bg-paper page-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <Stamp booth={open} collected={profile.stampedBoothIds?.includes(open.id) ?? false} size={72} points={open.points} />
              <div className="min-w-0 flex-1">
                <div className="stamp-text" style={{ color: open.accentColor }}>{open.location} · {open.points} points</div>
                <h3 className="text-lg font-bold leading-tight">{open.nameEn}</h3>
                <div className="text-sm text-navy-soft">{open.hostUnit}</div>
              </div>
            </div>
            {open.descriptionEn && <p className="mt-3 text-sm">{open.descriptionEn}</p>}
            <p className="mt-2 text-xs text-navy-soft">Present: {open.activeDays.map(dayLabel).join(', ')}</p>
            <button className="btn-ghost mt-4 w-full" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  )
}
