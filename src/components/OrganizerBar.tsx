import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useBooth } from '../lib/data'

/**
 * The organizer's only navigation. Booth staff used to reach the prize desk by typing the URL and
 * could not sign out without typing /account, so a shared tablet could not change hands. Admins
 * opening a booth screen get the same bar plus a way back to the admin.
 *
 * `compact` is the kiosk variant: one row of small links inside the booth header, hidden while the
 * screen is in full screen so nothing competes with the QR.
 */
export function OrganizerBar({ boothId, dark = false, compact = false, className = '' }: {
  boothId: string | null | undefined
  dark?: boolean
  compact?: boolean
  className?: string
}) {
  const { role, signOut } = useAuth()
  const nav = useNavigate()
  const { data: booth } = useBooth(boothId)
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  if (compact && fs) return null

  // An admin looking at someone else's booth keeps that booth in the links.
  const q = role === 'admin' && boothId ? `?boothId=${encodeURIComponent(boothId)}` : ''
  const desk = role === 'admin' || !!booth?.isPrizeDesk
  const items: Array<{ to: string; label: string; end?: boolean }> = [
    { to: `/booth${q}`, label: 'Booth screen', end: true },
    { to: `/booth/stats${q}`, label: 'Stats' },
    ...(desk ? [{ to: '/redeem', label: 'Prize desk' }] : []),
    ...(role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
    { to: '/account', label: 'Account' },
  ]

  async function leave() {
    await signOut()
    nav('/', { replace: true })
  }

  const base = compact ? 'rounded px-2 py-1.5 text-sm' : 'rounded-lg px-3 py-2 text-sm font-medium'
  const ring = dark ? 'focus-visible:ring-gold/60' : 'focus-visible:ring-stamp-blue/45'
  const idle = `${dark ? 'text-paper/70 hover:bg-white/10 hover:text-paper' : 'text-navy-soft hover:bg-navy/5 hover:text-navy'} transition focus-visible:outline-none focus-visible:ring-2 ${ring}`
  const active = dark ? 'bg-white/15 text-paper' : 'bg-navy/10 text-navy'

  return (
    <nav aria-label="Booth pages" className={`flex flex-wrap items-center gap-1 ${className}`}>
      {!compact && booth && (
        <span className={`mr-2 truncate text-sm font-semibold ${dark ? 'text-paper' : 'text-navy'}`} style={{ color: booth.accentColor }}>{booth.nameEn}</span>
      )}
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `${base} ${isActive ? active : idle}`}>{n.label}</NavLink>
      ))}
      <button type="button" onClick={leave} className={`${dark ? 'btn-dark' : 'btn-quiet'} btn-sm ${compact ? '' : 'ml-auto'}`}>Sign out</button>
    </nav>
  )
}
