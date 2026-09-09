import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useBooths, useEvent } from '../../lib/data'
import { Stamp } from '../../components/Stamp'
import { stampMarks } from '../../lib/eventText'
import { Spinner } from '../../components/ui'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { dayOf, type BoothDoc } from '../../../shared/model'

function tiltFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(h) % 9) - 4) * 1.5 // -6 … +6 degrees, stable per booth
}

function makeDayLabel(days: string[]) {
  return (day: string) => {
    const i = days.indexOf(day)
    return i >= 0 ? `Day ${i + 1}` : day
  }
}

export default function Stamps() {
  const { profile } = useAuth()
  const booths = useBooths()
  const event = useEvent()
  const dayLabel = makeDayLabel(event.days)
  const marks = stampMarks(event)
  const [open, setOpen] = useState<(BoothDoc & { id: string }) | null>(null)
  const [full, setFull] = useState<(BoothDoc & { id: string }) | null>(null)
  useBodyScrollLock(!!open)
  const today = dayOf(new Date())

  const { collected, remaining } = useMemo(() => {
    const have = new Set(profile?.stampedBoothIds ?? [])
    const collected = booths.filter((b) => have.has(b.id))
    // §4.2 — uncollected sorted by value so the 20-point booths lead; this is what turns points into a route.
    const remaining = booths.filter((b) => !have.has(b.id)).sort((a, b) => b.points - a.points || a.sortOrder - b.sortOrder)
    return { collected, remaining }
  }, [booths, profile])

  if (!profile) return <Spinner />
  const have = !!open && (profile.stampedBoothIds?.includes(open.id) ?? false)
  const remainingPoints = remaining.reduce((s, b) => s + b.points, 0)

  return (
    <main className="px-5 pt-6">
      <header>
        <div className="stamp-text text-ink-soft">Stamps</div>
        <div className="mt-1 flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{collected.length} of {booths.length}</h1>
        </div>
        {/* "1 of 12" was the only account of progress on a page whose whole subject is progress. */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${collected.length} of ${booths.length} booths stamped`}>
          <div className="h-full rounded-full bg-action transition-[width] duration-500 ease-out" style={{ width: `${booths.length ? (collected.length / booths.length) * 100 : 0}%` }} />
        </div>
      </header>

      {/*
        * Your stamps first. The collected section was below eleven things you had not done, so a
        * passport — a collection — opened on its own to-do list, and the one visa you had earned
        * was a long scroll away. Full width, because a visa is the reward and the reward is worth
        * reading; the two-up grid put a detailed document at thumbnail size.
        */}
      <section className="mt-7">
        <h2 className="stamp-text text-ink-soft">Your stamps</h2>
        {collected.length === 0 ? (
          <p className="mt-3 rounded-[20px] bg-white p-6 text-center text-sm text-ink-soft shadow-card">No stamps yet. Tap <b>Scan</b> at your first booth.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {collected.map((b) => (
              <li key={b.id}>
                <button onClick={() => setOpen(b)} className="press-row flex w-full cursor-pointer items-center gap-4 rounded-[20px] bg-white p-3 text-left shadow-card transition hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/45">
                  <Stamp booth={b} collected tilt={tiltFor(b.id)} size={132} points={b.points} {...marks} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">{b.nameEn}</span>
                    <span className="mt-1 block text-xs text-success-text">Stamped · +{b.points} pts</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        * What is left is a route through the hall, not a collection, so it is a list rather than a
        * wall of faded visas. The short code is what is printed on the booth itself, and the points
        * are what the ordering is for.
        */}
      {remaining.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="stamp-text text-ink-soft">Still to collect</h2>
            <span className="text-xs text-ink-soft">{remainingPoints} points still on the floor</span>
          </div>
          <ul className="mt-3 overflow-hidden rounded-[20px] bg-white shadow-card">
            {remaining.map((b) => {
              const notToday = !b.activeDays.includes(today) && event.days.includes(today)
              return (
                <li key={b.id} className="border-t rule first:border-t-0">
                  <button onClick={() => setOpen(b)} className="press-row flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ink/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/45">
                    {/* The visa itself, uncollected. Below 150px the component drops to its plain
                        variant, which is what a row-height preview wants — the shape and the booth's
                        own code, not the micro-print. */}
                    <Stamp booth={b} collected={false} size={84} points={b.points} {...marks} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{b.nameEn}</span>
                      {notToday && <span className="block text-[11px] text-warn-text">{b.activeDays.map(dayLabel).join(' · ')} only</span>}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">{b.points} pts</span>
                    <span aria-hidden className="shrink-0 text-ink-soft">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {open && (
        <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-ink/60 p-4 sm:items-center" onClick={() => setOpen(null)}>
          <div className="card card-static sheet-in w-full max-w-md bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <Stamp booth={open} collected={have} size={152} points={open.points} {...marks} />
              <div className="min-w-0 flex-1">
                <div className="stamp-text text-ink-soft">{open.location} · {open.points} points</div>
                <h3 className="text-lg font-bold leading-tight">{open.nameEn}</h3>
                <div className="text-sm text-ink-soft">{open.hostUnit}</div>
              </div>
            </div>
            {open.descriptionEn && <p className="mt-3 text-sm">{open.descriptionEn}</p>}
            <p className="mt-2 text-xs text-ink-soft">Present: {open.activeDays.map(dayLabel).join(', ')}</p>
            <div className="mt-4 flex gap-2">
              {/* Only for a visa that has actually been issued — there is nothing to admire about
                  an unstamped one, and offering it would read as a way to claim it. */}
              {have && <button className="btn-secondary flex-1" onClick={() => setFull(open)}>View full screen</button>}
              <button className={`btn-ghost ${have ? '' : 'flex-1'} ${have ? 'px-5' : 'w-full'}`} onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {full && <StampViewer booth={full} marks={marks} onClose={() => setFull(null)} />}
    </main>
  )
}

/**
 * The visa at the size it was drawn for, and the only place in the app that shows it that way.
 *
 * A real `<dialog>`: Escape, the focus trap and `inert` on the page behind are the browser's, and
 * the visa is 105 x 74 — landscape — so on a phone held upright it is turned a quarter turn and
 * fills the screen the way a passport page does when you tilt it. The two widths are the same
 * expression with the axes swapped; 133 is 94 x the 105/74 ratio.
 */
function StampViewer({ booth, marks, onClose }: {
  booth: BoothDoc & { id: string }
  marks: { markTop: string; markBottom: string }
  onClose: () => void
}) {
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dlg.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={dlg} onClose={onClose} onClick={onClose} aria-label={`${booth.nameEn} visa`}
      // The ground is on the dialog itself, not on `::backdrop`: the element already covers
      // the viewport, and one fill is cheaper than a variant that has to survive a Tailwind upgrade.
      className="m-0 h-dvh max-h-none w-full max-w-none bg-ink/90 p-0"
    >
      {/* Absolutely centred, not grid-centred: turned a quarter turn the visa is laid out wider
          than the screen, and an oversized grid item is aligned safely — pushed to one edge — so
          its right-hand third was cut off. */}
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute left-1/2 top-1/2 w-[min(94vw,133vh)] -translate-x-1/2 -translate-y-1/2 portrait:w-[min(94vh,133vw)] portrait:rotate-90">
          <Stamp booth={booth} collected size={720} points={booth.points} className="!w-full" {...marks} />
        </div>
      </div>
      {/* Outside the rotation, so the way back is upright wherever the phone is. */}
      <button
        type="button" onClick={onClose} autoFocus
        className="btn-quiet btn-sm fixed right-4 top-4 shadow-raised"
      >
        Close
      </button>
    </dialog>
  )
}
