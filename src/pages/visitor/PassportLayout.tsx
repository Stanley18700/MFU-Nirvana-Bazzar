import { Outlet, useLocation } from 'react-router-dom'
import { DataErrors, Icon, TabBar } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'

export default function PassportLayout() {
  const loc = useLocation()
  return (
    <><FestivalBackdrop hills={false} /><div className="mx-auto min-h-full max-w-md" style={{
        /*
         * The bar is its own height plus the 2rem band the scan circle is raised into, and the
         * circle overhangs that band by half its diameter. This clears all of it.
         */
        paddingBottom: 'calc(8.5rem + env(safe-area-inset-bottom))',
      }}>
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
