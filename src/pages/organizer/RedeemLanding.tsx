import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Notice, Spinner } from '../../components/ui'

/**
 * §4.4 — `/r/<payload>`: the visitor's redemption QR opened with the phone's native camera
 * app rather than the in-app scanner on /redeem. Hands the payload to the prize desk screen.
 */
export default function RedeemLanding() {
  const { token = '' } = useParams()
  const { ready, user, role } = useAuth()

  if (!ready) return <Spinner label="Checking…" />
  // A prize-desk device that has been signed out: sign in, then land back on this code.
  if (!user) return <Navigate to="/signin" state={{ from: `/r/${token}` }} replace />
  if (role === 'organizer' || role === 'admin') {
    return <Navigate to={`/redeem?code=${encodeURIComponent(token)}`} replace />
  }

  // A visitor scanned their own code. Nothing to do here but say so.
  return (
    <><div className="fixed inset-0 -z-10 bg-navy-deep" aria-hidden /><main className="mx-auto min-h-full max-w-md bg-navy-deep p-4 text-paper">
      <header className="flex items-center justify-between px-1 py-3">
        <Link to="/passport" className="text-sm text-paper/70">← Passport</Link>
        <div className="stamp-text text-gold">Redemption code</div>
        <span className="w-16" />
      </header>
      <div className="rounded-3xl bg-paper p-6 text-navy">
        <Notice>Show this code to the prize desk — they scan it from their own device. Open
          <Link to="/passport/prize" className="underline"> your prize page</Link> to display it.</Notice>
      </div>
    </main></>
  )
}
