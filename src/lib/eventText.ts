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

/** The passport cover mark, e.g. "MFU GO GLOBAL · 2026". */
export function eventMark(ev: LiveEvent): string {
  if (ev.stampMarkTop) return ev.stampMarkBottom ? `${ev.stampMarkTop} · ${ev.stampMarkBottom}` : ev.stampMarkTop
  const a = d(ev.startsAt)
  const year = a ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(a) : ''
  return year ? `${ev.nameEn.toUpperCase()} · ${year}` : ev.nameEn.toUpperCase()
}

/** Arc text for the generated fallback stamp (spec 2.5). */
export function stampMarks(ev: LiveEvent): { markTop: string; markBottom: string } {
  const a = d(ev.startsAt)
  const year = a ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: TZ }).format(a) : ''
  return {
    markTop: ev.stampMarkTop || ev.nameEn.toUpperCase().slice(0, 22),
    markBottom: ev.stampMarkBottom || year,
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
