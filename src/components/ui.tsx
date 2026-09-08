import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { NavLink } from 'react-router-dom'
import { downloadCsv, type CsvRow } from '../lib/csv'
import { useDataErrors } from '../lib/data'

export function Fig({ value, label, accent, sub }: { value: ReactNode; label: string; accent?: string; sub?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="fig text-4xl sm:text-5xl" style={{ color: accent }}>{value}</div>
      <div className="stamp-text text-navy-soft">{label}</div>
      {sub && <div className="text-xs text-navy-soft">{sub}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-navy-soft" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy/20 border-t-stamp-blue" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export type Tone = 'info' | 'amber' | 'red' | 'green'
/** One result message, as every admin page keeps it in state. */
export type Msg = { tone: 'green' | 'amber' | 'red'; text: string }

const TONE: Record<Tone, string> = {
  info: 'bg-stamp-blue/10 text-seal',
  amber: 'bg-amber/15 text-[#8a4a12]',
  red: 'bg-vermilion/12 text-[#8f2a1c]',
  green: 'bg-jade/12 text-[#125a47]',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-sm ${TONE[tone]}`} role="status">{children}</div>
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
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ring-black/10 ${TONE[msg.tone]} page-in`}>
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
  const close = useRef(onClose)
  close.current = onClose
  // Runs once per open: re-running on every render would re-grab focus from whatever the user is typing in.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current() } }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      opener?.focus?.()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy-deep/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`h-full w-full ${width} overflow-y-auto bg-paper p-5 shadow-2xl page-in`} onClick={(e) => e.stopPropagation()}>
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

/** Notice is tuned for the paper background; this one for the navy auth screens and the booth display. */
export function DarkNotice({ tone = 'info', children }: { tone?: 'info' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  const cls = {
    info: 'bg-paper/10 text-paper/90',
    amber: 'bg-amber/20 text-amber',
    red: 'bg-vermilion/20 text-[#ffc9bf]',
    green: 'bg-jade/20 text-[#9fe3cd]',
  }[tone]
  return <div className={`rounded-xl px-4 py-3 text-sm ${cls}`} role="status">{children}</div>
}

/**
 * Download a panel as CSV. Disabled, with the reason in the tooltip, when there is nothing to
 * export — clicking used to do nothing at all, which read as a broken button. `confirm` asks
 * before exporting anything that carries personal or sensitive data (spec §4.1, §10).
 */
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

export function TabBar({ tabs }: { tabs: Array<{ to: string; label: string; icon: ReactNode; end?: boolean }> }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t rule bg-paper/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Passport pages">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${isActive ? 'text-stamp-blue' : 'text-navy-soft'}`}>
            {t.icon}
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export const Icon = {
  cover: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17h8" /></svg>,
  stamps: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  prize: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2.7 5.5 6 .9-4.4 4.2 1.1 6-5.4-2.9L6.6 19.6l1.1-6L3.3 9.4l6-.9z" /></svg>,
  scan: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M4 12h16" /></svg>,
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
