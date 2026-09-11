import { Outlet, useLocation } from 'react-router-dom'
import { DataErrors, Icon, LiveDot, TabBar } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'
import { useOnline } from '../../lib/useOnline'

export default function PassportLayout() {
  const loc = useLocation()
  const online = useOnline()
  return (
    <><FestivalBackdrop hills={false} /><div className="mx-auto min-h-full max-w-md" style={{
        /*
         * The bar is its own height plus the 2rem band the scan circle is raised into, and the
         * circle overhangs that band by half its diameter. This clears all of it.
         */
        paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom))',
      }}>
      {/*
        * A failing listener says so through DataErrors. Losing the network says nothing at
        * all — Firestore serves the cache — so the passport would quietly show yesterday's
        * stamps as though they were current. Said plainly here, and only when something is
        * actually wrong: a green "connected" badge on a visitor's passport is noise.
        */}
      {!online && (
        <div className="mx-4 mt-3 rounded-2xl bg-white/90 px-4 py-3 shadow-card">
          <LiveDot state="offline" size="sm">Offline — your stamps are saved</LiveDot>
          <p className="mt-1 text-xs text-ink-soft">This page will catch up on its own. You will need a connection to collect a new stamp.</p>
        </div>
      )}
      <DataErrors className="mx-4 mt-3" />
      <div key={loc.pathname} className="page-in">
        <Outlet />
      </div>
      <TabBar scanTo="/scan" tabs={[
        { to: '/passport', label: 'Cover', icon: Icon.cover, end: true },
        { to: '/passport/stamps', label: 'Stamps', icon: Icon.stamps },
        { to: '/passport/prize', label: 'Prize', icon: Icon.prize },
        { to: '/passport/account', label: 'Profile', icon: Icon.person },
      ]} />
    </div></>
  )
}
