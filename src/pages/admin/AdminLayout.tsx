import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEvent } from '../../lib/data'
import { AccountMenu } from '../../components/AccountMenu'
import { DataErrors, Icon } from '../../components/ui'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { UniversityMark } from '../auth/parts'

type Item = { to: string; label: string; icon: ReactNode; end?: boolean; away?: boolean }

/**
 * Four groups in the order an admin needs them: what you look at during the event, what you set up
 * before it, what you consult afterwards — and, last, the two screens that legitimately leave the
 * console. Ten equal items gave no hint where to start.
 *
 * "Screens" exists because the hall display and the prize desk are shared surfaces with their own
 * chrome, not admin pages: the prize desk is a tablet an organizer may be holding, and forking it
 * by role is the one thing that must not happen to it. The `↗` says the chrome is about to change
 * rather than letting it surprise you.
 */
const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: 'Run', items: [
    { to: '/admin', label: 'Dashboard', icon: Icon.dashboard, end: true },
    { to: '/admin/draw', label: 'Stage draw', icon: Icon.draw },
  ] },
  { title: 'Set up', items: [
    { to: '/admin/event', label: 'Event', icon: Icon.event },
    { to: '/admin/booths', label: 'Booths', icon: Icon.booths },
    { to: '/admin/prizes', label: 'Prizes & stock', icon: Icon.prizes },
    { to: '/admin/users', label: 'Users & invites', icon: Icon.users },
  ] },
  { title: 'Records', items: [
    { to: '/admin/audit', label: 'Audit log', icon: Icon.audit },
    { to: '/admin/refdata', label: 'Reference lists', icon: Icon.lists },
  ] },
  { title: 'Screens', items: [
    { to: '/admin/wall', label: 'Hall screen', icon: Icon.screen, away: true },
    { to: '/redeem', label: 'Prize desk', icon: Icon.desk, away: true },
  ] },
]

const ALL = GROUPS.flatMap((g) => g.items)
const RAIL_KEY = 'admin-rail-collapsed'

function readCollapsed(): boolean {
  try { return localStorage.getItem(RAIL_KEY) === '1' } catch { return false }
}

/**
 * The sidebar's contents, rendered by two hosts: the sticky desktop rail and the drawer below it.
 * One copy is the point — the old file rendered the account links twice and Sign out twice, and
 * they had already drifted apart.
 */
function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const event = useEvent()
  const nav = useSlidingPill<HTMLElement>()
  return (
    <>
      {/*
        * The design system's paper-cut campus, the same asset the booth screen, the passport cover
        * and the signed-out horizon stand on, so the console belongs to the same set. It replaces
        * the three SVG ridges that stood in for it while the asset could not be pulled.
        *
        * A fixed 22rem, centred and clipped, rather than the rail's own width. The campus is
        * 2421px of drawn detail; poured into a 15rem rail it renders at a tenth scale and the
        * rooftops turn to grain, and the rail then narrows to 4.5rem on collapse and halves it
        * again. Held at one size it stays the same campus at the same scale, and collapsing just
        * shows less of it.
        */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <img
          src="/brand/illus-campus-papercut.webp" alt="" aria-hidden
          className="absolute bottom-0 left-1/2 w-[22rem] max-w-none -translate-x-1/2 opacity-[0.15]"
          // Faded into the chrome, not laid on it: its skyline is otherwise a hard horizontal edge
          // straight across the rail, and a straight edge above the account row reads as a panel.
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 42%)',
            maskImage: 'linear-gradient(to bottom, transparent, #000 42%)',
          }}
        />
      </div>
      <div className={`relative flex items-center gap-3 py-4 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        {/* The design system's rail leads with the festival logo. That artwork is one of the five
            assets the design tool could not deliver, so the university seal — the one real mark we
            do have — stands in beside the wordmark. */}
        {!collapsed && <UniversityMark className="h-8 w-8" />}
        {/* One word, because two lines did not fit: at 15rem, minus the mark and the collapse
            button, the rail served "MFU INTERNATI…" over "Passport ad…". The event's full name is
            on the title attribute and on the Event page; the rail only has to say where you are. */}
        {!collapsed && <div className="min-w-0 flex-1 truncate font-semibold" title={event.nameEn}>Admin</div>}
        {onToggle && (
          <button
            type="button" onClick={onToggle} className="btn-dark btn-sm btn-icon-sm"
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-pressed={collapsed}
          >
            <span aria-hidden className={`inline-block transition-transform ${collapsed ? 'rotate-180' : ''}`}>‹</span>
          </button>
        )}
      </div>

      {/*
        * `min-h-0 flex-1 overflow-y-auto` is the third containment tier: the links scroll on a
        * short window while the account block below stays pinned to the foot of the rail.
        */}
      <nav ref={nav} className="tab-rail-v min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-3">
            {!collapsed && <div className="stamp-text px-3 pb-1 pt-2 text-[10px] text-on-chrome-soft">{g.title}</div>}
            {collapsed && <div className="mx-auto my-2 h-px w-6 bg-white/15" />}
            {g.items.map((n) => (
              <NavLink
                key={n.to} to={n.to} end={n.end} title={collapsed ? n.label : undefined}
                className={({ isActive }) => `relative z-[1] flex items-center gap-3 whitespace-nowrap rounded-full py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foil/60 ${collapsed ? 'justify-center px-0' : 'px-3.5'} ${isActive ? 'font-semibold text-white' : 'text-on-chrome-soft hover:bg-white/10 hover:text-white'}`}
              >
                <span aria-hidden className="shrink-0">{n.icon}</span>
                {!collapsed && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
                {!collapsed && n.away && <span aria-hidden className="shrink-0 text-xs text-on-chrome-soft">↗</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={`mt-auto border-t border-white/10 py-3 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        <AccountMenu dark up rail={collapsed ? 'icon' : 'full'} />
      </div>
    </>
  )
}

