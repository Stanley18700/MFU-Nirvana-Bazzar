import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { Crest, Spinner } from '../../components/ui'

export default function Landing() {
  const { ready, user, emailVerified, role } = useAuth()
  const event = useEvent()
  if (!ready) return <Spinner label="Opening your passport…" />
  if (role === 'visitor') return <Navigate to="/passport" replace />
  if (role === 'organizer') return <Navigate to="/booth" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  // Signed in but stopped halfway: finish confirming the address, or finish the form.
  if (user && !emailVerified) return <Navigate to="/verify-email" replace />
  if (user) return <Navigate to="/join" replace />

  return (
    <><div className="fixed inset-0 -z-10 bg-navy" aria-hidden /><main className="mx-auto flex min-h-full max-w-md flex-col justify-between bg-navy px-6 py-10 text-paper">
      <div className="page-in">
        <div className="stamp-text text-gold">Mae Fah Luang University</div>
        <h1 className="mt-2 text-3xl font-bold leading-tight">{event.nameEn}</h1>
        <p className="mt-2 text-paper/70">{eventDateLine(event)}</p>
      </div>

      <div className="flex flex-col items-center gap-6 py-8">
        <Crest className="h-40 w-40 text-gold" />
        <div className="text-center">
          <div className="stamp-text text-gold">Digital passport</div>
          <p className="mt-2 max-w-xs text-paper/80">
            Collect a stamp at every booth with your own phone, earn points, and trade them for a prize.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/signup" className="btn-gold py-3.5 text-lg">Start your passport</Link>
        <Link to="/signin" className="btn-dark py-3.5">I already have a passport</Link>
        <p className="mt-4 text-center text-xs text-paper/50">Sign in with Google or an email · works in your browser · under a minute</p>
      </div>
    </main></>
  )
}
