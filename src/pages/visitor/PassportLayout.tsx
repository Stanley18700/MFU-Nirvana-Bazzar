import { Link, Outlet, useLocation } from 'react-router-dom'
import { Icon, TabBar } from '../../components/ui'

export default function PassportLayout() {
  const loc = useLocation()
  return (
    <div className="mx-auto min-h-full max-w-md pb-24">
      <div key={loc.pathname} className="page-in">
        <Outlet />
      </div>
      <Link to="/scan" className="fixed bottom-20 right-1/2 z-30 flex h-16 w-16 translate-x-1/2 items-center justify-center rounded-full bg-stamp-blue text-white shadow-xl shadow-seal/30 active:scale-95 sm:right-[calc(50%-12rem)] sm:translate-x-0" aria-label="Scan a booth">
        {Icon.scan}
      </Link>
      <TabBar tabs={[
        { to: '/passport', label: 'Cover', icon: Icon.cover, end: true },
        { to: '/passport/stamps', label: 'Stamps', icon: Icon.stamps },
        { to: '/passport/prize', label: 'Prize', icon: Icon.prize },
      ]} />
    </div>
  )
}
