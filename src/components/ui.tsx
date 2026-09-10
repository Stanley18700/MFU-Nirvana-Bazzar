import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { downloadCsv, type CsvRow } from '../lib/csv'
import { useDataErrors } from '../lib/data'
import { LOCALES, useLocale } from '../lib/locale'
import { useSlidingPill } from '../lib/useSlidingPill'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'

export function Fig({ value, label, accent, sub }: { value: ReactNode; label: string; accent?: string; sub?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="fig text-4xl sm:text-5xl" style={{ color: accent }}>{value}</div>
      <div className="stamp-text text-ink-soft">{label}</div>
      {sub && <div className="text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

/**
 * `page` for a wait that owns the screen — the auth guards, and anything reached before a shell
 * has rendered. Those were a 16px grey ring on a bare white page, which is the one screen in the
 * app that looked like no part of it. Inline everywhere else: a takeover inside a card, or over
 * the passport's own tab bar, would be worse than the ring.
 */
export function Spinner({ label = 'Loading…', page = false }: { label?: string; page?: boolean }) {
  if (page) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-page" role="status" aria-live="polite">
        <img src="/brand/bg-sky-waves.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative flex flex-col items-center gap-5 px-6">
          <img src="/brand/logo-festival.webp" alt="" aria-hidden className="mark-breathe w-[min(62vw,300px)]" />
          <span className="text-sm font-medium text-ink-soft">{label}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-ink-soft" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-action" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export type Tone = 'info' | 'amber' | 'red' | 'green'
/** One result message, as every admin page keeps it in state. */
export type Msg = { tone: 'green' | 'amber' | 'red'; text: string }

/** Toast still needs the colours inline; Notice below is class-driven so `.on-chrome` can restate it. */
const TONE: Record<Tone, string> = {
  info: 'bg-sky-200 text-ink',
  amber: 'bg-warn-bg text-warn-text',
  red: 'bg-danger-bg text-danger-text',
  green: 'bg-success-bg text-success-text',
}

/**
 * A stable class per tone rather than inline utilities, so `.on-chrome` in index.css can restate the
 * four tones for a dark page without every caller having to switch to `DarkNotice`.
 */
export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>
}

/**
 * The result of an action, pinned to the bottom of the viewport. The admin pages used to render
 * it at the top of the page, which on a long booth grid was off-screen and on the Users page was
 * hidden behind the drawer. Green and amber fade after `ms`; red stays until closed.
 */
export function Toast({ msg, onClose, ms = 5000 }: { msg: Msg | null; onClose: () => void; ms?: number }) {
  // Callers pass `() => setMsg(null)` inline; keep the latest without restarting the timer on every render.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!msg || msg.tone === 'red') return
    const id = setTimeout(() => close.current(), ms)
    return () => clearTimeout(id)
  }, [msg, ms])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div role={msg.tone === 'red' ? 'alert' : 'status'} aria-live="polite"
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[20px] px-4 py-3 text-sm shadow-raised ${TONE[msg.tone]} toast-in`}>
        <span className="min-w-0 flex-1">{msg.text}</span>
        <button type="button" onClick={onClose} className="btn-quiet btn-sm btn-icon shrink-0" aria-label="Dismiss">×</button>
      </div>
    </div>
  )
}

/**
 * A right-hand panel that behaves like a dialog: Escape closes it, focus goes in on open and
 * comes back to whatever opened it, the page behind stops scrolling.
 */
export function Drawer({ title, onClose, children, width = 'max-w-md', actions }: {
  title: ReactNode; onClose: () => void; children: ReactNode; width?: string; actions?: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useBodyScrollLock(true)
  const close = useRef(onClose)
  close.current = onClose
  // Runs once per open: re-running on every render would re-grab focus from whatever the user is typing in.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current() } }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])
  return (
    <div className="scrim-in fixed inset-0 z-40 flex justify-end bg-ink/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`h-full w-full ${width} overflow-y-auto bg-white p-5 shadow-2xl drawer-in`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <button ref={closeRef} type="button" className="btn-quiet btn-sm" onClick={onClose}>Close ✕</button>
          {actions}
        </div>
        <h2 id={titleId} className="mt-2 text-xl font-bold">{title}</h2>
        {children}
      </aside>
    </div>
  )
}

/** Notice is tuned for light grounds; this one for the green chrome — auth screens, the booth display. */
export function DarkNotice({ tone = 'info', children }: { tone?: 'info' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  const cls = {
    info: 'bg-white/12 text-white',
    amber: 'bg-[rgba(250,189,109,.24)] text-orange-300',
    red: 'bg-[rgba(217,74,72,.26)] text-[#FFC9BF]',
    green: 'bg-[rgba(76,118,79,.34)] text-[#BDE8C4]',
  }[tone]
  return <div className={`rounded-[20px] px-4 py-3 text-sm ${cls}`} role="status">{children}</div>
}

/**
 * Download a panel as CSV. Disabled, with the reason in the tooltip, when there is nothing to
 * export — clicking used to do nothing at all, which read as a broken button. `confirm` asks
 * before exporting anything that carries personal or sensitive data (spec §4.1, §10).
 */
/**
 * Going back is a control, not a citation.
 *
 * It was an underlined link on the auth screens and bare text on the prize-desk landing, while
 * four other screens already used a quiet pill for exactly the same move. An underline is the
 * convention for "this takes you to a document"; going back is something you press. One component
 * so the six of them cannot drift apart again.
 */
export function BackLink({ to, children, label, dark = false, className = '' }: {
  to: string
  /** Where you land, when naming it is worth the width. Omit for a plain step back. */
  children?: ReactNode
  /** The accessible name, and the hover label when there is no visible one. */
  label?: string
  dark?: boolean
  className?: string
}) {
  const name = label ?? (typeof children === 'string' ? children : 'Back')
  // A named destination is worth its width — "Passport" says where you land, which an arrow cannot.
  if (children) {
    return (
      <Link to={to} className={`${dark ? 'btn-dark' : 'btn-quiet'} btn-sm ${className}`}>
        {Icon.back}{children}
      </Link>
    )
  }
  // "Back" beside a back arrow is the arrow again in words. The glyph carries it, and `.tip` gives
  // the name to a pointer and a keyboard, the way every other icon-only control here does.
  return (
    <Link
      to={to} aria-label={name}
      className={`tip ${dark ? 'btn-dark tip-dark' : 'btn-quiet tip-light'} btn-sm btn-icon-sm ${className}`}
    >
      {Icon.back}
      <span className="tip-label">{name}</span>
    </Link>
  )
}

export function CsvButton({ rows, name, label = 'CSV', confirm, columns, className = '' }: {
  rows: CsvRow[]; name: string; label?: string; confirm?: string; columns?: string[]; className?: string
}) {
  const empty = rows.length === 0
  const title = empty ? 'Nothing to export yet' : `Download ${rows.length} row${rows.length === 1 ? '' : 's'} as CSV`
  return (
    <span title={title} className="inline-flex">
      <button type="button" disabled={empty} aria-label={`${label}: ${title}`}
        className={`btn-quiet btn-sm ${className}`}
        onClick={() => { if (confirm && !window.confirm(confirm)) return; downloadCsv(rows, name, columns) }}>
        {label}
      </button>
    </span>
  )
}

/**
 * Copy to the clipboard with feedback. The clipboard API needs a secure context and a user
 * gesture; when it refuses, the text in `inputRef` is selected (and the legacy copy command
 * tried) so the user can still copy by hand.
 */
export function CopyButton({ text, inputRef, className = 'btn-quiet btn-sm' }: { text: string; inputRef?: RefObject<HTMLInputElement | null>; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(id)
  }, [state])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      const el = inputRef?.current
      el?.focus(); el?.select()
      let ok = false
      try { ok = document.execCommand('copy') } catch { /* not available */ }
      setState(ok ? 'copied' : 'failed')
    }
  }
  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}
    </button>
  )
}

const DATA_ERROR_TEXT: Record<string, (what: string) => string> = {
  'permission-denied': (w) => `You are not allowed to read ${w}. Sign out and back in; if it persists, the security rules need a fix.`,
  'failed-precondition': (w) => `Loading ${w} needs a database index that is not deployed yet (see firestore.indexes.json).`,
  unavailable: (w) => `Offline — showing the last saved copy of ${w}.`,
}

/** One listener's failure, as a sentence a tester can act on. Renders nothing when there is no error. */
export function DataError({ error, what = 'this data', dark }: { error: string | null | undefined; what?: string; dark?: boolean }) {
  if (!error) return null
  const text = (DATA_ERROR_TEXT[error] ?? ((w: string) => `Could not load ${w} (${error}).`))(what)
  const tone = error === 'unavailable' ? 'amber' : 'red'
  return dark ? <DarkNotice tone={tone}>{text}</DarkNotice> : <Notice tone={tone}>{text}</Notice>
}

/** Every live listener on the page that is currently failing (see useDataErrors in lib/data). */
export function DataErrors({ dark, className = '' }: { dark?: boolean; className?: string }) {
  const errs = useDataErrors()
  const seen = new Set<string>()
  const list = errs.filter((e) => { const k = `${e.code}|${e.what}`; if (seen.has(k)) return false; seen.add(k); return true })
  if (!list.length) return null
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {list.map((e) => <DataError key={`${e.code}|${e.what}`} error={e.code} what={e.what} dark={dark} />)}
    </div>
  )
}

/**
 * The passport's bottom bar, and the scan circle raised above it.
 *
 * The circle belongs to the bar rather than to the page: as its own `fixed` layer it floated over
 * whatever content happened to sit at that height. Here it is inside the bar's box, so the band it
 * occupies is part of the bar's height and a page that clears the bar clears the circle too.
 */
export function TabBar({ tabs, scanTo }: { tabs: Array<{ to: string; label: string; icon: ReactNode; end?: boolean }>; scanTo?: string }) {
  const rail = useSlidingPill<HTMLDivElement>()
  const half = scanTo ? Math.ceil(tabs.length / 2) : tabs.length
  const [left, right] = [tabs.slice(0, half), tabs.slice(half)]
  const span = (n: number) => `repeat(${n},minmax(0,1fr))`
  const cols = scanTo ? `${span(half)} 5.5rem ${span(tabs.length - half)}` : span(tabs.length)
  const renderTab = (t: { to: string; label: string; icon: ReactNode; end?: boolean }) => (
    <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex min-w-0 flex-col items-center gap-0.5 px-1 py-2.5 text-center text-[11px] font-semibold transition ${isActive ? 'text-ink' : 'text-ink-soft'}`}>
      {({ isActive }: { isActive: boolean }) => <><span className={isActive ? 'text-sky-800' : 'text-ink-soft'}>{t.icon}</span>{t.label}</>}
    </NavLink>
  )
  return (
    <div className={`fixed inset-x-0 bottom-0 z-20 ${scanTo ? 'pt-8' : ''}`}>
    {scanTo && (
      <Link
        to={scanTo} aria-label="Scan a booth"
        className="absolute left-1/2 top-0 z-10 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-action text-white shadow-float transition hover:bg-action-hover active:scale-95"
      >
        {Icon.scan}
      </Link>
    )}
    {/* A floor under the labels. With no safe-area inset — Chrome's device mode, most Android
        gesture bars — the descenders sat on the very last pixel of the screen. */}
    <nav className="border-t rule bg-white/94 backdrop-blur-[14px]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }} aria-label="Passport pages">
      {/*
        * Columns come from the tab count, not a class: Tailwind scans source text for complete
        * class names, so `grid-cols-${n}` would never be compiled.
        *
        * With a scan button there is a real gutter in the middle, not just a button laid over the
        * bar. At 412px the 64px button plus its 4px ring covered the inner third of both Stamps and
        * Prize, so a thumb aimed at either of them landed on the camera. The column is wide enough
        * for the ring plus 8px of clearance on each side.
        */}
      <div ref={rail} className="tab-rail mx-auto grid max-w-md" style={{ gridTemplateColumns: cols }}>
        {left.map(renderTab)}
        {scanTo && <span aria-hidden />}
        {right.map(renderTab)}
      </div>
    </nav>
    </div>
  )
}

