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

  /**
   * One centred column on every width. On a phone the three blocks are pushed apart so the
   * buttons sit under the thumb; from `sm` up they close into a single centred group, because
   * `justify-between` on a tall desktop window strands the heading and the buttons at opposite
   * edges of the screen. `gap` is the floor either way, so nothing ever collides.
   */
  return (
    <><div className="fixed inset-0 -z-10 bg-navy" aria-hidden /><main className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-between gap-8 bg-navy px-6 py-10 text-center text-paper sm:max-w-lg sm:justify-center sm:gap-14 sm:py-16">
      <div className="page-in">
        <div className="stamp-text text-gold">Mae Fah Luang University</div>
        {/* An event name is admin-typed and any length, so let it balance across lines. */}
        <h1 className="mt-2 text-balance text-3xl font-bold leading-tight sm:text-4xl">{event.nameEn}</h1>
        <p className="mt-2 text-sm text-paper/70 sm:text-base">{eventDateLine(event)}</p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <Crest className="h-32 w-32 text-gold xs:h-40 xs:w-40" />
        <div>
          <div className="stamp-text text-gold">Digital passport</div>
          <p className="mt-2 max-w-xs text-pretty text-paper/80 sm:max-w-sm">
            Collect a stamp at every booth with your own phone, earn points, and trade them for a prize.
          </p>
        </div>
      </div>

      {/* Capped rather than full-width: a 32rem gold button reads as a banner, not a button. */}
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link to="/signup" className="btn-gold py-3.5 text-lg">Start your passport</Link>
        <Link to="/signin" className="btn-dark py-3.5">I already have a passport</Link>
        <p className="mt-2 text-xs text-paper/50">Sign in with Google or an email · works in your browser · under a minute</p>
      </div>
    </main></>
  )
}
