import { useEffect, useRef, useState } from 'react'
import { useDismissable } from '../lib/useDismissable'

/**
 * A date and time field with a calendar we own.
 *
 * `<input type="datetime-local">` was the honest first answer, and it is what this replaces. Two
 * things pushed it out. The picker is the operating system's, so on the Linux and Windows machines
 * the office actually uses it arrives as a grey system panel with no relation to anything else on
 * the page; and its text half reads `09/16/2026, 09:00 AM`, a US order nobody at MFU writes, with
 * no way to change it short of changing the machine's locale.
 *
 * The value stays in `datetime-local`'s own `YYYY-MM-DDTHH:mm` local wall-clock format, so the
 * Event page's maths is untouched and this can be swapped back at any time.
 *
 * Local-time arithmetic throughout, on plain year/month/day numbers. Building a `Date` from the
 * string and reading it back is where date pickers get their off-by-one-day bugs: the string has
 * no zone, `Date` assumes one, and Bangkok is +07.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface Parts { y: number; mo: number; d: number; h: number; mi: number }

function parse(v: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v)
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0) } : null
}
const format = (p: Parts) => `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
const daysIn = (y: number, mo: number) => new Date(y, mo + 1, 0).getDate()

/** Clamped, so 31 January stepping to February lands on the 28th rather than sliding into March. */
function shiftMonth(p: Parts, by: number): Parts {
  const t = new Date(p.y, p.mo + by, 1)
  const y = t.getFullYear(), mo = t.getMonth()
  return { ...p, y, mo, d: Math.min(p.d, daysIn(y, mo)) }
}
/** Day arithmetic through `Date` is safe here — it is one local instant to another, no parsing. */
function shiftDay(p: Parts, by: number): Parts {
  const t = new Date(p.y, p.mo, p.d + by)
  return { ...p, y: t.getFullYear(), mo: t.getMonth(), d: t.getDate() }
}

const label = (p: Parts) => `${p.d} ${MONTHS[p.mo].slice(0, 3)} ${p.y} · ${pad(p.h)}:${pad(p.mi)}`

export function DateTimeField({ value, onChange, id, ariaLabel }: {
  /** `YYYY-MM-DDTHH:mm`, or empty. */
  value: string
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useDismissable(ref)

  const now = new Date()
  const today: Parts = { y: now.getFullYear(), mo: now.getMonth(), d: now.getDate(), h: 9, mi: 0 }
  const picked = parse(value)
  // What the grid is showing and which day the keyboard is on. Seeded from the value, or today.
  const [cursor, setCursor] = useState<Parts>(picked ?? today)

  // Reopening after a change elsewhere should show the value that is there now, not the month the
  // last visit wandered to.
  useEffect(() => { if (open) setCursor(parse(value) ?? today) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // The keyboard moves a cursor; focus follows it, so the roving tabstop needs re-applying after
  // each move. Only while open, and only inside the grid.
  useEffect(() => {
    if (!open) return
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [open, cursor.y, cursor.mo, cursor.d])

  const commit = (p: Parts) => { onChange(format(p)); const el = ref.current; if (el) { el.open = false; el.querySelector('summary')?.focus() } }

  function onGridKey(e: React.KeyboardEvent) {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (by !== undefined) { e.preventDefault(); return setCursor(shiftDay(cursor, by)) }
    if (e.key === 'PageUp') { e.preventDefault(); return setCursor(shiftMonth(cursor, -1)) }
    if (e.key === 'PageDown') { e.preventDefault(); return setCursor(shiftMonth(cursor, 1)) }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(cursor) }
  }

  const lead = new Date(cursor.y, cursor.mo, 1).getDay()
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn(cursor.y, cursor.mo) }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  const isPicked = (d: number) => !!picked && picked.y === cursor.y && picked.mo === cursor.mo && picked.d === d
  const isToday = (d: number) => today.y === cursor.y && today.mo === cursor.mo && today.d === d

  return (
    <details ref={ref} className="relative" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary id={id} className="field flex cursor-pointer list-none items-center gap-2" aria-label={ariaLabel} aria-haspopup="dialog">
        <span aria-hidden className="shrink-0 text-ink-soft">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
        </span>
        <span className={`min-w-0 flex-1 truncate text-left ${picked ? '' : 'text-ink-soft/70'}`}>{picked ? label(picked) : 'Pick a date and time'}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-ink-soft transition-transform duration-150 [[open]_&]:rotate-180">▾</span>
      </summary>

      <div className="pop absolute left-0 z-40 mt-1 w-[19rem] rounded-2xl bg-white p-3 text-ink shadow-lg ring-1 ring-black/10">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-quiet btn-sm btn-icon-sm" aria-label="Previous month" onClick={() => setCursor(shiftMonth(cursor, -1))}>‹</button>
          <div aria-live="polite" className="text-sm font-semibold">{MONTHS[cursor.mo]} {cursor.y}</div>
          <button type="button" className="btn-quiet btn-sm btn-icon-sm" aria-label="Next month" onClick={() => setCursor(shiftMonth(cursor, 1))}>›</button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-wider text-ink-soft" aria-hidden>
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>

        {/* One tabstop for the whole grid: 31 of them would make Tab a way of leaving the month. */}
        <div ref={grid} role="grid" aria-label="Choose a day" className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
          {cells.map((d, i) => d === null ? <div key={`x${i}`} /> : (
            <button
              key={d} type="button" role="gridcell" tabIndex={d === cursor.d ? 0 : -1}
              aria-selected={isPicked(d)} aria-current={isToday(d) ? 'date' : undefined}
              onClick={() => commit({ ...cursor, d })}
              onFocus={() => { if (d !== cursor.d) setCursor({ ...cursor, d }) }}
              className={`h-9 rounded-lg text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700/40 active:scale-[0.94]
                ${isPicked(d) ? 'bg-action font-semibold text-white' : 'hover:bg-ink/8'}
                ${isToday(d) && !isPicked(d) ? 'font-semibold text-action ring-1 ring-action/40' : ''}`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t rule pt-3">
          <label className="text-xs text-ink-soft" htmlFor={`${id ?? 'dt'}-time`}>Time</label>
          {/* Native, deliberately: a time input is a segmented text field you can type into, not an
              OS popup menu, so it has neither problem the calendar above was built to solve. */}
          <input
            id={`${id ?? 'dt'}-time`} type="time" className="field w-auto py-1.5 text-sm"
            value={`${pad(cursor.h)}:${pad(cursor.mi)}`}
            onChange={(e) => {
              const t = parse(`2000-01-01T${e.target.value}`)
              if (!t) return
              const next = { ...cursor, h: t.h, mi: t.mi }
              setCursor(next)
              if (picked) onChange(format({ ...next, y: picked.y, mo: picked.mo, d: picked.d }))
            }}
          />
          <button type="button" className="btn-quiet btn-sm ml-auto" onClick={() => { setCursor({ ...today, h: cursor.h, mi: cursor.mi }); commit({ ...today, h: cursor.h, mi: cursor.mi }) }}>Today</button>
        </div>
      </div>
    </details>
  )
}