export const Icon = {
  /* Drawn rather than the "←" character: a glyph is whatever the font decides, sits on the text
     baseline instead of the optical centre, and thickens with the surrounding font weight. */
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M11 18l-6-6 6-6" /></svg>,
  cover: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17h8" /></svg>,
  stamps: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  prize: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9L6.6 19.6l1.1-6L3.3 9.4l6-.9z" /></svg>,
  scan: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M4 12h16" /></svg>,
  /*
   * The fifth tab-bar glyph: the visitor's own Profile. An open shoulder arc rather than a filled
   * torso, so it sits with `prize`'s open star and `stamps`' unfilled squares rather than against
   * them.
   */
  person: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></svg>,

  /*
   * The admin console's rail. The design system says four glyphs are the whole inventory and a
   * word does the rest — true for the visitor app, and it stays true there. A ten-item sidebar
   * that collapses cannot show ten words in 72px, so these eleven exist for that one surface, in
   * the same language: line only, no fills, 1.8 stroke, currentColor, 24px box. Recorded in
   * .design-sync/NOTES.md so the design project is updated rather than quietly diverged from.
   */
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  dashboard: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 19V11M9.3 19V5M14.7 19v-6M20 19V8" /></svg>,
  screen: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></svg>,
  desk: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 9h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M12 4v5M9 20h6" /></svg>,
  draw: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3v4M12 21v-4M3 12h4M21 12h-4" /><circle cx="12" cy="12" r="4" /></svg>,
  event: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  booths: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 9h16v10H4z" /><path d="M3 5h18l-1 4H4z" /></svg>,
  prizes: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3.5" y="8" width="17" height="12" rx="1.5" /><path d="M12 8v12M3.5 12h17" /><path d="M12 8S9.5 3.5 7.5 5 9.5 8 12 8zM12 8s2.5-4.5 4.5-3S14.5 8 12 8z" /></svg>,
  users: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16.5 6.4a3.2 3.2 0 0 1 0 6M18 19a6 6 0 0 0-1.6-4.1" /></svg>,
  audit: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></svg>,
  lists: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>,

  /*
   * The four above are the visitor tab bar, so they are 22–26px. These two sit inside `btn-sm`
   * beside a text label, where 15px matches the cap height of `text-xs`. Arrows-out rather than
   * corner brackets for full screen, because brackets would read as `scan` at this size.
   */
  fullscreen: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
  /* Add to Home Screen: a handset with an arrow landing in it. Same 24px box and 1.8 stroke as
     the rail glyphs, sized 15 to sit level with `fullscreen` in the kiosk header. */
  install: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5" /></svg>,
  print: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 8V3h10v5" /><path d="M7 18H5a2 2 0 01-2-2v-3a2 2 0 012-2h14a2 2 0 012 2v3a2 2 0 01-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></svg>,
}

