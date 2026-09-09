import type { LiveEvent } from './data'
import { ms } from './data'

const TZ = 'Asia/Bangkok'

function d(v: unknown): Date | null {
  const t = ms(v)
  return t ? new Date(t) : null
}

/**
 * "16 – 18 September 2026 · 09:00–16:00" from the live event document, so the visitor-facing
 * copy follows the event rather than a hardcoded string (spec 7.1).
 */
export function eventDateLine(ev: LiveEvent, withTimes = true): string {
  const a = d(ev.startsAt), b = d(ev.endsAt)
  if (!a || !b) return ev.days.join(' · ')
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const day = (x: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: TZ }).format(x)
  const full = (x: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(x)
  const time = (x: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(x)
  const dates = a.toDateString() === b.toDateString() ? full(a)
    : sameMonth ? `${day(a)}–${full(b)}`
    : `${full(a)} – ${full(b)}`
  return withTimes ? `${dates} · ${time(a)}–${time(b)}` : dates
}

/** The passport cover mark, e.g. "MFU INTERFEST · 2026". */
export function eventMark(ev: LiveEvent): string {
  if (ev.stampMarkTop) return ev.stampMarkBottom ? `${ev.stampMarkTop} · ${ev.stampMarkBottom}` : ev.stampMarkTop
  const a = d(ev.startsAt)
  const year = a ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(a) : ''
  const name = ev.nameEn.toUpperCase()
  // Most event names already carry the year. Appending it again read as "… 2026 · 2026".
  return year && !name.includes(year) ? `${name} · ${year}` : name
}

/**
 * The text printed on the booth visa (spec 2.5): the issuing line, the place and year, the
 * "from – until" range, and the six-digit dates its machine-readable zone carries.
 *
 * All of it comes from the live event. The visa used to state 16–18 SEP 2026 in the markup, so
 * changing the event's dates in the console left every stamp claiming the old ones.
 */
export function stampMarks(ev: LiveEvent): { markTop: string; markBottom: string; validFor: string; mrzDates: string } {
  const a = d(ev.startsAt), b = d(ev.endsAt)
  const year = a ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(a) : ''
  const day = (x: Date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: TZ }).format(x)
  const mon = (x: Date) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: TZ }).format(x).toUpperCase()
  // YYMMDD, the format a machine-readable zone uses.
  const six = (x: Date) => new Intl.DateTimeFormat('en-GB', { year: '2-digit', month: '2-digit', day: '2-digit', timeZone: TZ })
    .formatToParts(x).filter((p) => p.type !== 'literal').reduce((o, p) => ({ ...o, [p.type]: p.value }), {} as Record<string, string>)
  const s6 = (x: Date) => { const p = six(x); return `${p.year}${p.month}${p.day}` }
  const validFor = a && b
    ? (mon(a) === mon(b) && year ? `${day(a)}–${day(b)} ${mon(b)} ${year}` : `${day(a)} ${mon(a)} – ${day(b)} ${mon(b)} ${year}`)
    : ''
  return {
    markTop: ev.stampMarkTop || ev.nameEn.toUpperCase().slice(0, 22),
    markBottom: ev.stampMarkBottom || year,
    validFor,
    mrzDates: a && b ? `${s6(a)}0M${s6(b)}` : '',
  }
}

/** A Firestore timestamp (or ms) as "16/09/2026, 14:03:12" in Bangkok time; "–" when absent. */
export function ts(v: unknown): string {
  const t = ms(v)
  return t ? new Date(t).toLocaleString('en-GB', { timeZone: TZ }) : '–'
}

/** Clock only, "14:03", for the booth and desk screens. */
export function clock(v: unknown): string {
  const t = ms(v)
  return t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '–'
}
