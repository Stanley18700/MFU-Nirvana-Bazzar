import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { BackLink, Notice, Spinner } from '../../components/ui'
import { FestivalBackdrop } from '../auth/parts'

/**
 * §4.4 — `/r/<payload>`: the visitor's redemption QR opened with the phone's native camera
 * app rather than the in-app scanner on /redeem. Hands the payload to the prize desk screen.
 */
export default function RedeemLanding() {
  const { token = '' } = useParams()
  const { ready, user, role } = useAuth()

  if (!ready) return <Spinner label="Checking…" page />
  // A prize-desk device that has been signed out: sign in, then land back on this code.
  if (!user) return <Navigate to="/signin" state={{ from: `/r/${token}` }} replace />
  if (role === 'organizer' || role === 'admin') {
    return <Navigate to={`/redeem?code=${encodeURIComponent(token)}`} replace />
  }

  // A visitor scanned their own code. Nothing to do here but say so.
  // Whoever reaches this is a visitor holding their own code, so it stands on the passport's sky
  // rather than the dark ground the staff screens used to share.
  return (
    <><FestivalBackdrop hills={false} /><main className="relative mx-auto min-h-full max-w-md p-4 text-ink">
      <header className="flex items-center justify-between px-1 py-3">
        <BackLink to="/passport">Passport</BackLink>
        <div className="stamp-text text-ink-soft">Redemption code</div>
        <span className="w-16" />
      </header>
      <div className="card">
        <Notice>Show this code to the prize desk — they scan it from their own device. Open
          <Link to="/passport/prize" className="link"> your prize page</Link> to display it.</Notice>
      </div>
    </main></>
  )
}