/**
 * The language switch — English / Thai.
 *
 * Same `.seg` recipe as the organizer's page tabs, so one control shape serves both and the switch
 * looks identical wherever it sits. `aria-pressed` rather than `aria-current`, because these pick a
 * setting instead of navigating; the CSS answers to both. Each label carries its own `lang` so
 * "ไทย" shapes correctly while the page is still in English.
 */
export function LangToggle({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  const { locale, setLocale } = useLocale()
  const strip = useSlidingPill()
  return (
    <div ref={strip} className={`seg ${dark ? 'seg-dark' : 'seg-light'} shrink-0 ${className}`} role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button key={l} type="button" lang={l} onClick={() => setLocale(l)} aria-pressed={locale === l} className="seg-item">
          {l === 'th' ? 'ไทย' : 'EN'}
        </button>
      ))}
    </div>
  )
}

/**
 * An icon-only button whose label appears on hover and on keyboard focus.
 *
 * For controls whose meaning the icon carries on its own and whose label would otherwise eat room
 * a booth screen needs for the QR. The label is the `aria-label` as well as the tooltip, so it is
 * never only visual. Do NOT use this where the label is the information — a primary action, or
 * anything a first-time user has to read.
 */
export function IconButton({ icon, label, onClick, dark = false, className = '' }: {
  icon: ReactNode
  label: string
  onClick: () => void
  dark?: boolean
  className?: string
}) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      className={`tip ${dark ? 'btn-dark tip-dark' : 'btn-quiet tip-light'} btn-sm btn-icon-sm ${className}`}
    >
      {icon}
      <span className="tip-label">{label}</span>
    </button>
  )
}