export default function AdminLayout() {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const dlg = useRef<HTMLDialogElement>(null)

  // Navigating is the same gesture as dismissing: the drawer must not survive the page under it.
  useEffect(() => { setOpen(false) }, [loc.pathname])

  /*
   * StrictMode double-invokes this in development, and `showModal()` on an already-open dialog
   * throws `InvalidStateError`. The guards are load-bearing, not padding.
   */
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  function toggleRail() {
    setCollapsed((c) => {
      try { localStorage.setItem(RAIL_KEY, c ? '0' : '1') } catch { /* private window */ }
      return !c
    })
  }

  const title = ALL.find((i) => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to)))?.label ?? 'Passport admin'

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/*
        * The festival's own sky wave field, full bleed, as the console's ground — the same asset the
        * signed-out screens stand on, so the console is the same festival at a different density.
        * It replaces the flat `page-quiet` the design system's admin kit specified; that kit chose
        * flat "so white panels read cleanly", which they still do, because every panel here is
        * opaque white and the field only ever shows in the gutters between them.
        *
        * Fixed, not scrolled: the waves are broad and slow, and dragging them past a long table
        * would turn a still ground into motion nobody asked for.
        *
        * A sibling of the rail and the content, not a child of either: `main` hosts `.page-in`,
        * whose transform would make itself the containing block for anything fixed inside it.
        */}
      <img
        src="/brand/bg-sky-waves.webp" alt="" aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover print:hidden"
      />

      {/* Phone and tablet: the rail is a drawer, so the bar is what is always on screen. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 bg-chrome px-3 text-white lg:hidden">
        <button
          type="button" className="btn-dark btn-icon" aria-label="Menu"
          aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen(true)}
        >
          {Icon.menu}
        </button>
        <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
        <AccountMenu dark />
      </header>

      {/*
        * Sticky, not a viewport-locked shell. Only this one element needs pinning, on one
        * breakpoint, and locking the shell would kill `window.scrollTo` on the event page, break
        * the body-scroll-lock the user drawer relies on, and change the containing block the booth
        * kiosk measures its QR against. `self-start` is mandatory: a stretched flex item is already
        * the container's height, so it has no slack to stick with and silently will not move.
        */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 flex-col self-start bg-chrome text-white isolate transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-60'}`}>
        <SideNav collapsed={collapsed} onToggle={toggleRail} />
      </aside>

      {/*
        * A real `<dialog>`: the focus trap, Escape, and `inert` on the page behind are the
        * browser's job, and it does them properly. `ui.tsx`'s Drawer traps nothing.
        * No display utility on the element itself — the UA sheet toggles `display` off `[open]`,
        * so a `flex` class would leave this permanently on screen.
        */}
      <dialog
        ref={dlg} id="admin-nav" className="nav-drawer" onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dlg.current) setOpen(false) }}
      >
        <div className="relative isolate flex h-full flex-col overflow-hidden bg-chrome text-white">
          <SideNav collapsed={false} />
        </div>
      </dialog>

      <main className="min-w-0 flex-1 px-4 pb-6 pt-[4.5rem] lg:px-8 lg:py-6">
        <DataErrors className="mb-4" />
        <Outlet />
      </main>
    </div>
  )
}
