import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'
import { errorMessage } from '../../lib/api'
import { DataErrors, Notice } from '../../components/ui'

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/event', label: 'Event' },
  { to: '/admin/booths', label: 'Booths' },
  { to: '/admin/users', label: 'Users & invites' },
  { to: '/admin/prizes', label: 'Prizes & stock' },
  { to: '/admin/draw', label: 'Stage draw' },
  { to: '/admin/refdata', label: 'Reference lists' },
  { to: '/admin/audit', label: 'Audit log' },
]

/** Other screens an admin reaches from here. On a phone these join the scrolling nav; on a desktop they sit in the sidebar foot. */
const LINKS = [
  { to: '/admin/wall', label: 'Hall screen mode' },
  { to: '/redeem', label: 'Prize desk' },
  { to: '/passport', label: 'My passport (test as visitor)' },
  { to: '/account', label: 'My account' },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const event = useEvent()
  const nav = useNavigate()
  const [err, setErr] = useState<string | null>(null)

  async function leave() {
    try { await signOut(); nav('/', { replace: true }) } catch (e) { setErr(errorMessage(e)) }
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-navy text-paper md:w-60 md:min-h-screen">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="stamp-text truncate text-gold">{event.nameEn}</div>
            <div className="font-semibold">Passport admin</div>
          </div>
          <button className="shrink-0 text-xs text-paper/70 underline md:hidden" onClick={leave}>Sign out</button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-paper/15 font-semibold' : 'text-paper/75 hover:bg-paper/10'}`}>{n.label}</NavLink>
          ))}
          {LINKS.map((n) => (
            <NavLink key={n.to} to={n.to} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-paper/55 hover:bg-paper/10 md:hidden">{n.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 px-5 py-4 text-xs text-paper/60 md:flex">
          {LINKS.map((n) => <NavLink key={n.to} to={n.to} className="underline">{n.label}</NavLink>)}
          <div className="mt-2">{profile?.displayName} · admin</div>
          <button className="text-left underline" onClick={leave}>Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        {err && <div className="mb-4"><Notice tone="red">{err}</Notice></div>}
        <DataErrors className="mb-4" />
        <Outlet />
      </main>
    </div>
  )
}
