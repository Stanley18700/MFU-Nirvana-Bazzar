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
import Invite from './pages/visitor/Invite'

import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ForgotPassword from './pages/auth/ForgotPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import Action from './pages/auth/Action'
import Account from './pages/auth/Account'

import Booth from './pages/organizer/Booth'
import BoothStats from './pages/organizer/BoothStats'
import Redeem from './pages/organizer/Redeem'
import RedeemLanding from './pages/organizer/RedeemLanding'

import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import EventAdmin from './pages/admin/Event'
import RefData from './pages/admin/RefData'
import Users from './pages/admin/Users'
import Booths from './pages/admin/Booths'
import Prizes from './pages/admin/Prizes'
import Draw from './pages/admin/Draw'
import Audit from './pages/admin/Audit'
import Wall from './pages/admin/Wall'
import Print from './pages/admin/Print'
import Setup from './pages/admin/Setup'

/**
 * Everything past this point needs a real, confirmed account — anonymous sign-in is gone (§4.1),
 * so an unknown visitor is sent to sign in and an unconfirmed address to the waiting room.
 * `from` carries them back to the booth QR or prize page they were actually after.
 */
function RequireUser({ children }: { children?: React.ReactNode }) {
  const { ready, user, emailVerified } = useAuth()
  const loc = useLocation()
  const here = loc.pathname + loc.search
  if (!ready) return <Spinner label="Opening your passport…" />
  if (!user) return <Navigate to="/signin" state={{ from: here }} replace />
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: here }} replace />
  return children ? <>{children}</> : <Outlet />
}

function Guard({ roles, children }: { roles: Role[]; children?: React.ReactNode }) {
  const { ready, user, emailVerified, role } = useAuth()
  const loc = useLocation()
  const here = loc.pathname + loc.search
  if (!ready) return <Spinner label="Opening your passport…" />
  if (!user) return <Navigate to="/signin" state={{ from: here }} replace />
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: here }} replace />
  if (!role || !roles.includes(role)) {
    // Signed in but not registered yet: fill in the passport form, then come back here (§4.3).
    if (roles.includes('visitor') && !role) return <Navigate to="/join" state={{ from: here }} replace />
    return <Navigate to="/" replace />
  }
  return children ? <>{children}</> : <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      {/* Firebase Auth's verify / reset / email-change links land here (see SETUP.md). */}
      <Route path="/auth/action" element={<Action />} />
      <Route path="/account" element={<Account />} />
      {/* "Restore my passport" was the anonymous-era flow; signing in is the restore now. */}
      <Route path="/restore" element={<Navigate to="/signin" replace />} />

      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/s/:token" element={<ScanLanding />} />
      <Route path="/r/:token" element={<RedeemLanding />} />
      <Route path="/setup" element={<Setup />} />

      <Route element={<RequireUser />}>
        <Route path="/join" element={<Join />} />
      </Route>

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
        {/* Print view lives outside AdminLayout so no sidebar or day tabs reach the paper. */}
        <Route path="/admin/print" element={<Print />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="event" element={<EventAdmin />} />
          <Route path="booths" element={<Booths />} />
          <Route path="prizes" element={<Prizes />} />
          <Route path="refdata" element={<RefData />} />
          <Route path="draw" element={<Draw />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
