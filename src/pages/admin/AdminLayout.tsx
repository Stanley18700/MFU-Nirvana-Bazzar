import { NavLink, Outlet } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/event', label: 'Event' },
  { to: '/admin/booths', label: 'Booths' },
  { to: '/admin/users', label: 'Users & invites' },
  { to: '/admin/prizes', label: 'Prizes & stock' },
  { to: '/admin/draw', label: 'Stage draw' },
  { to: '/admin/audit', label: 'Audit log' },
]

export default function AdminLayout() {
  const { profile } = useAuth()
  const event = useEvent()
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-navy text-paper md:w-60 md:min-h-screen">
        <div className="px-5 py-4">
          <div className="stamp-text truncate text-gold">{event.nameEn}</div>
          <div className="font-semibold">Passport admin</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-paper/15 font-semibold' : 'text-paper/75 hover:bg-paper/10'}`}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 px-5 py-4 text-xs text-paper/60 md:flex">
          <NavLink to="/admin/wall" className="underline">Hall screen mode</NavLink>
          <NavLink to="/redeem" className="underline">Prize desk</NavLink>
          <NavLink to="/passport" className="underline">My passport (test as visitor)</NavLink>
          <div className="mt-2">{profile?.displayName} · admin</div>
          <button className="text-left underline" onClick={() => signOut(auth).then(() => window.location.assign('/'))}>Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
