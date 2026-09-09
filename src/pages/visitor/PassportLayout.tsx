import { Link, Outlet, useLocation } from 'react-router-dom'
import { DataErrors, Icon, TabBar } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'

export default function PassportLayout() {
  const loc = useLocation()
  return (
    <><FestivalBackdrop hills={false} /><div className="mx-auto min-h-full max-w-md pb-24" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      <DataErrors className="mx-4 mt-3" />
      <div key={loc.pathname} className="page-in">
        <Outlet />
      </div>
      <Link to="/scan" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }} className="fixed right-1/2 z-30 flex h-16 w-16 translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-action text-white shadow-float transition hover:bg-action-hover active:scale-95 sm:right-[calc(50%-12rem)] sm:translate-x-0" aria-label="Scan a booth">
        {Icon.scan}
      </Link>
      <TabBar tabs={[
        { to: '/passport', label: 'Cover', icon: Icon.cover, end: true },
        { to: '/passport/stamps', label: 'Stamps', icon: Icon.stamps },
        { to: '/passport/prize', label: 'Prize', icon: Icon.prize },
        { to: '/passport/account', label: 'Profile', icon: Icon.person },
      ]} />
    </div></>
  )
}
