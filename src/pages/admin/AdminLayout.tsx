import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'
import { errorMessage } from '../../lib/api'
import { DataErrors, Notice } from '../../components/ui'

/**
 * Three groups in the order an admin needs them: what you look at during the event, what you set
 * up before it, what you consult afterwards. Eight equal items gave no hint where to start.
 */
const GROUPS: Array<{ title: string; items: Array<{ to: string; label: string; end?: boolean }> }> = [
  { title: 'Run', items: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/wall', label: 'Hall screen' },
    { to: '/redeem', label: 'Prize desk' },
    { to: '/admin/draw', label: 'Stage draw' },
  ] },
  { title: 'Set up', items: [
    { to: '/admin/event', label: 'Event' },
    { to: '/admin/booths', label: 'Booths' },
    { to: '/admin/prizes', label: 'Prizes & stock' },
    { to: '/admin/users', label: 'Users & invites' },
  ] },
  { title: 'Records', items: [
    { to: '/admin/audit', label: 'Audit log' },
    { to: '/admin/refdata', label: 'Reference lists' },
  ] },
]

/** The admin's own screens. On a phone these join the scrolling nav; on a desktop they sit in the sidebar foot. */
const LINKS = [
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
      <aside className="flex shrink-0 flex-col bg-chrome text-white md:w-60 md:min-h-screen">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="stamp-text truncate text-foil">{event.nameEn}</div>
            <div className="font-semibold">Passport admin</div>
          </div>
          <button className="btn-dark btn-sm shrink-0 md:hidden" onClick={leave}>Sign out</button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0 md:pb-0">
          {GROUPS.map((g) => (
            // `contents` on a phone flattens the groups into one scrolling row; on a desktop each is a titled block.
            <div key={g.title} className="contents md:mb-3 md:block">
              <div className="stamp-text hidden px-3 pb-1 pt-2 text-[10px] text-on-chrome-soft md:block">{g.title}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foil/60 md:block ${isActive ? 'bg-white/15 font-semibold' : 'text-on-chrome-soft hover:bg-white/10 hover:text-white'}`}>{n.label}</NavLink>
              ))}
            </div>
          ))}
          {LINKS.map((n) => (
            <NavLink key={n.to} to={n.to} className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm text-on-chrome-soft transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foil/60 md:hidden">{n.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 px-5 py-4 text-xs text-on-chrome-soft md:flex">
          {LINKS.map((n) => <NavLink key={n.to} to={n.to} className="link text-on-chrome-soft hover:text-white">{n.label}</NavLink>)}
          <div className="mt-2">{profile?.displayName} · admin</div>
          <button className="btn-dark btn-sm self-start" onClick={leave}>Sign out</button>
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
