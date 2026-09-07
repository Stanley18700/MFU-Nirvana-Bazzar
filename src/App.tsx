import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Spinner } from './components/ui'
import type { Role } from '../shared/model'

import Landing from './pages/visitor/Landing'
import Join from './pages/visitor/Join'
import PassportLayout from './pages/visitor/PassportLayout'
import Cover from './pages/visitor/Cover'
import Stamps from './pages/visitor/Stamps'
import Prize from './pages/visitor/Prize'
import Scan from './pages/visitor/Scan'
import ScanLanding from './pages/visitor/ScanLanding'
import Restore from './pages/visitor/Restore'
import Invite from './pages/visitor/Invite'

import Booth from './pages/organizer/Booth'
import BoothStats from './pages/organizer/BoothStats'
import Redeem from './pages/organizer/Redeem'
import RedeemLanding from './pages/organizer/RedeemLanding'

import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import EventAdmin from './pages/admin/Event'
import Users from './pages/admin/Users'
import Booths from './pages/admin/Booths'
import Prizes from './pages/admin/Prizes'
import Draw from './pages/admin/Draw'
import Audit from './pages/admin/Audit'
import Wall from './pages/admin/Wall'
import Setup from './pages/admin/Setup'

function Guard({ roles, children }: { roles: Role[]; children?: React.ReactNode }) {
  const { ready, role } = useAuth()
  const loc = useLocation()
  if (!ready) return <Spinner label="Opening your passport…" />
  if (!role || !roles.includes(role)) {
    // Visitors who have not registered go to /join and keep where they were headed (§4.3 "not registered").
    if (roles.includes('visitor') && !role) return <Navigate to="/join" state={{ from: loc.pathname + loc.search }} replace />
    return <Navigate to="/" replace />
  }
  return children ? <>{children}</> : <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join" element={<Join />} />
      <Route path="/restore" element={<Restore />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/s/:token" element={<ScanLanding />} />
      <Route path="/r/:token" element={<RedeemLanding />} />
      <Route path="/setup" element={<Setup />} />

      <Route element={<Guard roles={['visitor', 'admin']} />}>
        <Route path="/passport" element={<PassportLayout />}>
          <Route index element={<Cover />} />
          <Route path="stamps" element={<Stamps />} />
          <Route path="prize" element={<Prize />} />
        </Route>
        <Route path="/scan" element={<Scan />} />
      </Route>

      <Route element={<Guard roles={['organizer', 'admin']} />}>
        <Route path="/booth" element={<Booth />} />
        <Route path="/booth/stats" element={<BoothStats />} />
        <Route path="/redeem" element={<Redeem />} />
      </Route>

      <Route element={<Guard roles={['admin']} />}>
        <Route path="/admin/wall" element={<Wall />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="event" element={<EventAdmin />} />
          <Route path="booths" element={<Booths />} />
          <Route path="prizes" element={<Prizes />} />
          <Route path="draw" element={<Draw />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
