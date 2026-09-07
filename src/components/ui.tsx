import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

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

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'amber' | 'red' | 'green'; children: ReactNode }) {
  const cls = {
    info: 'bg-stamp-blue/10 text-seal',
    amber: 'bg-amber/15 text-[#8a4a12]',
    red: 'bg-vermilion/12 text-[#8f2a1c]',
    green: 'bg-jade/12 text-[#125a47]',
  }[tone]
  return <div className={`rounded-xl px-4 py-3 text-sm ${cls}`} role="status">{children}</div>
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
