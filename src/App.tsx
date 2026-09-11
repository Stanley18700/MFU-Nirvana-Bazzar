import { lazy, Suspense } from 'react'
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
import Survey from './pages/visitor/Survey'

import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ForgotPassword from './pages/auth/ForgotPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import Action from './pages/auth/Action'
import Account from './pages/auth/Account'

/**
 * The visitor screens above are imported eagerly: a visitor arrives by scanning a QR code on
 * a phone, on event Wi-Fi, and the landing page is the whole first impression.
 *
 * Everything below is for staff, and none of it is on that path. Imported eagerly it was not
 * merely downloaded too — it decided the size of the entry chunk, and because five of these
 * screens draw charts, it pulled recharts in with it. `manualChunks` in vite.config.ts names
 * a charts chunk but cannot defer one: a static import is a static import, so the entry
 * chunk imported it and index.html preloaded it. Roughly 1.6MB before the landing page
 * painted, for a visitor who will never open any of it.
 *
 * `lazy` is what actually defers them. Staff screens are opened once and kept open, so the
 * one-off load is paid by the people who can afford it.
 */
const Booth = lazy(() => import('./pages/organizer/Booth'))
const BoothStats = lazy(() => import('./pages/organizer/BoothStats'))
const Redeem = lazy(() => import('./pages/organizer/Redeem'))
const BoothSurvey = lazy(() => import('./pages/organizer/Survey'))
const BoothSurveyResults = lazy(() => import('./pages/organizer/SurveyResults'))
const RedeemLanding = lazy(() => import('./pages/organizer/RedeemLanding'))

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const EventAdmin = lazy(() => import('./pages/admin/Event'))
const RefData = lazy(() => import('./pages/admin/RefData'))
const Users = lazy(() => import('./pages/admin/Users'))
const Booths = lazy(() => import('./pages/admin/Booths'))
const Prizes = lazy(() => import('./pages/admin/Prizes'))
const Draw = lazy(() => import('./pages/admin/Draw'))
const Audit = lazy(() => import('./pages/admin/Audit'))
const Wall = lazy(() => import('./pages/admin/Wall'))
const Print = lazy(() => import('./pages/admin/Print'))
const BoothCards = lazy(() => import('./pages/admin/BoothCards'))
const Setup = lazy(() => import('./pages/admin/Setup'))

/**
 * Everything past this point needs a real, confirmed account — anonymous sign-in is gone (§4.1),
 * so an unknown visitor is sent to sign in and an unconfirmed address to the waiting room.
 * `from` carries them back to the booth QR or prize page they were actually after.
 */
function RequireUser({ children }: { children?: React.ReactNode }) {
  const { ready, user, emailVerified } = useAuth()
  const loc = useLocation()
  const here = loc.pathname + loc.search
  if (!ready) return <Spinner label="Opening your passport…" page />
  if (!user) return <Navigate to="/signin" state={{ from: here }} replace />
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: here }} replace />
  return children ? <>{children}</> : <Outlet />
}

function Guard({ roles, children }: { roles: Role[]; children?: React.ReactNode }) {
  const { ready, user, emailVerified, role } = useAuth()
  const loc = useLocation()
  const here = loc.pathname + loc.search
  if (!ready) return <Spinner label="Opening your passport…" page />
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
    // One boundary for the lazy staff screens below. The visitor routes are eager, so a
    // visitor never waits on it.
    <Suspense fallback={<Spinner label="Opening…" page />}>
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
            {/* The Profile tab. Same component as /account, inside the shell so the bar stays put —
                a tab that navigates out of its own tab bar is the thing this replaces. */}
            <Route path="account" element={<Account variant="passport" />} />
          </Route>
          <Route path="/scan" element={<Scan />} />
          {/* Offered after a stamp; the stamp and points are already saved by then. */}
          <Route path="/survey/:boothId" element={<Survey />} />
        </Route>

        <Route element={<Guard roles={['organizer', 'admin']} />}>
          <Route path="/booth" element={<Booth />} />
          <Route path="/booth/stats" element={<BoothStats />} />
          <Route path="/booth/survey" element={<BoothSurvey />} />
          <Route path="/booth/survey/results" element={<BoothSurveyResults />} />
          <Route path="/redeem" element={<Redeem />} />
        </Route>

        <Route element={<Guard roles={['admin']} />}>
          <Route path="/admin/wall" element={<Wall />} />
          {/* Print view lives outside AdminLayout so no sidebar or day tabs reach the paper. */}
          <Route path="/admin/print" element={<Print />} />
          <Route path="/admin/booth-cards" element={<BoothCards />} />
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
    </Suspense>
  )
}