/**
 * The live-data indicator: a coloured dot plus a phrase. Three screens grew their own copy with
 * the same three hex literals and different dot sizes, so the booth kiosk and its own stats page
 * disagreed about how "Live" looks. One component, one set of colours.
 *
 * `size="sm"` is for a caption inside a card; the default matches a page header's `text-sm`.
 */
export function LiveDot({ state, children, dark = false, size = 'md', className = '' }: {
  state: 'live' | 'stale' | 'offline'
  children: ReactNode
  dark?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const color = state === 'offline' ? '#D94A48' : state === 'stale' ? '#DC8A2A' : '#4C764F'
  const d = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3'
  return (
    <span className={`flex shrink-0 items-center gap-2 ${size === 'sm' ? 'text-xs' : 'text-sm'} ${dark ? 'text-on-chrome-soft' : 'text-ink-soft'} ${className}`}>
      <span className={`inline-block shrink-0 rounded-full ${d}`} style={{ background: color }} aria-hidden />
      <span>{children}</span>
    </span>
  )
}

export function Crest({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M50 20 L58 40 L79 42 L63 56 L68 77 L50 66 L32 77 L37 56 L21 42 L42 40 Z" fill="currentColor" opacity=".9" />
    </svg>
  )
}

export function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('en-US')
}

export function Flag({ code }: { code: string }) {
  if (!/^[A-Z]{2}$/.test(code)) return <span>🌐</span>
  const pts = [...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return <span aria-label={code}>{String.fromCodePoint(...pts)}</span>
}
